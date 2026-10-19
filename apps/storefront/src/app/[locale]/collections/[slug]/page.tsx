import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { ProductGrid, localName, storeNav } from '@/components/store-parts';
import { fill, isLocale, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getCatalogue, isStoreOpen } from '@/lib/catalogue';

type Collection = { title: string; filter: { gender?: 'men' | 'women'; dropSlug?: string } };

async function resolve(locale: Locale, slug: string): Promise<Collection | null> {
  const t = getDictionary(locale).store;
  if (slug === 'men' || slug === 'women')
    return { title: t.collectionTitles[slug], filter: { gender: slug } };
  const drop = await getCatalogue().getDrop(slug);
  return drop
    ? { title: localName(locale, drop.titleEn, drop.titleAr), filter: { dropSlug: drop.slug } }
    : null;
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/collections/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const collection = await resolve(locale, slug).catch(() => null);
  return collection ? { title: `${collection.title} — Valzaya` } : {};
}

export default async function CollectionPage({
  params,
}: PageProps<'/[locale]/collections/[slug]'>) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const collection = await resolve(locale, slug);
  if (!collection) notFound();
  const t = getDictionary(locale);
  const catalogue = getCatalogue();
  const [products, drop] = await Promise.all([
    catalogue.listProducts(collection.filter),
    catalogue.getCurrentDrop(),
  ]);

  return (
    <>
      <SiteHeader
        locale={locale}
        t={t.nav}
        path={`/collections/${slug}`}
        nav={storeNav(locale, t.store, drop)}
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-8">
        <header className="space-y-2">
          <h1 className="font-display text-4xl sm:text-5xl">{collection.title}</h1>
          <p className="text-muted text-sm">
            {fill(t.store.collectionIntro, { count: String(products.length) })}
          </p>
        </header>
        <ProductGrid products={products} locale={locale} t={t.store} />
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
