import { describe, expect, it } from 'vitest';
import {
  createMockPaymentProvider,
  MOCK_SIGNATURE_HEADER,
  mockEventBody,
  signMockEvent,
  verifyMockSignature,
} from './payments';

const SECRET = 'test-secret-0123456789';
const headers = (sig: string | null) => ({
  get: (n: string) => (n === MOCK_SIGNATURE_HEADER ? sig : null),
});

describe('mock webhook signatures', () => {
  it('verifies its own signature', async () => {
    const body = mockEventBody('mock_abc', 'captured');
    expect(await verifyMockSignature(SECRET, body, await signMockEvent(SECRET, body))).toBe(true);
  });

  it('rejects a tampered body, another secret, a stale timestamp and junk', async () => {
    const body = mockEventBody('mock_abc', 'captured');
    const sig = await signMockEvent(SECRET, body);
    expect(await verifyMockSignature(SECRET, body.replace('captured', 'failed'), sig)).toBe(false);
    expect(await verifyMockSignature('another-secret-0123456', body, sig)).toBe(false);
    const old = await signMockEvent(SECRET, body, Date.now() - 10 * 60_000);
    expect(await verifyMockSignature(SECRET, body, old)).toBe(false);
    expect(await verifyMockSignature(SECRET, body, null)).toBe(false);
    expect(await verifyMockSignature(SECRET, body, 't=1,v1=zz')).toBe(false);
  });
});

describe('mock payment provider', () => {
  const provider = createMockPaymentProvider({
    secret: SECRET,
    hostedPageUrl: 'https://shop.test/en/checkout/mock-pay/',
  });

  it('creates a session that redirects to the hosted page', async () => {
    const s = await provider.createSession({
      orderId: 'o1',
      orderNumber: 'VZ-000001',
      amountFils: 44_500,
      currency: 'AED',
      locale: 'en',
      customerEmail: 'a@valzaya.test',
      returnUrl: 'https://shop.test/en/order/VZ-000001',
    });
    expect(s.providerRef).toMatch(/^mock_[0-9a-f]{24}$/);
    const url = new URL(s.redirectUrl);
    expect(url.pathname).toBe(`/en/checkout/mock-pay/${s.providerRef}`);
    expect(url.searchParams.get('amount')).toBe('44500');
  });

  it('parses a signed webhook and refuses an unsigned one', async () => {
    const body = mockEventBody('mock_abc', 'failed');
    const event = await provider.handleWebhook(body, headers(await signMockEvent(SECRET, body)));
    expect(event).toMatchObject({
      providerRef: 'mock_abc',
      outcome: 'failed',
      eventType: 'payment.failed',
    });
    expect(event?.eventId).toMatch(/^evt_/);
    expect(await provider.handleWebhook(body, headers(null))).toBeNull();
  });

  it('refuses a signed body with an unknown outcome', async () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'x', ref: 'mock_abc', outcome: 'refunded' });
    expect(
      await provider.handleWebhook(body, headers(await signMockEvent(SECRET, body))),
    ).toBeNull();
  });

  it('refuses a short secret', () => {
    expect(() =>
      createMockPaymentProvider({ secret: 'short', hostedPageUrl: 'https://x' }),
    ).toThrow();
  });
});
