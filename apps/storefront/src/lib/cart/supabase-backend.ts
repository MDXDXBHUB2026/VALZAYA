import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@valzaya/core/db';
import { getPublicEnv } from '../env';
import { getServerEnv } from '../server-env';
import type { BagLine, CartBackend } from './types';

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const LINE_COLUMNS =
  'variant_id, quantity, product_variants (sku, size, colour_code, colour_en, colour_ar, price_fils, stock_mode, ' +
  'preorder_ship_date, product_id, products (slug, name_en, name_ar))';

interface LineRow {
  variant_id: string;
  quantity: number;
  product_variants: {
    sku: string;
    size: string;
    colour_code: string;
    colour_en: string;
    colour_ar: string | null;
    price_fils: number;
    stock_mode: BagLine['stockMode'];
    preorder_ship_date: string | null;
    product_id: string;
    products: { slug: string; name_en: string; name_ar: string | null } | null;
  } | null;
}

/**
 * Guest carts through the cart_* functions (service role only). The browser never talks to
 * these tables; it only holds the opaque cookie token whose hash addresses the cart.
 */
export function createSupabaseCartBackend(): CartBackend {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey } = getServerEnv();
  const db = createClient<Database>(url, serviceKey, NO_SESSION);

  async function cartId(tokenHash: string, create: boolean): Promise<string | null> {
    const { data, error } = await db.rpc('cart_for_guest', {
      p_token_hash: tokenHash,
      p_create: create,
    });
    if (error) throw new Error(`cart_for_guest failed: ${error.code || error.message}`);
    return data;
  }

  return {
    hashSecret: serviceKey,

    async getLines(tokenHash) {
      const id = await cartId(tokenHash, false);
      if (!id) return [];
      const { data, error } = await db
        .from('cart_items')
        .select(LINE_COLUMNS)
        .eq('cart_id', id)
        .order('added_at')
        .overrideTypes<LineRow[], { merge: false }>();
      if (error) throw new Error(`cart lines query failed: ${error.code || error.message}`);

      // Availability per product, exactly as the product page shows it (inactive -> absent).
      const available = new Map<string, boolean>();
      const productIds = [
        ...new Set(
          data.flatMap((r) => (r.product_variants ? [r.product_variants.product_id] : [])),
        ),
      ];
      await Promise.all(
        productIds.map(async (pid) => {
          const res = await db.rpc('variant_availability', { p_product_id: pid });
          if (res.error)
            throw new Error(`availability query failed: ${res.error.code || res.error.message}`);
          for (const a of res.data) available.set(a.variant_id, a.available);
        }),
      );

      return data.flatMap((r): BagLine[] => {
        const v = r.product_variants;
        if (!v?.products) return [];
        return [
          {
            variantId: r.variant_id,
            sku: v.sku,
            productSlug: v.products.slug,
            nameEn: v.products.name_en,
            nameAr: v.products.name_ar,
            colourCode: v.colour_code,
            colourEn: v.colour_en,
            colourAr: v.colour_ar,
            size: v.size,
            unitPriceFils: Number(v.price_fils),
            quantity: r.quantity,
            stockMode: v.stock_mode,
            preorderShipDate: v.preorder_ship_date,
            available: available.get(r.variant_id) ?? false,
          },
        ];
      });
    },

    async add(tokenHash, variantId, quantity) {
      const id = await cartId(tokenHash, true);
      if (!id) return 'closed';
      const { error } = await db.rpc('cart_add_item', {
        p_cart_id: id,
        p_variant_id: variantId,
        p_quantity: quantity,
      });
      // P0002: variant not on sale; 22P02: not a uuid (memory-style ids, tampered forms).
      if (error?.code === 'P0002' || error?.code === '22P02') return 'not_on_sale';
      if (error) throw new Error(`cart_add_item failed: ${error.code || error.message}`);
      return 'ok';
    },

    async setQuantity(tokenHash, variantId, quantity) {
      const id = await cartId(tokenHash, false);
      if (!id) return 'closed';
      const { error } = await db.rpc('cart_set_quantity', {
        p_cart_id: id,
        p_variant_id: variantId,
        p_quantity: quantity,
      });
      if (error?.code === '22P02') return 'ok';
      if (error) throw new Error(`cart_set_quantity failed: ${error.code || error.message}`);
      return 'ok';
    },

    async hitRateLimit(bucket, keyHash, max, windowSeconds) {
      const { data, error } = await db.rpc('hit_rate_limit', {
        p_bucket: bucket,
        p_key_hash: keyHash,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error(`hit_rate_limit failed: ${error.code || error.message}`);
      return data === true;
    },
  };
}
