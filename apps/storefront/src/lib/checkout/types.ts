import type {
  CheckoutInput,
  PaymentProviderId,
  ShippingRates,
  VerifiedPaymentEvent,
} from '@valzaya/core';
import type { StockMode } from '../catalogue';

export interface OrderLine {
  sku: string;
  nameEn: string;
  nameAr: string | null;
  colourEn: string;
  colourAr: string | null;
  size: string;
  quantity: number;
  unitPriceFils: number;
  lineTotalFils: number;
  stockMode: StockMode;
  preorderShipDate: string | null;
}

/** What the order page shows. Amounts are VAT-inclusive fils as stored on the order. */
export interface OrderSummary {
  id: string;
  number: string;
  status: string;
  locale: 'en' | 'ar';
  email: string;
  totalFils: number;
  vatFils: number;
  shippingFils: number;
  deliveryPromiseDate: string | null;
  shippingAddress: Record<string, string>;
  lines: OrderLine[];
}

export type CreateOrderResult =
  | { status: 'ok'; orderId: string; orderNumber: string; totalFils: number }
  /** reason: empty_cart | shipping_unavailable | not_on_sale | out_of_stock | variant_cap | drop_cap */
  | { status: 'refused'; reason: string };

export type PaymentEventResult = 'processed' | 'duplicate' | 'unknown_payment' | 'ignored';

/** Checkout persistence, server-side only. Supabase calls the B4a functions as the service role. */
export interface CheckoutBackend {
  shippingRates(): Promise<ShippingRates>;
  createOrder(
    tokenHash: string,
    input: CheckoutInput,
    locale: 'en' | 'ar',
  ): Promise<CreateOrderResult>;
  recordPaymentSession(
    orderId: string,
    provider: PaymentProviderId,
    providerRef: string,
  ): Promise<void>;
  applyPaymentEvent(
    provider: PaymentProviderId,
    event: VerifiedPaymentEvent,
  ): Promise<PaymentEventResult>;
  getOrder(orderNumber: string): Promise<OrderSummary | null>;
  /** Cancels unpaid orders past the payment window; returns how many. */
  expireUnpaid(): Promise<number>;
  /** Server secret for order links and mock webhook signatures. */
  secret(): Promise<string>;
}
