import Link from 'next/link';
import { type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries/en';

export interface NavLink {
  href: string;
  label: string;
}

/** `path` is the route after the locale ('' or '/privacy'); `query` is kept on language switch. */
export function SiteHeader(props: {
  locale: Locale;
  t: Dictionary['nav'];
  path: string;
  query?: string | undefined;
  /** Store navigation; shown only in store mode. */
  nav?: NavLink[] | undefined;
  /** Bag link with its item count; shown only in store mode. */
  bag?: NavLink | undefined;
}) {
  const other: Locale = props.locale === 'en' ? 'ar' : 'en';
  const switchHref = `/${other}${props.path}${props.query ? `?${props.query}` : ''}`;
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-6 sm:px-8">
      <Link href={`/${props.locale}`} className="font-display text-2xl tracking-[0.3em] uppercase">
        Valzaya
      </Link>
      <div className="flex items-center gap-6">
        {props.nav && props.nav.length > 0 && (
          <nav aria-label={props.t.primary}>
            <ul className="flex gap-5 text-sm">
              {props.nav.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="underline-offset-4 hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {props.bag && (
          <Link
            href={props.bag.href}
            className="text-sm underline-offset-4 hover:underline"
            data-testid="bag-link"
          >
            {props.bag.label}
          </Link>
        )}
        <Link
          href={switchHref}
          hrefLang={other}
          lang={other}
          className="rounded-sm px-2 py-1 text-sm underline-offset-4 hover:underline"
          data-testid="language-toggle"
        >
          {props.t.switchTo}
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter(props: { locale: Locale; t: Dictionary['footer'] }) {
  return (
    <footer className="border-ink/10 text-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-4 py-8 text-sm sm:px-8">
      <p>{props.t.rights}</p>
      <Link href={`/${props.locale}/privacy`} className="underline-offset-4 hover:underline">
        {props.t.privacy}
      </Link>
    </footer>
  );
}
