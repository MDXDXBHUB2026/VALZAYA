import { describe, expect, it } from 'vitest';
import {
  checkoutSchema,
  checkoutTotals,
  shippingFils,
  shippingRatesSchema,
  toShippingAddress,
} from './checkout';

const valid = {
  email: 'a@valzaya.test',
  phone: '050 123 4567',
  recipientName: 'Aisha',
  line1: 'Villa 1, Street 2',
  line2: '',
  area: 'Al Barsha',
  city: 'Dubai',
  emirate: 'dubai',
  delivery: 'express',
};

describe('checkoutTotals', () => {
  it('matches create_order_from_cart to the fils (same case as checkout.test.sql)', () => {
    // 2 x 105.00 + 1 x 200.00 + express 35.00
    const t = checkoutTotals(
      [
        { unitPriceFils: 10_500, quantity: 2 },
        { unitPriceFils: 20_000, quantity: 1 },
      ],
      3_500,
    );
    expect(t).toMatchObject({ totalFils: 44_500, subtotalNetFils: 42_381, vatFils: 2_119 });
    expect(t.shipping).toEqual({ netFils: 3_333, vatFils: 167, grossFils: 3_500 });
  });

  it('free shipping adds nothing', () => {
    const t = checkoutTotals([{ unitPriceFils: 10_500, quantity: 1 }], 0);
    expect(t).toMatchObject({ totalFils: 10_500, vatFils: 500 });
  });
});

describe('shipping rates', () => {
  const rates = shippingRatesSchema.parse({
    AE: { standard_fils: 0, express_fils: 3500 },
    international: null,
  });
  it('looks up a country and option', () => {
    expect(shippingFils(rates, 'ae', 'express')).toBe(3500);
    expect(shippingFils(rates, 'AE', 'standard')).toBe(0);
  });
  it('null or missing countries are not shipped to', () => {
    expect(shippingFils(rates, 'GB', 'standard')).toBeNull();
    expect(shippingFils(rates, 'international', 'standard')).toBeNull();
  });
});

describe('checkoutSchema', () => {
  it('accepts a UAE address and normalises the phone', () => {
    const r = checkoutSchema.parse(valid);
    expect(r.phone).toBe('+971501234567');
    expect(r.line2).toBeUndefined();
    expect(toShippingAddress(r)).toEqual({
      recipient_name: 'Aisha',
      phone: '+971501234567',
      line1: 'Villa 1, Street 2',
      area: 'Al Barsha',
      city: 'Dubai',
      emirate: 'dubai',
      country_code: 'AE',
    });
  });

  it('reports each invalid field', () => {
    const r = checkoutSchema.safeParse({
      ...valid,
      email: 'nope',
      phone: '12',
      line1: '  ',
      emirate: 'paris',
      delivery: 'drone',
    });
    expect(r.success).toBe(false);
    const fields = new Set(r.error?.issues.map((i) => i.path[0]));
    expect(fields).toEqual(new Set(['email', 'phone', 'line1', 'emirate', 'delivery']));
  });
});
