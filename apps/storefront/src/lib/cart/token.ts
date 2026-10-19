import 'server-only';
import { GUEST_TOKEN_REGEX } from '@valzaya/core';
import { cookies } from 'next/headers';

/**
 * The guest bag cookie holds a random 256-bit token; the database only ever sees its SHA-256.
 * httpOnly (no script access), SameSite=Lax (sent on top-level navigation and same-site forms).
 */
export const BAG_COOKIE = 'vz_bag';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function newToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The current bag token, if the cookie holds a well-formed one. */
export async function readToken(): Promise<string | null> {
  const value = (await cookies()).get(BAG_COOKIE)?.value;
  return value && GUEST_TOKEN_REGEX.test(value) ? value : null;
}

/** Sets the bag cookie (server actions / route handlers only). */
export async function writeToken(token: string): Promise<void> {
  (await cookies()).set(BAG_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.STOREFRONT_DATA !== 'memory',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}
