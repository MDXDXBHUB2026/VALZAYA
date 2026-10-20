import 'server-only';
import { checkoutTotals, shippingFils, toShippingAddress, type ShippingRates } from '@valzaya/core';
import { getCartBackend } from '../cart';
import { closeMemoryCart } from '../cart/memory-backend';
import type { CheckoutBackend, OrderSummary } from './types';

/**
 * In-memory checkout for e2e tests and credential-free previews, mirroring the B4a functions:
 * prices from the catalogue, VAT split per line and on shipping, idempotent payment events.
 * Never used on Vercel.
 */
const RATES: ShippingRates = { AE: { standard_fils: 0, express_fils: 3500 }, international: null };

interface MemoryOrder extends OrderSummary {
  payments: Map<string, string>;
}
interface MemoryState {
  orders: Map<string, MemoryOrder>;
  events: Set<string>;
  seq: number;
}
const g = globalThis as typeof globalThis & { __valzayaCheckout?: MemoryState };
function state(): MemoryState {
  g.__valzayaCheckout ??= { orders: new Map(), events: new Set(), seq: 0 };
  return g.__valzayaCheckout;
}

export function createMemoryCheckoutBackend(): CheckoutBackend {
  return {
    async shippingRates() {
      return RATES;
    },

    async createOrder(tokenHash, input, locale) {
      const lines = await getCartBackend().getLines(tokenHash);
      if (lines.length === 0) return { status: 'refused', reason: 'empty_cart' };
      const ship = shippingFils(RATES, 'AE', input.delivery);
      if (ship === null) return { status: 'refused', reason: 'shipping_unavailable' };
      if (lines.some((l) => !l.available)) return { status: 'refused', reason: 'out_of_stock' };

      const totals = checkoutTotals(lines, ship);
      const s = state();
      s.seq += 1;
      const number = `VZ-${String(s.seq).padStart(6, '0')}`;
      const order: MemoryOrder = {
        id: `memory-order-${s.seq}`,
        number,
        status: 'pending_payment',
        locale,
        email: input.email,
        totalFils: totals.totalFils,
        vatFils: totals.vatFils,
        shippingFils: ship,
        deliveryPromiseDate:
          lines
            .map((l) => l.preorderShipDate)
            .filter((d): d is string => d !== null)
            .sort()
            .at(-1) ?? null,
        shippingAddress: toShippingAddress(input),
        lines: lines.map((l, i) => ({
          sku: l.sku,
          nameEn: l.nameEn,
          nameAr: l.nameAr,
          colourEn: l.colourEn,
          colourAr: l.colourAr,
          size: l.size,
          quantity: l.quantity,
          unitPriceFils: l.unitPriceFils,
          lineTotalFils: totals.lines[i]?.grossFils ?? 0,
          stockMode: l.stockMode,
          preorderShipDate: l.preorderShipDate,
        })),
        payments: new Map(),
      };
      s.orders.set(number, order);
      closeMemoryCart(tokenHash);
      return { status: 'ok', orderId: order.id, orderNumber: number, totalFils: order.totalFils };
    },

    async recordPaymentSession(orderId, _provider, providerRef) {
      const order = [...state().orders.values()].find((o) => o.id === orderId);
      if (!order || order.status !== 'pending_payment')
        throw new Error('order is not awaiting payment');
      order.payments.set(providerRef, 'pending');
    },

    async applyPaymentEvent(provider, event) {
      const s = state();
      const key = `${provider}:${event.eventId}`;
      if (s.events.has(key)) return 'duplicate';
      s.events.add(key);
      const order = [...s.orders.values()].find((o) => o.payments.has(event.providerRef));
      if (!order) return 'unknown_payment';
      const payment = order.payments.get(event.providerRef);
      if (payment !== 'pending') return 'ignored';
      order.payments.set(event.providerRef, event.outcome);
      if (order.status === 'pending_payment') {
        order.status = event.outcome === 'captured' ? 'paid' : 'cancelled';
      }
      return 'processed';
    },

    async getOrder(orderNumber) {
      const order = state().orders.get(orderNumber);
      if (!order) return null;
      const summary: OrderSummary = { ...order };
      delete (summary as Partial<MemoryOrder>).payments;
      return summary;
    },

    async expireUnpaid() {
      return 0;
    },

    async secret() {
      return 'memory-checkout-secret-not-secret';
    },
  };
}
