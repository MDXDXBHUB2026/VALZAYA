/**
 * Money helpers. All amounts are integer fils (1 AED = 100 fils). Never use floats for money.
 *
 * Consumer prices are VAT-inclusive (UAE VAT 5%). We store net, VAT and gross per line,
 * and derive net/VAT from the inclusive gross price, rounding half-up on the net amount.
 */

/** UAE standard VAT rate in basis points (500 bp = 5%). */
export const UAE_VAT_RATE_BP = 500;

export const CURRENCY = 'AED' as const;

export function assertFils(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer number of fils, got ${value}`);
  }
}

function assertNonNegativeFils(value: number, label: string): void {
  assertFils(value, label);
  if (value < 0) throw new RangeError(`${label} must be >= 0, got ${value}`);
}

function assertRateBp(rateBp: number): void {
  if (!Number.isSafeInteger(rateBp) || rateBp < 0 || rateBp > 10_000) {
    throw new RangeError(`VAT rate must be an integer in basis points 0..10000, got ${rateBp}`);
  }
}

export interface VatSplit {
  /** Amount excluding VAT, in fils. */
  netFils: number;
  /** VAT portion, in fils. */
  vatFils: number;
  /** VAT-inclusive amount, in fils (net + vat). */
  grossFils: number;
}

/**
 * Split a VAT-inclusive amount into net + VAT.
 * net = round_half_up(gross * 10000 / (10000 + rateBp)); vat = gross - net.
 * Pure integer arithmetic (via BigInt) so it is exact for any safe integer.
 */
export function splitInclusive(grossFils: number, rateBp: number = UAE_VAT_RATE_BP): VatSplit {
  assertNonNegativeFils(grossFils, 'grossFils');
  assertRateBp(rateBp);
  const gross = BigInt(grossFils);
  const denom = BigInt(10_000 + rateBp);
  // round half up: floor((2 * gross * 10000 + denom) / (2 * denom))
  const net = (2n * gross * 10_000n + denom) / (2n * denom);
  const netFils = Number(net);
  return { netFils, vatFils: grossFils - netFils, grossFils };
}

export interface LineTotals extends VatSplit {
  unitPriceFils: number;
  quantity: number;
  vatRateBp: number;
}

/** Totals for one order/cart line. VAT is split on the line gross (not per unit). */
export function lineTotals(
  unitPriceFils: number,
  quantity: number,
  rateBp: number = UAE_VAT_RATE_BP,
): LineTotals {
  assertNonNegativeFils(unitPriceFils, 'unitPriceFils');
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, got ${quantity}`);
  }
  const gross = unitPriceFils * quantity;
  assertFils(gross, 'line gross');
  return { ...splitInclusive(gross, rateBp), unitPriceFils, quantity, vatRateBp: rateBp };
}

export interface OrderTotals {
  subtotalNetFils: number;
  vatFils: number;
  totalFils: number;
}

/** Sum line totals. Order VAT is the sum of per-line VAT (matches what is stored per line). */
export function sumLines(lines: readonly VatSplit[]): OrderTotals {
  let subtotalNetFils = 0;
  let vatFils = 0;
  let totalFils = 0;
  for (const l of lines) {
    subtotalNetFils += l.netFils;
    vatFils += l.vatFils;
    totalFils += l.grossFils;
  }
  assertFils(totalFils, 'order total');
  return { subtotalNetFils, vatFils, totalFils };
}

/**
 * Parse a decimal AED string ("1295", "1295.5", "1,295.50") into fils without float maths.
 * Rejects more than 2 decimal places and negatives.
 */
export function parseAedToFils(input: string): number {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`invalid AED amount: "${input}"`);
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? '').padEnd(2, '0');
  const fils = Number(BigInt(whole) * 100n + BigInt(frac));
  assertFils(fils, 'parsed amount');
  return fils;
}

/** Display formatting only. Never feed the result back into calculations. */
export function formatAed(fils: number, locale: 'en-AE' | 'ar-AE' = 'en-AE'): string {
  assertFils(fils);
  const nf = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Intl accepts a decimal string, so build it from integers: no float rounding in display.
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(fils);
  const decimal = `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return nf.format(decimal as unknown as number);
}
