import { ORDER_NUMBER_REGEX } from '@valzaya/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { price } from '@/components/store-parts';
import { fill, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { completeMockPayment } from '../../actions';

export const metadata: Metadata = { robots: { index: false } };

/**
 * Stand-in for a provider-hosted payment page (test mode only). It asks for no card details:
 * Pay / Decline deliver a signed webhook, then return to the order page.
 */
export default async function MockPayPage({
  params,
  searchParams,
}: PageProps<'/[locale]/checkout/mock-pay/[ref]'>) {
  await connection();
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { locale, ref } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;
  const t = getDictionary(locale);
  const order = typeof query.order === 'string' ? query.order : '';
  const amount = typeof query.amount === 'string' ? Number(query.amount) : NaN;
  const back = typeof query.return === 'string' ? query.return : '';
  const valid =
    /^mock_[0-9a-f]{24}$/.test(ref) &&
    ORDER_NUMBER_REGEX.test(order) &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    back.startsWith(`/${locale}/order/`);

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} path={`/checkout/mock-pay/${ref}`} />
      <main className="mx-auto max-w-xl space-y-6 px-4 py-12 sm:px-8">
        <p className="border-olive bg-olive/10 rounded-sm border p-3 text-sm" role="note">
          {t.mockPay.banner}
        </p>
        <h1 className="font-display text-4xl">{t.mockPay.title}</h1>
        {!valid ? (
          <p role="alert">{t.mockPay.invalid}</p>
        ) : (
          <>
            <p>{fill(t.mockPay.order, { number: order })}</p>
            <p className="text-lg" data-testid="mock-amount">
              {fill(t.mockPay.amount, { amount: price(amount, locale) })}
            </p>
            <div className="flex flex-wrap gap-3">
              {(['captured', 'failed'] as const).map((outcome) => (
                <form key={outcome} action={completeMockPayment}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="ref" value={ref} />
                  <input type="hidden" name="order" value={order} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="outcome" value={outcome} />
                  <button
                    type="submit"
                    className={outcome === 'captured' ? 'btn-primary inline-flex' : 'btn-secondary'}
                  >
                    {outcome === 'captured' ? t.mockPay.pay : t.mockPay.decline}
                  </button>
                </form>
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
