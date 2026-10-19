import { formatAed } from '@valzaya/core';
import Link from 'next/link';
import { fill, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries/en';
import type { CatalogueDrop, ProductSummary } from '@/lib/catalogue';
import type { NavLink } from './site-chrome';

/** Placeholder art until product photography is uploaded to Storage (decorative only). */
const SWATCH: Record<string, string> = { SAND: '#d8c7a6', OLIVE: '#6c7448' };

export function Swatch({
  colour,
  className = '',
}: {
  colour: string | undefined;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`linen-texture ${className}`}
      style={{
        backgroundColor: SWATCH[colour ?? ''] ?? '#cfc6b6',
        backgroundBlendMode: 'multiply',
      }}
    />
  );
}

export function price(fils: number, locale: Locale): string {
  return formatAed(fils, locale === 'ar' ? 'ar-AE' : 'en-AE');
}

export function localName(locale: Locale, en: string, ar: string | null): string {
  return locale === 'ar' ? (ar ?? en) : en;
}

export function storeNav(
  locale: Locale,
  t: Dictionary['store'],
  drop: CatalogueDrop | null,
): NavLink[] {
  const links: NavLink[] = [
    { href: `/${locale}/collections/men`, label: t.nav.men },
    { href: `/${locale}/collections/women`, label: t.nav.women },
  ];
  if (drop) {
    links.push({
      href: `/${locale}/collections/${drop.slug}`,
      label: fill(t.nav.drop, { drop: localName(locale, drop.titleEn, drop.titleAr) }),
    });
  }
  return links;
}

export function ProductGrid({
  products,
  locale,
  t,
}: {
  products: ProductSummary[];
  locale: Locale;
  t: Dictionary['store'];
}) {
  if (products.length === 0) return <p className="text-muted">{t.empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/${locale}/products/${p.slug}`}
            className="group block space-y-3"
            data-testid="product-card"
          >
            <Swatch colour={p.colours[0]?.code} className="aspect-[4/5] rounded-sm" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium group-hover:underline">
                {localName(locale, p.nameEn, p.nameAr)}
              </h3>
              <p className="text-muted text-sm">
                {fill(t.from, { price: price(p.fromPriceFils, locale) })}
              </p>
              <p className="text-muted text-xs">
                {fill(t.colours, { count: String(p.colours.length) })}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
