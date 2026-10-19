import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/privacy'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).privacy.title, robots: { index: false } };
}

// Placeholder until the lawyer-reviewed notice exists (Phase 6).
export default async function PrivacyPage({ params }: PageProps<'/[locale]/privacy'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} t={t.nav} path="/privacy" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-16 sm:px-8">
        <p className="border-error/40 text-error inline-block rounded-sm border px-2 py-1 text-xs tracking-widest">
          {t.privacy.pending}
        </p>
        <h1 className="font-display text-4xl">{t.privacy.title}</h1>
        <p className="leading-7">{t.privacy.body}</p>
        <Link href={`/${locale}`} className="inline-block underline underline-offset-4">
          {t.privacy.back}
        </Link>
      </main>
      <SiteFooter locale={locale} t={t.footer} />
    </>
  );
}
