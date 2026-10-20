'use server';

import {
  checkoutSchema,
  formFields,
  mockEventBody,
  MOCK_SIGNATURE_HEADER,
  ORDER_NUMBER_REGEX,
  signMockEvent,
} from '@valzaya/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getCartBackend } from '@/lib/cart';
import { readToken, sha256Hex } from '@/lib/cart/token';
import { isStoreOpen } from '@/lib/catalogue';
import {
  getCheckoutBackend,
  getPaymentProvider,
  orderLinkToken,
  processPaymentWebhook,
} from '@/lib/checkout';
import { clientIp } from '@/lib/client-ip';
import { siteOrigin } from '@/lib/site-origin';
import { hmacHex } from '@/lib/waitlist/hash';
import { CHECKOUT_FIELDS, type CheckoutState, type CheckoutValues } from './fields';

/** Order attempts per client IP: enough for typos, a ceiling for scripted orders. */
const CHECKOUT_RATE_LIMIT = { max: 10, windowSeconds: 600 } as const;
const MOCK_REF_REGEX = /^mock_[0-9a-f]{24}$/;

function localeOf(form: FormData): Locale {
  const value = form.get('locale');
  return typeof value === 'string' && isLocale(value) ? value : 'en';
}

/** Place the order (prices from the database) and send the shopper to the payment page. */
export async function placeOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const locale = localeOf(form);
  const raw = formFields(form, CHECKOUT_FIELDS);
  const values = Object.fromEntries(
    CHECKOUT_FIELDS.map((f) => [f, (raw[f] ?? '').slice(0, 300)]),
  ) as CheckoutValues;
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const parsed = checkoutSchema.safeParse(values);
  if (!parsed.success) {
    const errors = [
      ...new Set(parsed.error.issues.map((i) => i.path[0] as (typeof CHECKOUT_FIELDS)[number])),
    ];
    return { status: 'invalid', errors, values };
  }
  const token = await readToken();
  if (!token) return { status: 'refused', reason: 'empty_cart', values };

  let target: string;
  try {
    const h = await headers();
    const limiter = getCartBackend();
    const keyHash = await hmacHex(limiter.hashSecret, `checkout:${clientIp(h)}`);
    const allowed = await limiter.hitRateLimit(
      'checkout:ip',
      keyHash,
      CHECKOUT_RATE_LIMIT.max,
      CHECKOUT_RATE_LIMIT.windowSeconds,
    );
    if (!allowed) return { status: 'busy', values };

    const checkout = getCheckoutBackend();
    // Housekeeping until a scheduler exists: free stock held by abandoned payments.
    await checkout.expireUnpaid().catch((err: unknown) => {
      console.error('expire unpaid orders failed', err instanceof Error ? err.message : 'unknown');
    });

    const result = await checkout.createOrder(await sha256Hex(token), parsed.data, locale);
    if (result.status === 'refused') return { status: 'refused', reason: result.reason, values };

    const origin = siteOrigin(h);
    const orderPath = `/${locale}/order/${result.orderNumber}?k=${await orderLinkToken(result.orderNumber)}`;
    const provider = await getPaymentProvider(`${origin}/${locale}/checkout/mock-pay`);
    const session = await provider.createSession({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      amountFils: result.totalFils,
      currency: 'AED',
      locale,
      customerEmail: parsed.data.email,
      returnUrl: orderPath,
    });
    await checkout.recordPaymentSession(result.orderId, provider.id, session.providerRef);
    target = session.redirectUrl;
  } catch (err) {
    console.error('place order failed', err instanceof Error ? err.message : 'unknown error');
    return { status: 'error', values };
  }
  redirect(target);
}

/**
 * The mock hosted page's Pay / Decline buttons. Delivers a signed event through the same webhook
 * path a real provider would use (signature check, raw event stored, idempotent processing),
 * then returns the shopper to their order page. Test mode only.
 */
export async function completeMockPayment(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const { ref, outcome, back, order } = formFields(form, ['ref', 'outcome', 'back', 'order']);
  const safeBack =
    back && back.startsWith(`/${locale}/order/`) && !back.startsWith('//') ? back : `/${locale}`;
  if (
    !ref ||
    !MOCK_REF_REGEX.test(ref) ||
    (outcome !== 'captured' && outcome !== 'failed') ||
    !order ||
    !ORDER_NUMBER_REGEX.test(order)
  ) {
    redirect(safeBack);
  }
  try {
    const secret = await getCheckoutBackend().secret();
    const body = mockEventBody(ref, outcome);
    const signature = await signMockEvent(secret, body);
    await processPaymentWebhook(body, {
      get: (name) => (name.toLowerCase() === MOCK_SIGNATURE_HEADER ? signature : null),
    });
  } catch (err) {
    console.error('mock payment failed', err instanceof Error ? err.message : 'unknown error');
  }
  redirect(safeBack);
}
