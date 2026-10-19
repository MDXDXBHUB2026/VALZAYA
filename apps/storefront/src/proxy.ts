import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from './i18n/config';

/**
 * Every page lives under /en or /ar. Unprefixed paths redirect by saved choice (cookie), then
 * Accept-Language, then English. Visiting a prefixed path saves that choice for next time.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];

  if (isLocale(first)) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      response.cookies.set(LOCALE_COOKIE, first, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    return response;
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved)
    ? saved
    : localeFromAcceptLanguage(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, API routes and files with an extension (favicon.ico, robots.txt, images).
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
};
