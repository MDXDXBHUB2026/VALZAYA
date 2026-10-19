export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'ar';
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Picks a supported locale from an Accept-Language header (q-values respected). */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return {
        lang: tag.trim().toLowerCase().split('-')[0] ?? '',
        q: q ? Number(q.split('=')[1]) : 1,
      };
    })
    .filter((x) => x.lang !== '' && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  const hit = ranked.find((x) => isLocale(x.lang));
  return hit && isLocale(hit.lang) ? hit.lang : DEFAULT_LOCALE;
}

/** Fills `{name}` placeholders in a dictionary template. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
