import 'server-only';
import type { Locale } from './config';
import ar from './dictionaries/ar';
import en, { type Dictionary } from './dictionaries/en';

const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
