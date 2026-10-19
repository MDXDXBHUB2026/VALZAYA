import 'server-only';

/** First hop of X-Forwarded-For as set by the platform (Vercel overwrites client-sent values). */
export function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || 'unknown';
}
