import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { ProductGrid, bagLink, localName, storeNav } from '@/components/store-parts';
import { WaitlistLanding } from '@/components/waitlist-landing';
import { fill, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getBag } from '@/lib/cart';
import { getCatalogue, isStoreOpen } from '@/lib/catalogue';

export default async function HomePage({ params, searchParams }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { ref } = await searchParams;

  // Waitlist until the owner flips settings.store.open; a failing flag read keeps the waitlist up.
  const open = await isStoreOpen().catch(() => false);
  if (!open)
    return <WaitlistLanding locale={locale} referral={typeof ref === 'string' ? ref : null} />;

  const t = getDictionary(locale);
  const catalogue = getCatalogue();
  const [drop, bag] = await Promise.all([catalogue.getCurrentDrop(), getBag()]);
  const products = await catalogue.listProducts(drop ? { dropSlug: drop.slug } : {});
  const dropTitle = drop ? localName(locale, drop.titleEn, drop.titleAr) : t.hero.eyebrow;

  return (
    <>
      <SiteHeader
        locale={locale}
        t={t.nav}
        path=""
        nav={storeNav(locale, t.store, drop)}
        bag={bagLink(locale, t.bag, bag)}
      />
      <main>
        <section className="linen-texture border-ink/5 border-y">
          <div className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-8 sm:py-24">
            <p className="text-olive text-sm tracking-[0.3em] uppercase">{dropTitle}</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-7xl">{t.hero.title}</h1>
            <p className="text-muted max-w-md text-lg">{t.store.heroLine}</p>
            {drop && (
              <Link
                href={`/${locale}/collections/${drop.slug}`}
                className="btn-primary inline-flex"
              >
                {fill(t.store.shopDrop, { drop: dropTitle })}
              </Link>
            )}
          </div>
        </section>
        <section
          aria-labelledby="drop-title"
          className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-8"
        >
          <h2 id="drop-title" className="font-display text-3xl">
            {dropTitle}
          </h2>
          <ProductGrid products={products} locale={locale} t={t.store} />
        </section>
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
