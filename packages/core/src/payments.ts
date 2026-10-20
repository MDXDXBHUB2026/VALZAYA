/**
 * Payment adapters. Every provider (card gateway, Tabby, Tamara) sits behind one interface and
 * uses provider-hosted checkout/redirect flows only: no card data ever touches Valzaya.
 * Real adapters are added only from each provider's official documentation (CLAUDE.md rule 5);
 * until credentials exist the storefront uses the mock provider below.
 */
import type { PAYMENT_PROVIDERS } from './schemas';

export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];
export type PaymentOutcome = 'captured' | 'failed' | 'cancelled' | 'expired';

export interface PaymentSessionRequest {
  orderId: string;
  orderNumber: string;
  /** Always the order total from the database, in fils. */
  amountFils: number;
  currency: 'AED';
  locale: 'en' | 'ar';
  customerEmail: string;
  /** Where the provider sends the shopper back after paying or cancelling. */
  returnUrl: string;
}

export interface PaymentSession {
  /** The provider's id for this session; stored as payments.provider_ref. */
  providerRef: string;
  /** The provider-hosted page the shopper is redirected to. */
  redirectUrl: string;
}

/** A webhook event whose signature has been verified. */
export interface VerifiedPaymentEvent {
  eventId: string;
  eventType: string;
  providerRef: string;
  outcome: PaymentOutcome;
  payload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createSession(request: PaymentSessionRequest): Promise<PaymentSession>;
  /** Verifies the signature over the raw body; null when it does not verify or parse. */
  handleWebhook(
    rawBody: string,
    headers: { get(name: string): string | null },
  ): Promise<VerifiedPaymentEvent | null>;
  /** For providers that authorise first; a no-op for auto-capture flows. */
  capture(providerRef: string, amountFils: number): Promise<void>;
  refund(providerRef: string, amountFils: number): Promise<{ refundRef: string }>;
  getStatus(providerRef: string): Promise<PaymentOutcome | 'pending'>;
}

// --- Mock provider ------------------------------------------------------------------------------

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';
/** Signed events older (or newer) than this are rejected, so a captured body cannot be replayed later. */
export const MOCK_SIGNATURE_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signature header for a mock webhook body: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export async function signMockEvent(
  secret: string,
  rawBody: string,
  now = Date.now(),
): Promise<string> {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${await hmacHex(secret, `${t}.${rawBody}`)}`;
}

export async function verifyMockSignature(
  secret: string,
  rawBody: string,
  header: string | null,
  now = Date.now(),
): Promise<boolean> {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  const [, ts, sig] = m ?? [];
  if (!ts || !sig) return false;
  const t = Number(ts);
  if (Math.abs(now / 1000 - t) > MOCK_SIGNATURE_TOLERANCE_SECONDS) return false;
  return timingSafeEqualHex(await hmacHex(secret, `${t}.${rawBody}`), sig);
}

const OUTCOMES: readonly PaymentOutcome[] = ['captured', 'failed', 'cancelled', 'expired'];

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Mock card provider: the "hosted page" is a clearly labelled storefront page that lets a tester
 * pay or decline, then delivers a signed webhook exactly as a real provider would. It never
 * collects card data and is refused in production builds by the storefront.
 */
export function createMockPaymentProvider(opts: {
  secret: string;
  /** Base URL of the mock hosted page; the session ref is appended as a path segment. */
  hostedPageUrl: string;
}): PaymentProvider {
  if (opts.secret.length < 16) throw new Error('mock payment secret is too short');
  return {
    id: 'card',

    async createSession(request) {
      const providerRef = `mock_${randomHex(12)}`;
      const url = new URL(`${opts.hostedPageUrl.replace(/\/$/, '')}/${providerRef}`);
      url.searchParams.set('order', request.orderNumber);
      url.searchParams.set('amount', String(request.amountFils));
      url.searchParams.set('return', request.returnUrl);
      return { providerRef, redirectUrl: url.toString() };
    },

    async handleWebhook(rawBody, headers) {
      if (!(await verifyMockSignature(opts.secret, rawBody, headers.get(MOCK_SIGNATURE_HEADER)))) {
        return null;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      if (typeof body !== 'object' || body === null) return null;
      const { id, type, ref, outcome } = body as Record<string, unknown>;
      if (
        typeof id !== 'string' ||
        typeof type !== 'string' ||
        typeof ref !== 'string' ||
        !OUTCOMES.includes(outcome as PaymentOutcome)
      ) {
        return null;
      }
      return {
        eventId: id,
        eventType: type,
        providerRef: ref,
        outcome: outcome as PaymentOutcome,
        payload: body as Record<string, unknown>,
      };
    },

    async capture() {
      // Mock sessions capture on success; nothing to do.
    },

    async refund() {
      return { refundRef: `mock_refund_${randomHex(8)}` };
    },

    async getStatus() {
      // The mock keeps no state of its own; the database is the record (payments.status).
      return 'pending';
    },
  };
}

/** Body of a mock webhook for a session outcome (what the mock hosted page sends). */
export function mockEventBody(providerRef: string, outcome: PaymentOutcome): string {
  return JSON.stringify({
    id: `evt_${randomHex(12)}`,
    type: `payment.${outcome}`,
    ref: providerRef,
    outcome,
  });
}
