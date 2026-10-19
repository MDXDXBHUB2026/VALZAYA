import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@valzaya/core/db';
import { getPublicEnv } from '../env';
import {
  matchesGender,
  summarise,
  type CatalogueDrop,
  type CatalogueProduct,
  type CatalogueSource,
  type CatalogueVariant,
} from './types';

const PUBLISHED_DROP = ['scheduled', 'early_access', 'open'] as const;
const PRODUCT_COLUMNS =
  'id, slug, style_code, gender, name_en, name_ar, description_en, description_ar, fabric, care_en, care_ar, origin_country, ' +
  'product_variants (id, sku, size, colour_code, colour_en, colour_ar, price_fils, stock_mode, preorder_ship_date, sort_order)';

type DropRow = Database['public']['Tables']['drops']['Row'];

function toDrop(d: DropRow): CatalogueDrop {
  return {
    id: d.id,
    number: d.number,
    slug: d.slug,
    titleEn: d.title_en,
    titleAr: d.title_ar,
    earlyAccessAt: d.early_access_at,
    opensAt: d.opens_at,
    closesAt: d.closes_at,
    unitCap: d.unit_cap,
  };
}

/**
 * Read-only catalogue with the anon key: RLS shows only active products/variants and published
 * drops, and stock is read through variant_availability() (booleans, never counts).
 */
export function createSupabaseCatalogue(): CatalogueSource {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = getPublicEnv();
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function products(slugs?: string[]) {
    let query = db.from('products').select(PRODUCT_COLUMNS).order('style_code');
    if (slugs) query = query.in('slug', slugs);
    const { data, error } = await query.overrideTypes<
      (Database['public']['Tables']['products']['Row'] & {
        product_variants: Database['public']['Tables']['product_variants']['Row'][];
      })[],
      { merge: false }
    >();
    if (error) throw new Error(`catalogue query failed: ${error.code || error.message}`);
    return data;
  }

  return {
    async isStoreOpen() {
      const { data, error } = await db
        .from('settings')
        .select('value')
        .eq('key', 'store.open')
        .maybeSingle();
      if (error) throw new Error(`settings query failed: ${error.code || error.message}`);
      return data?.value === true;
    },

    async listProducts(filter) {
      let slugs: string[] | undefined;
      if (filter.dropSlug) {
        const drop = await this.getDrop(filter.dropSlug);
        if (!drop) return [];
        const { data, error } = await db
          .from('drop_items')
          .select('product_variants (products (slug))')
          .eq('drop_id', drop.id)
          .overrideTypes<
            { product_variants: { products: { slug: string } | null } | null }[],
            { merge: false }
          >();
        if (error) throw new Error(`drop items query failed: ${error.code || error.message}`);
        slugs = [
          ...new Set(
            data.flatMap((r) =>
              r.product_variants?.products ? [r.product_variants.products.slug] : [],
            ),
          ),
        ];
        if (slugs.length === 0) return [];
      }
      const rows = await products(slugs);
      return rows
        .filter((p) => matchesGender(p.gender, filter.gender) && p.product_variants.length > 0)
        .map((p) => summarise(mapProduct(p, new Map())));
    },

    async getProduct(slug) {
      const [row] = await products([slug]);
      if (!row || row.product_variants.length === 0) return null;
      const { data, error } = await db.rpc('variant_availability', { p_product_id: row.id });
      if (error) throw new Error(`availability query failed: ${error.code || error.message}`);
      return mapProduct(row, new Map(data.map((a) => [a.variant_id, a.available])));
    },

    async getDrop(slug) {
      const { data, error } = await db
        .from('drops')
        .select('*')
        .eq('slug', slug)
        .in('status', [...PUBLISHED_DROP])
        .maybeSingle();
      if (error) throw new Error(`drop query failed: ${error.code || error.message}`);
      return data ? toDrop(data) : null;
    },

    async getCurrentDrop() {
      const { data, error } = await db
        .from('drops')
        .select('*')
        .in('status', [...PUBLISHED_DROP])
        .order('number')
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`drop query failed: ${error.code || error.message}`);
      return data ? toDrop(data) : null;
    },
  };
}

function mapProduct(
  p: Database['public']['Tables']['products']['Row'] & {
    product_variants: Database['public']['Tables']['product_variants']['Row'][];
  },
  availability: Map<string, boolean>,
): CatalogueProduct {
  const variants: CatalogueVariant[] = p.product_variants
    .map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      colourCode: v.colour_code,
      colourEn: v.colour_en,
      colourAr: v.colour_ar,
      priceFils: Number(v.price_fils),
      stockMode: v.stock_mode,
      preorderShipDate: v.preorder_ship_date,
      // Listing pages don't need availability; the product page always fetches it.
      available: availability.get(v.id) ?? true,
      sortOrder: v.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id: p.id,
    slug: p.slug,
    styleCode: p.style_code,
    gender: p.gender,
    nameEn: p.name_en,
    nameAr: p.name_ar,
    descriptionEn: p.description_en,
    descriptionAr: p.description_ar,
    fabric: p.fabric,
    careEn: p.care_en,
    careAr: p.care_ar,
    originCountry: p.origin_country,
    variants,
  };
}
