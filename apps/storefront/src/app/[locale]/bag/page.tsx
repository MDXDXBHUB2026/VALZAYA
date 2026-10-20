import { cartTotals, CART_MAX_QUANTITY } from '@valzaya/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { bagLink, localName, price, storeNav, Swatch } from '@/components/store-parts';
import { fill, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getBag } from '@/lib/cart';
import { getCatalogue, isStoreOpen } from '@/lib/catalogue';
import { setBagLine } from './actions';

export async function generateMetadata({ params }: PageProps<'/[locale]/bag'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getDictionary(locale).bag.title} — Valzaya`, robots: { index: false } };
}

export default async function BagPage({ params, searchParams }: PageProps<'/[locale]/bag'>) {
  // Per-visitor (cookie) page: render on request, never at build time.
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const t = getDictionary(locale);
  const b = t.bag;
  const [bag, drop, query] = await Promise.all([
    getBag(),
    getCatalogue().getCurrentDrop(),
    searchParams,
  ]);
  const totals = bag ? cartTotals(bag) : null;
  const QUANTITIES = Array.from({ length: CART_MAX_QUANTITY }, (_, i) => i + 1);

  return (
    <>
      <SiteHeader
        locale={locale}
        t={t.nav}
        path="/bag"
        nav={storeNav(locale, t.store, drop)}
        bag={bagLink(locale, b, bag)}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-8">
        <h1 className="font-display text-4xl sm:text-5xl">{b.title}</h1>

        {query.error !== undefined && (
          <p role="alert" className="text-error">
            {b.errors.error}
          </p>
        )}

        {bag === null ? (
          <p role="alert">{b.unavailable}</p>
        ) : bag.length === 0 ? (
          <div className="space-y-4">
            <p>{b.empty}</p>
            <Link href={`/${locale}`} className="btn-secondary">
              {b.continueShopping}
            </Link>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
            <ul className="divide-ink/10 border-ink/10 divide-y border-y" data-testid="bag-lines">
              {bag.map((line, i) => {
                const name = localName(locale, line.nameEn, line.nameAr);
                return (
                  <li key={line.variantId} className="flex gap-4 py-6" data-testid="bag-line">
                    <Swatch
                      colour={line.colourCode}
                      className="aspect-[4/5] w-20 shrink-0 rounded-sm"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <h2 className="font-medium">
                          <Link
                            href={`/${locale}/products/${line.productSlug}?colour=${line.colourCode}&size=${encodeURIComponent(line.size)}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {name}
                          </Link>
                        </h2>
                        <p data-testid="line-total">{price(totals!.lines[i]!.grossFils, locale)}</p>
                      </div>
                      <p className="text-muted text-sm">
                        {localName(locale, line.colourEn, line.colourAr)} · {line.size} ·{' '}
                        {fill(b.each, { price: price(line.unitPriceFils, locale) })}
                      </p>
                      {!line.available && <p className="text-error text-sm">{b.lineUnavailable}</p>}
                      <div className="flex flex-wrap items-end gap-3">
                        <form action={setBagLine} className="flex items-end gap-2">
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="variantId" value={line.variantId} />
                          <label className="space-y-1 text-sm">
                            <span className="block">{b.quantity}</span>
                            <select
                              name="quantity"
                              defaultValue={line.quantity}
                              className="border-ink/20 rounded-sm border bg-transparent px-2 py-1"
                            >
                              {QUANTITIES.map((q) => (
                                <option key={q} value={q}>
                                  {q}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="submit" className="btn-secondary px-3 py-1 text-sm">
                            {b.update}
                            <span className="sr-only"> {name}</span>
                          </button>
                        </form>
                        <form action={setBagLine}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="variantId" value={line.variantId} />
                          <input type="hidden" name="quantity" value="0" />
                          <button type="submit" className="text-sm underline underline-offset-4">
                            {b.remove}
                            <span className="sr-only"> {name}</span>
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <aside aria-labelledby="bag-summary" className="space-y-3">
              <h2 id="bag-summary" className="sr-only">
                {b.total}
              </h2>
              <p className="flex justify-between text-lg">
                <span>{b.total}</span>
                <span data-testid="bag-total">{price(totals!.totalFils, locale)}</span>
              </p>
              <p className="text-muted text-sm" data-testid="bag-vat">
                {fill(b.vatLine, { vat: price(totals!.vatFils, locale) })}
              </p>
              <p className="text-muted text-sm">{b.deliveryNote}</p>
              {bag.every((l) => l.available) && (
                <Link
                  href={`/${locale}/checkout`}
                  className="btn-primary inline-flex w-full"
                  data-testid="checkout-link"
                >
                  {b.checkout}
                </Link>
              )}
            </aside>
          </div>
        )}
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
