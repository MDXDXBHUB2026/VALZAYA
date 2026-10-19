import { describe, expect, it } from 'vitest';
import { addToCartSchema, cartTotals, formFields, setQuantitySchema } from './cart';

describe('cartTotals', () => {
  it('is zero for an empty bag', () => {
    expect(cartTotals([])).toMatchObject({
      totalFils: 0,
      vatFils: 0,
      subtotalNetFils: 0,
      itemCount: 0,
    });
  });

  it('splits VAT out of inclusive prices per line and sums the lines', () => {
    // 1,450.00 x 2 = 2,900.00 gross -> net 2,761.90, VAT 138.10
    // 295.00 x 1 -> net 280.95, VAT 14.05
    const t = cartTotals([
      { unitPriceFils: 145_000, quantity: 2 },
      { unitPriceFils: 29_500, quantity: 1 },
    ]);
    expect(t.lines.map((l) => [l.netFils, l.vatFils, l.grossFils])).toEqual([
      [276_190, 13_810, 290_000],
      [28_095, 1_405, 29_500],
    ]);
    expect(t).toMatchObject({
      totalFils: 319_500,
      vatFils: 15_215,
      subtotalNetFils: 304_285,
      itemCount: 3,
    });
    expect(t.subtotalNetFils + t.vatFils).toBe(t.totalFils);
  });
});

describe('cart forms', () => {
  it('add: defaults to one unit and caps at 10', () => {
    expect(addToCartSchema.parse({ variantId: 'v1' })).toEqual({ variantId: 'v1', quantity: 1 });
    expect(addToCartSchema.safeParse({ variantId: 'v1', quantity: '11' }).success).toBe(false);
    expect(addToCartSchema.safeParse({ variantId: '', quantity: '1' }).success).toBe(false);
  });

  it('set: 0 removes, 1..10 sets, anything else is refused', () => {
    expect(setQuantitySchema.parse({ variantId: 'v1', quantity: '0' }).quantity).toBe(0);
    expect(setQuantitySchema.parse({ variantId: 'v1', quantity: '10' }).quantity).toBe(10);
    expect(setQuantitySchema.safeParse({ variantId: 'v1', quantity: '-1' }).success).toBe(false);
    expect(setQuantitySchema.safeParse({ variantId: 'v1', quantity: '2.5' }).success).toBe(false);
    expect(setQuantitySchema.safeParse({ variantId: 'v1' }).success).toBe(false);
  });

  it('formFields keeps non-empty strings only', () => {
    const fd = new FormData();
    fd.set('variantId', 'v1');
    fd.set('quantity', '');
    expect(formFields(fd, ['variantId', 'quantity', 'missing'])).toEqual({
      variantId: 'v1',
      quantity: undefined,
      missing: undefined,
    });
  });
});
