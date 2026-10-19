'use server';

import { addToCartSchema, formFields, setQuantitySchema } from '@valzaya/core';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale, type Locale } from '@/i18n/config';
import { getCartBackend, type CartBackend } from '@/lib/cart';
import { newToken, readToken, sha256Hex, writeToken } from '@/lib/cart/token';
import { isStoreOpen } from '@/lib/catalogue';
import { clientIp } from '@/lib/client-ip';
import { hmacHex } from '@/lib/waitlist/hash';

/** Bag writes per client IP: generous for shoppers, a ceiling for scripted cart creation. */
const BAG_RATE_LIMIT = { max: 60, windowSeconds: 600 } as const;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE_REGEX = /^[A-Z0-9]{1,16}$/;

export type BagError = 'invalid' | 'busy' | 'unavailable' | 'error';

function localeOf(form: FormData): Locale {
  const value = form.get('locale');
  return typeof value === 'string' && isLocale(value) ? value : 'en';
}

async function underRateLimit(backend: CartBackend): Promise<boolean> {
  const keyHash = await hmacHex(backend.hashSecret, `bag:${clientIp(await headers())}`);
  return backend.hitRateLimit('bag:ip', keyHash, BAG_RATE_LIMIT.max, BAG_RATE_LIMIT.windowSeconds);
}

/** Back to the product page with the same selection and an error code. */
function productUrl(locale: Locale, form: FormData, error: BagError): string {
  const { slug, colour, size } = formFields(form, ['slug', 'colour', 'size']);
  if (!slug || !SLUG_REGEX.test(slug)) return `/${locale}/bag`;
  const q = new URLSearchParams();
  if (colour && CODE_REGEX.test(colour)) q.set('colour', colour);
  if (size && CODE_REGEX.test(size)) q.set('size', size);
  q.set('bag', error);
  return `/${locale}/products/${slug}?${q.toString()}#add`;
}

/** Add-to-bag form on the product page. Works without client JavaScript (POST + redirect). */
export async function addToBag(form: FormData): Promise<void> {
  const locale = localeOf(form);
  if (!(await isStoreOpen())) redirect(`/${locale}`);

  const parsed = addToCartSchema.safeParse(formFields(form, ['variantId', 'quantity']));
  if (!parsed.success) redirect(productUrl(locale, form, 'invalid'));

  let outcome: 'ok' | BagError;
  try {
    const backend = getCartBackend();
    if (!(await underRateLimit(backend))) {
      outcome = 'busy';
    } else {
      let token = (await readToken()) ?? newToken();
      let result = await backend.add(
        await sha256Hex(token),
        parsed.data.variantId,
        parsed.data.quantity,
      );
      if (result === 'closed') {
        // The old bag was checked out or merged: start a fresh one.
        token = newToken();
        result = await backend.add(
          await sha256Hex(token),
          parsed.data.variantId,
          parsed.data.quantity,
        );
      }
      if (result === 'ok') await writeToken(token);
      outcome = result === 'ok' ? 'ok' : 'unavailable';
    }
  } catch (err) {
    console.error('add to bag failed', err instanceof Error ? err.message : 'unknown error');
    outcome = 'error';
  }
  redirect(outcome === 'ok' ? `/${locale}/bag` : productUrl(locale, form, outcome));
}

/** Quantity update / remove (quantity 0) on the bag page. */
export async function setBagLine(form: FormData): Promise<void> {
  const locale = localeOf(form);
  const parsed = setQuantitySchema.safeParse(formFields(form, ['variantId', 'quantity']));
  const token = await readToken();
  if (parsed.success && token) {
    try {
      const backend = getCartBackend();
      if (await underRateLimit(backend)) {
        await backend.setQuantity(
          await sha256Hex(token),
          parsed.data.variantId,
          parsed.data.quantity,
        );
      }
    } catch (err) {
      console.error('bag update failed', err instanceof Error ? err.message : 'unknown error');
      redirect(`/${locale}/bag?error=1`);
    }
  }
  redirect(`/${locale}/bag`);
}
