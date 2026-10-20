import 'server-only';
import {
  createMockPaymentProvider,
  type PaymentProvider,
  type VerifiedPaymentEvent,
} from '@valzaya/core';
import { isMemoryData } from '../data-mode';
import { getServerEnv } from '../server-env';
import { hmacHex } from '../waitlist/hash';
import { createMemoryCheckoutBackend } from './memory-backend';
import { createSupabaseCheckoutBackend } from './supabase-backend';
import type { CheckoutBackend, PaymentEventResult } from './types';

let backend: CheckoutBackend | undefined;

export function getCheckoutBackend(): CheckoutBackend {
  backend ??= isMemoryData() ? createMemoryCheckoutBackend() : createSupabaseCheckoutBackend();
  return backend;
}

/**
 * The payment provider for this deployment. Only the mock exists until a gateway is chosen and
 * documented (CLAUDE.md rule 5); it is refused on a production deployment.
 */
export async function getPaymentProvider(hostedPageUrl: string): Promise<PaymentProvider> {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('the mock payment provider is not allowed in production');
  }
  if (!isMemoryData() && getServerEnv().PAYMENT_PROVIDER_MODE !== 'mock') {
    throw new Error('no payment provider configured');
  }
  const secret = await getCheckoutBackend().secret();
  return createMockPaymentProvider({ secret, hostedPageUrl });
}

/**
 * The webhook path: verify the signature over the raw body, then apply the event (stored raw
 * and processed idempotently in the database). Shared by the HTTP route and the mock hosted page.
 */
export async function processPaymentWebhook(
  rawBody: string,
  headers: { get(name: string): string | null },
): Promise<{ status: 200; result: PaymentEventResult } | { status: 401 }> {
  const provider = await getPaymentProvider('https://webhook.invalid');
  const event: VerifiedPaymentEvent | null = await provider.handleWebhook(rawBody, headers);
  if (!event) return { status: 401 };
  const result = await getCheckoutBackend().applyPaymentEvent(provider.id, event);
  return { status: 200, result };
}

/** Unguessable link token for a guest's order page (HMAC of the order number). */
export async function orderLinkToken(orderNumber: string): Promise<string> {
  return (await hmacHex(await getCheckoutBackend().secret(), `order:${orderNumber}`)).slice(0, 32);
}

export async function verifyOrderLink(
  orderNumber: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token || !/^[0-9a-f]{32}$/.test(token)) return false;
  const expected = await orderLinkToken(orderNumber);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export type * from './types';
