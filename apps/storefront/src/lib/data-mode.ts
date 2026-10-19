import 'server-only';

/**
 * `STOREFRONT_DATA=memory` swaps Supabase for in-process fixtures (e2e tests and credential-free
 * local previews). Refused on Vercel so a deployment can never run on fake data.
 */
export function isMemoryData(): boolean {
  if (process.env.STOREFRONT_DATA !== 'memory') return false;
  if (process.env.VERCEL) throw new Error('STOREFRONT_DATA=memory is not allowed on Vercel');
  return true;
}
