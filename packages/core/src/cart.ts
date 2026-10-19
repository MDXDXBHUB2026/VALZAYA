import { z } from 'zod';
import { lineTotals, sumLines, UAE_VAT_RATE_BP, type LineTotals, type OrderTotals } from './money';

/** Per-line quantity limit; mirrors the CHECK on cart_items.quantity and the cart functions. */
export const CART_MAX_QUANTITY = 10;

/** Guest cart cookie: an opaque random token. Only its SHA-256 hex is stored (carts.guest_token_hash). */
export const GUEST_TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;
export const TOKEN_HASH_REGEX = /^[0-9a-f]{64}$/;

const variantId = z.string().trim().min(1).max(64);

/** Add-to-bag form: one variant, 1..10 units (default 1). */
export const addToCartSchema = z.object({
  variantId,
  quantity: z.coerce.number().int().min(1).max(CART_MAX_QUANTITY).default(1),
});

/** Bag line form: new quantity, 0 removes the line. */
export const setQuantitySchema = z.object({
  variantId,
  quantity: z.coerce.number().int().min(0).max(CART_MAX_QUANTITY),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type SetQuantityInput = z.infer<typeof setQuantitySchema>;

/** Reads a FormData-like object into a plain record of its string fields. */
export function formFields(form: { get(name: string): unknown }, names: readonly string[]) {
  const out: Record<string, string | undefined> = {};
  for (const n of names) {
    const v = form.get(n);
    out[n] = typeof v === 'string' && v !== '' ? v : undefined;
  }
  return out;
}

export interface CartLineInput {
  unitPriceFils: number;
  quantity: number;
}

export interface CartTotals extends OrderTotals {
  lines: LineTotals[];
  itemCount: number;
}

/**
 * Bag totals: prices are VAT-inclusive, VAT is split per line (as order_items stores it) and
 * summed. Same maths the order will use at checkout, so the bag never shows a different total.
 */
export function cartTotals(lines: readonly CartLineInput[], rateBp = UAE_VAT_RATE_BP): CartTotals {
  const split = lines.map((l) => lineTotals(l.unitPriceFils, l.quantity, rateBp));
  return {
    ...sumLines(split),
    lines: split,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
  };
}
