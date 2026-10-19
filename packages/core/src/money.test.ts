import { describe, expect, it } from 'vitest';
import {
  UAE_VAT_RATE_BP,
  formatAed,
  lineTotals,
  parseAedToFils,
  splitInclusive,
  sumLines,
} from './money';

describe('splitInclusive', () => {
  it('splits a round 5% inclusive price exactly', () => {
    // 1050.00 AED gross -> 1000.00 net + 50.00 VAT
    expect(splitInclusive(105_000)).toEqual({
      netFils: 100_000,
      vatFils: 5_000,
      grossFils: 105_000,
    });
  });

  it('rounds net half-up and keeps net + vat === gross', () => {
    // 1295.00 AED: 129500 / 1.05 = 123333.33 -> 123333
    expect(splitInclusive(129_500)).toEqual({
      netFils: 123_333,
      vatFils: 6_167,
      grossFils: 129_500,
    });
    // 0.21 AED: 21 / 1.05 = 20 exactly
    expect(splitInclusive(21)).toEqual({ netFils: 20, vatFils: 1, grossFils: 21 });
    // 0.11 AED: 11 / 1.05 = 10.476 -> 10
    expect(splitInclusive(11)).toEqual({ netFils: 10, vatFils: 1, grossFils: 11 });
    // 0.31 AED: 31 / 1.05 = 29.524 -> 30 (rounds up)
    expect(splitInclusive(31)).toEqual({ netFils: 30, vatFils: 1, grossFils: 31 });
  });

  it('holds the invariant for a range of prices', () => {
    for (let g = 0; g <= 50_000; g += 7) {
      const s = splitInclusive(g);
      expect(s.netFils + s.vatFils).toBe(g);
      expect(Number.isInteger(s.netFils)).toBe(true);
      // VAT is within 1 fils of 5% of net (rounding)
      expect(Math.abs(s.vatFils - (s.netFils * UAE_VAT_RATE_BP) / 10_000)).toBeLessThanOrEqual(1);
    }
  });

  it('handles zero and 0% rate', () => {
    expect(splitInclusive(0)).toEqual({ netFils: 0, vatFils: 0, grossFils: 0 });
    expect(splitInclusive(1234, 0)).toEqual({ netFils: 1234, vatFils: 0, grossFils: 1234 });
  });

  it('rejects floats, negatives and bad rates', () => {
    expect(() => splitInclusive(10.5)).toThrow(TypeError);
    expect(() => splitInclusive(-1)).toThrow(RangeError);
    expect(() => splitInclusive(100, -1)).toThrow(RangeError);
    expect(() => splitInclusive(100, 2.5)).toThrow(RangeError);
  });
});

describe('lineTotals / sumLines', () => {
  it('splits VAT on the line gross, not per unit', () => {
    const l = lineTotals(31, 3); // 93 fils gross
    expect(l.grossFils).toBe(93);
    expect(l).toMatchObject(splitInclusive(93));
    expect(l.quantity).toBe(3);
    expect(l.vatRateBp).toBe(500);
  });

  it('rejects non-positive quantity', () => {
    expect(() => lineTotals(100, 0)).toThrow(RangeError);
    expect(() => lineTotals(100, 1.5)).toThrow(RangeError);
  });

  it('sums lines into order totals', () => {
    const totals = sumLines([lineTotals(129_500, 1), lineTotals(45_000, 2)]);
    expect(totals.totalFils).toBe(219_500);
    expect(totals.subtotalNetFils + totals.vatFils).toBe(totals.totalFils);
  });
});

describe('parseAedToFils', () => {
  it('parses decimal strings without floats', () => {
    expect(parseAedToFils('1295')).toBe(129_500);
    expect(parseAedToFils('1,295.5')).toBe(129_550);
    expect(parseAedToFils('0.07')).toBe(7);
    expect(parseAedToFils(' 10.10 ')).toBe(1_010);
  });

  it('rejects invalid input', () => {
    for (const bad of ['', '-1', '1.234', 'abc', '1.2.3']) {
      expect(() => parseAedToFils(bad)).toThrow(RangeError);
    }
  });
});

describe('formatAed', () => {
  it('formats fils as AED', () => {
    expect(formatAed(129_500)).toMatch(/1,295\.00/);
    expect(formatAed(5)).toMatch(/0\.05/);
  });
});
