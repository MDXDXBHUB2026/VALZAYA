import { ORDER_NUMBER_REGEX } from '@valzaya/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { localName, price } from '@/components/store-parts';
import { fill, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getCheckoutBackend, verifyOrderLink } from '@/lib/checkout';

export const metadata: Metadata = { robots: { index: false } };

/** A guest's order page. Reachable only with the signed link from checkout (?k=…). */
export default async function OrderPage({
  params,
  searchParams,
}: PageProps<'/[locale]/order/[number]'>) {
  await connection();
  const { locale, number } = await params;
  if (!isLocale(locale) || !ORDER_NUMBER_REGEX.test(number)) notFound();
  const { k } = await searchParams;
  if (!(await verifyOrderLink(number, typeof k === 'string' ? k : undefined))) notFound();
  const order = await getCheckoutBackend().getOrder(number);
  if (!order) notFound();

  const t = getDictionary(locale);
  const o = t.order;
  const status =
    order.status === 'pending_payment'
      ? o.pending
      : order.status === 'cancelled'
        ? o.cancelled
        : order.status === 'paid' || order.status === 'in_production'
          ? o.paid
          : fill(o.other, { status: order.status });
  const promise = order.deliveryPromiseDate
    ? new Intl.DateTimeFormat(`${locale}-AE`, { dateStyle: 'long', timeZone: 'UTC' }).format(
        new Date(`${order.deliveryPromiseDate}T00:00:00Z`),
      )
    : null;
  const address = order.shippingAddress;
  // The email is isolated (LTR inside Arabic), so split the template around it.
  const [emailBefore = '', emailAfter = ''] = o.emailNote.split('{email}');

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} path={`/order/${number}`} query={`k=${String(k)}`} />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-8">
        <header className="space-y-3">
          <h1 className="font-display text-4xl sm:text-5xl">
            {fill(o.title, { number: order.number })}
          </h1>
          <p
            className="text-lg"
            role="status"
            data-testid="order-status"
            data-status={order.status}
          >
            {status}
          </p>
          {order.status !== 'cancelled' && (
            <p className="text-muted text-sm">
              {emailBefore}
              <bdi dir="ltr">{order.email}</bdi>
              {emailAfter}
            </p>
          )}
        </header>

        <section aria-labelledby="order-items" className="space-y-3">
          <h2 id="order-items" className="text-sm font-medium">
            {o.items}
          </h2>
          <ul className="divide-ink/10 border-ink/10 divide-y border-y">
            {order.lines.map((l) => (
              <li key={l.sku} className="flex justify-between gap-4 py-3" data-testid="order-line">
                <span>
                  {localName(locale, l.nameEn, l.nameAr)} ·{' '}
                  {localName(locale, l.colourEn, l.colourAr)} · {l.size} × {l.quantity}
                </span>
                <span>{price(l.lineTotalFils, locale)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between text-sm">
            <span>{o.shipping}</span>
            <span>{price(order.shippingFils, locale)}</span>
          </p>
          <p className="flex justify-between text-lg">
            <span>{o.total}</span>
            <span data-testid="order-total">{price(order.totalFils, locale)}</span>
          </p>
          <p className="text-muted text-sm">
            {fill(o.vatLine, { vat: price(order.vatFils, locale) })}
          </p>
          {promise && <p className="text-sm">{fill(o.preorderNote, { date: promise })}</p>}
        </section>

        <section aria-labelledby="order-address" className="space-y-1 text-sm">
          <h2 id="order-address" className="font-medium">
            {o.deliveryTo}
          </h2>
          <p>{address.recipient_name}</p>
          <p>{[address.line1, address.line2, address.area].filter(Boolean).join(', ')}</p>
          <p>
            {address.city}
            {address.emirate &&
              `, ${t.checkout.emirates[address.emirate as keyof typeof t.checkout.emirates] ?? address.emirate}`}
          </p>
        </section>

        <Link href={`/${locale}`} className="btn-secondary">
          {o.continueShopping}
        </Link>
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
