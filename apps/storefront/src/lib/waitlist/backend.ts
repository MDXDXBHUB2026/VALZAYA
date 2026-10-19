import 'server-only';
import { isMemoryData } from '../data-mode';
import { createMemoryBackend } from './memory-backend';
import { createSupabaseBackend } from './supabase-backend';
import type { WaitlistBackend } from './types';

let backend: WaitlistBackend | undefined;

/** Supabase in every deployed environment; in-memory when STOREFRONT_DATA=memory. */
export function getWaitlistBackend(): WaitlistBackend {
  if (backend) return backend;
  backend = isMemoryData() ? createMemoryBackend() : createSupabaseBackend();
  return backend;
}
