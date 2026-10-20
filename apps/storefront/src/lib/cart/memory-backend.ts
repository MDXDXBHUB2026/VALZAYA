import 'server-only';
import { CART_MAX_QUANTITY } from '@valzaya/core';
import { getCatalogue, type CatalogueProduct } from '../catalogue';
import type { BagLine, CartBackend } from './types';

/**
 * In-memory guest carts for e2e tests and credential-free previews, mirroring the cart_*
 * functions (lines capped at 10, inactive variants refused). Never used on Vercel.
 */
interface MemoryState {
  carts: Map<string, Map<string, number>>;
  /** Token hashes whose cart was checked out (like carts.status = 'converted'). */
  closed: Set<string>;
  hits: Map<string, number>;
}

const g = globalThis as typeof globalThis & { __valzayaCarts?: MemoryState };
function state(): MemoryState {
  g.__valzayaCarts ??= { carts: new Map(), closed: new Set(), hits: new Map() };
  return g.__valzayaCarts;
}

/** Memory catalogue variant ids look like "1-SAND-M": the product index comes first. */
async function findVariant(variantId: string) {
  const catalogue = getCatalogue();
  const products = await catalogue.listProducts({});
  for (const summary of products) {
    const product = await catalogue.getProduct(summary.slug);
    const variant = product?.variants.find((v) => v.id === variantId);
    if (product && variant) return { product, variant };
  }
  return null;
}

function toLine(product: CatalogueProduct, variantId: string, quantity: number): BagLine | null {
  const v = product.variants.find((x) => x.id === variantId);
  if (!v) return null;
  return {
    variantId,
    sku: v.sku,
    productSlug: product.slug,
    nameEn: product.nameEn,
    nameAr: product.nameAr,
    colourCode: v.colourCode,
    colourEn: v.colourEn,
    colourAr: v.colourAr,
    size: v.size,
    unitPriceFils: v.priceFils,
    quantity,
    stockMode: v.stockMode,
    preorderShipDate: v.preorderShipDate,
    available: v.available,
  };
}

export function createMemoryCartBackend(): CartBackend {
  return {
    hashSecret: 'memory-backend-not-secret',

    async getLines(tokenHash) {
      const cart = state().carts.get(tokenHash);
      if (!cart) return [];
      const lines: BagLine[] = [];
      for (const [variantId, quantity] of cart) {
        const found = await findVariant(variantId);
        const line = found && toLine(found.product, variantId, quantity);
        if (line) lines.push(line);
      }
      return lines;
    },

    async add(tokenHash, variantId, quantity) {
      if (state().closed.has(tokenHash)) return 'closed';
      if (!(await findVariant(variantId))) return 'not_on_sale';
      const carts = state().carts;
      const cart = carts.get(tokenHash) ?? new Map<string, number>();
      carts.set(tokenHash, cart);
      cart.set(variantId, Math.min((cart.get(variantId) ?? 0) + quantity, CART_MAX_QUANTITY));
      return 'ok';
    },

    async setQuantity(tokenHash, variantId, quantity) {
      if (state().closed.has(tokenHash)) return 'closed';
      const cart = state().carts.get(tokenHash);
      if (!cart?.has(variantId)) return 'ok';
      if (quantity === 0) cart.delete(variantId);
      else cart.set(variantId, quantity);
      return 'ok';
    },

    async hitRateLimit(bucket, keyHash, max, windowSeconds) {
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `${bucket}|${keyHash}|${window}`;
      const hits = (state().hits.get(key) ?? 0) + 1;
      state().hits.set(key, hits);
      return hits <= max;
    },
  };
}

/** Checkout in memory mode: the bag behind a token is closed, as create_order_from_cart does. */
export function closeMemoryCart(tokenHash: string): void {
  state().carts.delete(tokenHash);
  state().closed.add(tokenHash);
}
