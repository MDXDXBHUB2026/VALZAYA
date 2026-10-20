import { checkoutTotals, shippingFils, type DeliveryOption } from '@valzaya/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { CheckoutForm, type DeliveryChoice } from '@/components/checkout-form';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { price } from '@/components/store-parts';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getBag } from '@/lib/cart';
import { isStoreOpen } from '@/lib/catalogue';
import { getCheckoutBackend } from '@/lib/checkout';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/checkout'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${getDictionary(locale).checkout.title} — Valzaya`, robots: { index: false } };
}

const OPTIONS: DeliveryOption[] = ['standard', 'express'];

export default async function CheckoutPage({ params }: PageProps<'/[locale]/checkout'>) {
  await connection();
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const bag = await getBag();
  // Only a readable bag with every line available can be checked out; the bag page explains why.
  if (!bag || bag.length === 0 || bag.some((l) => !l.available)) redirect(`/${locale}/bag`);

  const t = getDictionary(locale);
  const rates = await getCheckoutBackend()
    .shippingRates()
    .catch(() => null);
  const deliveries: DeliveryChoice[] = rates
    ? OPTIONS.flatMap((option) => {
        const fee = shippingFils(rates, 'AE', option);
        if (fee === null) return [];
        const totals = checkoutTotals(bag, fee);
        return [
          {
            option,
            priceLabel: fee === 0 ? t.checkout.free : price(fee, locale),
            total: price(totals.totalFils, locale),
            vat: price(totals.vatFils, locale),
          },
        ];
      })
    : [];
  const items = checkoutTotals(bag, 0);

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} path="/checkout" />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-4xl sm:text-5xl">{t.checkout.title}</h1>
          <Link href={`/${locale}/bag`} className="text-sm underline underline-offset-4">
            {t.checkout.back}
          </Link>
        </div>
        {deliveries.length === 0 ? (
          <p role="alert">{t.checkout.error}</p>
        ) : (
          <CheckoutForm
            locale={locale}
            t={t.checkout}
            itemsLabel={price(items.totalFils, locale)}
            deliveries={deliveries}
          />
        )}
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
