import { z } from 'zod';
import { cartTotals, type CartLineInput, type CartTotals } from './cart';
import { splitInclusive, UAE_VAT_RATE_BP, type VatSplit } from './money';
import { UAE_EMIRATES } from './schemas';
import { normalizePhone } from './waitlist';

export const DELIVERY_OPTIONS = ['standard', 'express'] as const;
export type DeliveryOption = (typeof DELIVERY_OPTIONS)[number];

/**
 * settings.shipping.rates: per country, VAT-inclusive fils per delivery option. A country that is
 * missing (or null) is not shipped to. Today: AE only.
 */
export const shippingRatesSchema = z.record(
  z.string(),
  z
    .object({
      standard_fils: z.number().int().nonnegative(),
      express_fils: z.number().int().nonnegative(),
    })
    .nullable(),
);
export type ShippingRates = z.infer<typeof shippingRatesSchema>;

export function shippingFils(
  rates: ShippingRates,
  country: string,
  delivery: DeliveryOption,
): number | null {
  const rate = rates[country.toUpperCase()];
  return rate ? rate[`${delivery}_fils`] : null;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Checkout form (UAE delivery). The phone is required: couriers call before delivery. The
 * address is stored on the order as a snapshot (orders.shipping_address).
 */
export const checkoutSchema = z.object({
  email: z.email().max(254),
  phone: z.string().transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) ctx.addIssue({ code: 'custom', message: 'phone_invalid' });
    return e164 ?? '';
  }),
  recipientName: text(200),
  line1: text(300),
  line2: optionalText(300),
  area: optionalText(120),
  city: text(120),
  emirate: z.enum(UAE_EMIRATES),
  delivery: z.enum(DELIVERY_OPTIONS),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutField = keyof CheckoutInput;

/** The order's shipping_address snapshot; keys mirror the addresses table. */
export function toShippingAddress(input: CheckoutInput) {
  return {
    recipient_name: input.recipientName,
    phone: input.phone,
    line1: input.line1,
    ...(input.line2 ? { line2: input.line2 } : {}),
    ...(input.area ? { area: input.area } : {}),
    city: input.city,
    emirate: input.emirate,
    country_code: 'AE',
  };
}

export interface CheckoutTotals extends CartTotals {
  shipping: VatSplit;
}

/**
 * Order summary at checkout: the bag lines plus VAT-inclusive shipping, with VAT split per line
 * and on shipping, exactly as create_order_from_cart() stores it. Display only: the database
 * recomputes every number from its own prices.
 */
export function checkoutTotals(
  lines: readonly CartLineInput[],
  shippingGrossFils: number,
  rateBp = UAE_VAT_RATE_BP,
): CheckoutTotals {
  const bag = cartTotals(lines, rateBp);
  const shipping = splitInclusive(shippingGrossFils, rateBp);
  return {
    ...bag,
    shipping,
    subtotalNetFils: bag.subtotalNetFils + shipping.netFils,
    vatFils: bag.vatFils + shipping.vatFils,
    totalFils: bag.totalFils + shipping.grossFils,
  };
}
