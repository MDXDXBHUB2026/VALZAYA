import 'server-only';
import { createMemoryBackend } from './memory-backend';
import { createSupabaseBackend } from './supabase-backend';
import type { WaitlistBackend } from './types';

let backend: WaitlistBackend | undefined;

/**
 * Supabase in every deployed environment. `WAITLIST_STORE=memory` switches to the in-memory
 * backend for e2e tests and credential-free local previews; it is refused on Vercel.
 */
export function getWaitlistBackend(): WaitlistBackend {
  if (backend) return backend;
  if (process.env.WAITLIST_STORE === 'memory') {
    if (process.env.VERCEL) throw new Error('WAITLIST_STORE=memory is not allowed on Vercel');
    backend = createMemoryBackend();
  } else {
    backend = createSupabaseBackend();
  }
  return backend;
}
