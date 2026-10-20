import { processPaymentWebhook } from '@/lib/checkout';

/**
 * Mock payment provider webhook (CLAUDE.md rule 4): verify the signature over the raw body,
 * store the raw event and process it idempotently (apply_payment_event), answer fast.
 * 401 = bad signature (not stored); 5xx = let the provider retry.
 */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: 'too large' }, { status: 413 });
  try {
    const outcome = await processPaymentWebhook(raw, request.headers);
    if (outcome.status === 401)
      return Response.json({ error: 'invalid signature' }, { status: 401 });
    return Response.json({ result: outcome.result });
  } catch (err) {
    console.error('payment webhook failed', err instanceof Error ? err.message : 'unknown error');
    return Response.json({ error: 'processing failed' }, { status: 500 });
  }
}
