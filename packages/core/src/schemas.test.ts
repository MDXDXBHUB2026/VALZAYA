import { describe, expect, it } from 'vitest';
import { buildSku, formatOrderNumber, orderNumberSchema, skuSchema } from './schemas';

describe('SKU', () => {
  it('accepts the VZ-<style>-<colour>-<size> pattern', () => {
    expect(skuSchema.safeParse('VZ-MLS01-SAND-XL').success).toBe(true);
    expect(buildSku('wlc01', 'olive', 'xxl')).toBe('VZ-WLC01-OLIVE-XXL');
  });

  it('rejects malformed SKUs', () => {
    for (const bad of [
      'MLS01-SAND-XL',
      'VZ-MLS01-SAND',
      'vz-mls01-sand-xl',
      'VZ-M-SAND-XL',
      'VZ-MLS01-SAND-XL-1',
    ]) {
      expect(skuSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('order numbers', () => {
  it('formats with VZ- and 6-digit padding', () => {
    expect(formatOrderNumber(1)).toBe('VZ-000001');
    expect(formatOrderNumber(1_234_567)).toBe('VZ-1234567');
    expect(orderNumberSchema.safeParse('VZ-000001').success).toBe(true);
    expect(orderNumberSchema.safeParse('VZ-1').success).toBe(false);
  });

  it('rejects invalid sequences', () => {
    expect(() => formatOrderNumber(0)).toThrow(RangeError);
    expect(() => formatOrderNumber(1.5)).toThrow(RangeError);
  });
});
