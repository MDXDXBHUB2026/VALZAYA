import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { Swatch, bagLink, localName, price, storeNav } from '@/components/store-parts';
import { fill, isLocale, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { getDictionary } from '@/i18n/get-dictionary';
import { addToBag, type BagError } from '../../bag/actions';
import { getBag } from '@/lib/cart';
import {
  getCatalogue,
  isStoreOpen,
  type CatalogueProduct,
  type CatalogueVariant,
} from '@/lib/catalogue';

/** Placeholder measurements (cm) until the real size guide exists. */
const SIZE_GUIDE: Record<string, [number, number, number]> = {
  XS: [88, 72, 70],
  S: [94, 78, 72],
  M: [100, 84, 74],
  L: [106, 90, 76],
  XL: [112, 96, 78],
  XXL: [118, 102, 80],
};

function badge(v: CatalogueVariant, locale: Locale, t: Dictionary['store']['badge']): string {
  if (!v.available) return t.soldOut;
  if (v.stockMode === 'mto') return t.mto;
  if (v.stockMode === 'preorder' && v.preorderShipDate) {
    const date = new Intl.DateTimeFormat(`${locale}-AE`, {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${v.preorderShipDate}T00:00:00Z`));
    return fill(t.preorder, { date });
  }
  return t.stock;
}

/** schema.org Product with one Offer per variant; `<` escaped so content can't close the script tag. */
function jsonLd(p: CatalogueProduct, locale: Locale, url: string): string {
  const availability = (v: CatalogueVariant) =>
    !v.available
      ? 'https://schema.org/SoldOut'
      : v.stockMode === 'stock'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: localName(locale, p.nameEn, p.nameAr),
    description: localName(locale, p.descriptionEn ?? '', p.descriptionAr),
    brand: { '@type': 'Brand', name: 'Valzaya' },
    material: p.fabric,
    offers: p.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      price: (v.priceFils / 100).toFixed(2),
      priceCurrency: 'AED',
      availability: availability(v),
      url,
    })),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/products/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const p = await getCatalogue()
    .getProduct(slug)
    .catch(() => null);
  if (!p) return {};
  return {
    title: `${localName(locale, p.nameEn, p.nameAr)} — Valzaya`,
    description: localName(locale, p.descriptionEn ?? '', p.descriptionAr) || undefined,
    alternates: { languages: { en: `/en/products/${slug}`, ar: `/ar/products/${slug}` } },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<'/[locale]/products/[slug]'>) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const catalogue = getCatalogue();
  const [product, drop, bag] = await Promise.all([
    catalogue.getProduct(slug),
    catalogue.getCurrentDrop(),
    getBag(),
  ]);
  if (!product) notFound();
  const t = getDictionary(locale);
  const s = t.store;

  const query = await searchParams;
  const colours = [...new Map(product.variants.map((v) => [v.colourCode, v])).values()];
  const colour =
    colours.find((v) => v.colourCode === query.colour)?.colourCode ?? colours[0]!.colourCode;
  const sizes = product.variants.filter((v) => v.colourCode === colour);
  const selected =
    sizes.find((v) => v.size === query.size) ?? (sizes.length === 1 ? sizes[0] : undefined);
  const shown = selected ?? sizes[0]!;
  const name = localName(locale, product.nameEn, product.nameAr);
  const href = (c: string, size?: string) =>
    `/${locale}/products/${slug}?colour=${c}${size ? `&size=${encodeURIComponent(size)}` : ''}`;
  const queryString = `colour=${colour}${selected ? `&size=${selected.size}` : ''}`;
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '');
  const origin = product.originCountry
    ? new Intl.DisplayNames([locale], { type: 'region' }).of(product.originCountry)
    : null;
  const hasSizeGuide = sizes.some((v) => v.size in SIZE_GUIDE);
  const bagError = (['invalid', 'busy', 'unavailable', 'error'] as const).find(
    (e): e is BagError => e === query.bag,
  );

  return (
    <>
      <SiteHeader
        locale={locale}
        t={t.nav}
        path={`/products/${slug}`}
        query={queryString}
        nav={storeNav(locale, s, drop)}
        bag={bagLink(locale, t.bag, bag)}
      />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <Swatch colour={colour} className="aspect-[4/5] rounded-sm" />

        <div className="space-y-8">
          <header className="space-y-3">
            <h1 className="font-display text-4xl sm:text-5xl">{name}</h1>
            <p className="text-xl" data-testid="price">
              {price(shown.priceFils, locale)}
            </p>
            <p className="text-muted text-xs">{s.vatIncluded}</p>
            {product.drop && (
              <p className="text-olive text-sm" data-testid="drop-units">
                {fill(product.drop.unitsLeft > 0 ? s.dropUnitsLeft : s.dropSoldOut, {
                  left: String(product.drop.unitsLeft),
                  cap: String(product.drop.unitCap),
                  drop: localName(locale, product.drop.titleEn, product.drop.titleAr),
                })}
              </p>
            )}
          </header>

          <section aria-labelledby="colour-label" className="space-y-3">
            <h2 id="colour-label" className="text-sm font-medium">
              {s.colour}: {localName(locale, shown.colourEn, shown.colourAr)}
            </h2>
            <ul className="flex flex-wrap gap-3">
              {colours.map((c) => (
                <li key={c.colourCode}>
                  <Link
                    href={href(c.colourCode, selected?.size)}
                    aria-current={c.colourCode === colour ? 'true' : undefined}
                    className="border-ink/20 aria-[current=true]:border-ink flex items-center gap-2 rounded-sm border px-3 py-2 text-sm aria-[current=true]:border-2"
                  >
                    <Swatch colour={c.colourCode} className="size-4 rounded-full" />
                    {localName(locale, c.colourEn, c.colourAr)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="size-label" className="space-y-3">
            <h2 id="size-label" className="text-sm font-medium">
              {s.size}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {sizes.map((v) => (
                <li key={v.size}>
                  <Link
                    href={href(colour, v.size)}
                    aria-current={v.size === selected?.size ? 'true' : undefined}
                    aria-label={v.available ? v.size : fill(s.soldOutSize, { size: v.size })}
                    className={`border-ink/20 aria-[current=true]:bg-ink aria-[current=true]:text-linen inline-flex min-w-12 justify-center rounded-sm border px-3 py-2 text-sm ${v.available ? '' : 'text-muted line-through'}`}
                  >
                    {v.size}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm" role="status" data-testid="stock-badge">
              {selected ? badge(selected, locale, s.badge) : s.selectSize}
            </p>
            <form action={addToBag} id="add" className="space-y-3 pt-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="colour" value={colour} />
              {selected && (
                <>
                  <input type="hidden" name="size" value={selected.size} />
                  <input type="hidden" name="variantId" value={selected.id} />
                </>
              )}
              {bagError && (
                <p role="alert" className="text-error text-sm">
                  {t.bag.errors[bagError]}
                </p>
              )}
              {(!selected || selected.available) && (
                <button
                  type="submit"
                  className="btn-primary w-full sm:w-auto"
                  disabled={!selected}
                  data-testid="add-to-bag"
                >
                  {selected ? t.bag.add : t.bag.addNeedsSize}
                </button>
              )}
            </form>
          </section>

          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(fill(s.sizeAdviceMessage, { product: name, sku: shown.sku }))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              {s.sizeAdvice}
            </a>
          )}

          <div className="border-ink/10 divide-ink/10 divide-y border-y">
            {hasSizeGuide && (
              <details className="group py-4">
                <summary className="cursor-pointer text-sm font-medium">{s.sizeGuide}</summary>
                <div className="space-y-3 pt-4">
                  <p className="text-muted text-xs">{s.sizeGuideNote}</p>
                  <table className="w-full text-start text-sm">
                    <thead>
                      <tr className="text-muted">
                        <th scope="col" className="py-1 text-start font-normal">
                          {s.sizeGuideHeaders.size}
                        </th>
                        <th scope="col" className="py-1 text-start font-normal">
                          {s.sizeGuideHeaders.chest}
                        </th>
                        <th scope="col" className="py-1 text-start font-normal">
                          {s.sizeGuideHeaders.waist}
                        </th>
                        <th scope="col" className="py-1 text-start font-normal">
                          {s.sizeGuideHeaders.length}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizes
                        .filter((v) => v.size in SIZE_GUIDE)
                        .map((v) => (
                          <tr key={v.size}>
                            <th scope="row" className="py-1 text-start font-medium">
                              {v.size}
                            </th>
                            {SIZE_GUIDE[v.size]!.map((cm, i) => (
                              <td key={i} className="py-1">
                                {cm}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <details className="py-4" open>
              <summary className="cursor-pointer text-sm font-medium">{s.fabricCare}</summary>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 pt-4 text-sm">
                <dt className="text-muted">{s.fabric}</dt>
                <dd>
                  {/* English-only column today: isolate so RTL doesn't reorder "100% linen". */}
                  <bdi lang="en">{product.fabric}</bdi>
                </dd>
                <dt className="text-muted">{s.care}</dt>
                <dd>{localName(locale, product.careEn ?? '', product.careAr)}</dd>
                {origin && (
                  <>
                    <dt className="text-muted">{s.origin}</dt>
                    <dd>{origin}</dd>
                  </>
                )}
              </dl>
            </details>
          </div>

          <p className="text-muted leading-7">
            {localName(locale, product.descriptionEn ?? '', product.descriptionAr)}
          </p>
        </div>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd(product, locale, `/${locale}/products/${slug}`),
          }}
        />
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
