import { normalizeReferralCode } from '@valzaya/core';
import { Countdown } from '@/components/countdown';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { WaitlistForm } from '@/components/waitlist-form';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { getCatalogue, type CatalogueDrop } from '@/lib/catalogue';

/** Waitlist mode (settings.store.open = false): the Step A landing page. */
export async function WaitlistLanding({
  locale,
  referral,
}: {
  locale: Locale;
  referral: string | null;
}) {
  const t = getDictionary(locale);
  const refCode = normalizeReferralCode(referral);

  // Public drop data via the anon catalogue reader; the page must render even if it fails.
  let drop: CatalogueDrop | null = null;
  try {
    drop = await getCatalogue().getCurrentDrop();
  } catch {
    drop = null;
  }
  const target = drop?.earlyAccessAt ?? drop?.opensAt ?? null;
  const dropTitle = drop
    ? locale === 'ar'
      ? (drop.titleAr ?? drop.titleEn)
      : drop.titleEn
    : t.hero.eyebrow;
  const dateLabel = target
    ? new Intl.DateTimeFormat(`${locale}-AE`, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Asia/Dubai',
      }).format(new Date(target))
    : '';

  return (
    <>
      <SiteHeader
        locale={locale}
        t={t.nav}
        path=""
        query={refCode ? `ref=${refCode}` : undefined}
      />
      <main>
        <section className="linen-texture border-ink/5 border-y">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div className="space-y-6">
              <p className="text-olive text-sm tracking-[0.3em] uppercase">{dropTitle}</p>
              <h1 className="font-display text-5xl leading-[1.05] sm:text-7xl">{t.hero.title}</h1>
              <p className="text-muted max-w-md text-lg">{t.hero.line}</p>
              <a href="#join" className="btn-primary inline-flex">
                {t.hero.cta}
              </a>
            </div>
            {target && (
              <Countdown target={target} dateLabel={dateLabel} locale={locale} t={t.countdown} />
            )}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-8 sm:py-24 md:grid-cols-2">
          <article className="space-y-4">
            <h2 className="font-display text-3xl">{t.founder.title}</h2>
            <p className="text-muted leading-7">{t.founder.body}</p>
          </article>
          <article className="space-y-4">
            <h2 className="font-display text-3xl">{t.fabric.title}</h2>
            <p className="text-muted leading-7">{t.fabric.body}</p>
          </article>
        </section>

        <section id="join" aria-labelledby="join-title" className="bg-sand/60">
          <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 sm:px-8 sm:py-24">
            <h2 id="join-title" className="font-display text-4xl">
              {t.form.title}
            </h2>
            <p className="text-muted">{t.form.intro}</p>
            <WaitlistForm
              locale={locale}
              refCode={refCode}
              privacyHref={`/${locale}/privacy`}
              t={{ form: t.form, errors: t.errors, success: t.success, received: t.received }}
            />
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
