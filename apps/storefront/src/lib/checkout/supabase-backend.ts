import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { shippingRatesSchema, toShippingAddress } from '@valzaya/core';
import type { Database } from '@valzaya/core/db';
import { getPublicEnv } from '../env';
import { getServerEnv } from '../server-env';
import { hmacHex } from '../waitlist/hash';
import type { CheckoutBackend, OrderSummary, PaymentEventResult } from './types';

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const ORDER_COLUMNS =
  'id, order_number, status, locale, email, total_fils, vat_fils, shipping_fils, delivery_promise_date, shipping_address, ' +
  'order_items (sku, product_name_en, product_name_ar, colour_en, colour_ar, size, quantity, unit_price_fils, line_total_fils, stock_mode, preorder_ship_date)';

type OrderRow = Database['public']['Tables']['orders']['Row'] & {
  order_items: Database['public']['Tables']['order_items']['Row'][];
};

/** Checkout through the B4a database functions, as the service role. */
export function createSupabaseCheckoutBackend(): CheckoutBackend {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey } = getServerEnv();
  const db = createClient<Database>(url, serviceKey, NO_SESSION);

  return {
    async shippingRates() {
      const { data, error } = await db
        .from('settings')
        .select('value')
        .eq('key', 'shipping.rates')
        .maybeSingle();
      if (error) throw new Error(`shipping rates query failed: ${error.code || error.message}`);
      return shippingRatesSchema.parse(data?.value ?? {});
    },

    async createOrder(tokenHash, input, locale) {
      const cart = await db.rpc('cart_for_guest', { p_token_hash: tokenHash, p_create: false });
      if (cart.error)
        throw new Error(`cart_for_guest failed: ${cart.error.code || cart.error.message}`);
      if (!cart.data) return { status: 'refused', reason: 'empty_cart' };

      const { data, error } = await db.rpc('create_order_from_cart', {
        p_cart_id: cart.data,
        p_email: input.email,
        p_phone: input.phone,
        p_locale: locale,
        p_shipping_address: toShippingAddress(input),
        p_delivery: input.delivery,
      });
      // P0002: the cart was checked out in a parallel request.
      if (error?.code === 'P0002') return { status: 'refused', reason: 'empty_cart' };
      if (error) throw new Error(`create_order_from_cart failed: ${error.code || error.message}`);
      const row = data[0];
      if (!row) throw new Error('create_order_from_cart returned no row');
      if (row.reason !== 'ok') return { status: 'refused', reason: row.reason };
      return {
        status: 'ok',
        orderId: row.order_id,
        orderNumber: row.order_number,
        totalFils: Number(row.total_fils),
      };
    },

    async recordPaymentSession(orderId, provider, providerRef) {
      const { error } = await db.rpc('record_payment_session', {
        p_order_id: orderId,
        p_provider: provider,
        p_provider_ref: providerRef,
      });
      if (error) throw new Error(`record_payment_session failed: ${error.code || error.message}`);
    },

    async applyPaymentEvent(provider, event) {
      const { data, error } = await db.rpc('apply_payment_event', {
        p_provider: provider,
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_payload:
          event.payload as Database['public']['Functions']['apply_payment_event']['Args']['p_payload'],
        p_provider_ref: event.providerRef,
        p_outcome: event.outcome,
      });
      if (error) throw new Error(`apply_payment_event failed: ${error.code || error.message}`);
      return data as PaymentEventResult;
    },

    async getOrder(orderNumber) {
      const { data, error } = await db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('order_number', orderNumber)
        .maybeSingle()
        .overrideTypes<OrderRow | null, { merge: false }>();
      if (error) throw new Error(`order query failed: ${error.code || error.message}`);
      if (!data) return null;
      const summary: OrderSummary = {
        id: data.id,
        number: data.order_number,
        status: data.status,
        locale: data.locale === 'ar' ? 'ar' : 'en',
        email: String(data.email),
        totalFils: Number(data.total_fils),
        vatFils: Number(data.vat_fils),
        shippingFils: Number(data.shipping_fils),
        deliveryPromiseDate: data.delivery_promise_date,
        shippingAddress: (data.shipping_address ?? {}) as Record<string, string>,
        lines: data.order_items.map((i) => ({
          sku: i.sku,
          nameEn: i.product_name_en,
          nameAr: i.product_name_ar,
          colourEn: i.colour_en,
          colourAr: i.colour_ar,
          size: i.size,
          quantity: i.quantity,
          unitPriceFils: Number(i.unit_price_fils),
          lineTotalFils: Number(i.line_total_fils),
          stockMode: i.stock_mode,
          preorderShipDate: i.preorder_ship_date,
        })),
      };
      return summary;
    },

    async expireUnpaid() {
      const { data, error } = await db.rpc('expire_unpaid_orders', { p_minutes: 30 });
      if (error) throw new Error(`expire_unpaid_orders failed: ${error.code || error.message}`);
      return data;
    },

    async secret() {
      // Derived, so no extra secret has to be configured; never the raw service key.
      return hmacHex(serviceKey, 'valzaya:checkout:v1');
    },
  };
}
