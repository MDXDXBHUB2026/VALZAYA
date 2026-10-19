import 'server-only';
import { cache } from 'react';
import { isMemoryData } from '../data-mode';
import { createMemoryCatalogue } from './memory-source';
import { createSupabaseCatalogue } from './supabase-source';
import type { CatalogueSource } from './types';

let source: CatalogueSource | undefined;

export function getCatalogue(): CatalogueSource {
  source ??= isMemoryData() ? createMemoryCatalogue() : createSupabaseCatalogue();
  return source;
}

/** Store mode flag, de-duplicated per request (layout, page and metadata all ask). */
export const isStoreOpen = cache(() => getCatalogue().isStoreOpen());

export type * from './types';
