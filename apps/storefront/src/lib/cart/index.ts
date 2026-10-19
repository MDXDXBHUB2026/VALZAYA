import 'server-only';
import { cache } from 'react';
import { isMemoryData } from '../data-mode';
import { createMemoryCartBackend } from './memory-backend';
import { createSupabaseCartBackend } from './supabase-backend';
import { readToken, sha256Hex } from './token';
import type { BagLine, CartBackend } from './types';

let backend: CartBackend | undefined;

/** Supabase (service role) in every deployed environment; in-memory when STOREFRONT_DATA=memory. */
export function getCartBackend(): CartBackend {
  backend ??= isMemoryData() ? createMemoryCartBackend() : createSupabaseCartBackend();
  return backend;
}

/**
 * The visitor's bag for this request (header count + bag page share it). Null when the bag
 * cannot be read right now (e.g. no service-role key on a preview): pages degrade, never 500.
 */
export const getBag = cache(async (): Promise<BagLine[] | null> => {
  const token = await readToken();
  if (!token) return [];
  try {
    return await getCartBackend().getLines(await sha256Hex(token));
  } catch (err) {
    console.error('bag read failed', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
});

export type * from './types';
