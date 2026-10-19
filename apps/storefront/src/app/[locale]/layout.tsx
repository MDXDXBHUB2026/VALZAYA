import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { LOCALES, dirFor, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import '../globals.css';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-cormorant',
  display: 'swap',
});
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const viewport: Viewport = { themeColor: '#f6f2ea' };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
    metadataBase: process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
      : undefined,
    alternates: { languages: { en: '/en', ar: '/ar', 'x-default': '/en' } },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === 'ar' ? 'ar_AE' : 'en_AE',
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${display.variable} ${sans.variable} ${arabic.variable}`}
    >
      <body className="bg-linen text-ink min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
