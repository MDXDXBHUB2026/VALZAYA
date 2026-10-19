import { z } from 'zod';
import { localeSchema } from './schemas';

/** E.164 phone, mirrors the DB CHECK on waitlist_signups.phone / consents.phone. */
export const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;
/** Referral code, mirrors the DB CHECK on waitlist_signups.referral_code. */
export const REFERRAL_CODE_REGEX = /^[0-9A-F]{10}$/;

/**
 * Normalises a phone number typed by a UAE-first audience to E.164.
 * Accepts "+971 50 123 4567", "00971501234567", "050-123-4567", "501234567", "971501234567".
 * Returns null when the input cannot be a valid E.164 number.
 */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, '');
  if (s === '') return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (!/^\d+$/.test(s)) return null;
    if (/^05\d{8}$/.test(s))
      s = `+971${s.slice(1)}`; // UAE mobile, national format
    else if (/^5\d{8}$/.test(s))
      s = `+971${s}`; // UAE mobile without trunk 0
    else if (/^971\d{8,9}$/.test(s))
      s = `+${s}`; // UAE with country code, no +
    else return null; // other countries must be entered with + or 00
  }
  return E164_REGEX.test(s) ? s : null;
}

export function normalizeReferralCode(input: string | null | undefined): string | null {
  const code = (input ?? '').trim().toUpperCase();
  return REFERRAL_CODE_REGEX.test(code) ? code : null;
}

export type WaitlistField = 'contact' | 'email' | 'phone' | 'emailConsent' | 'whatsappConsent';
export type WaitlistErrorCode =
  | 'contact_required'
  | 'email_invalid'
  | 'phone_invalid'
  | 'email_consent_required'
  | 'whatsapp_consent_required';

export interface WaitlistSignup {
  email: string | null;
  phone: string | null;
  emailConsent: boolean;
  whatsappConsent: boolean;
  locale: 'en' | 'ar';
  refCode: string | null;
}

const checkbox = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true');

const rawFormSchema = z.object({
  email: z.string().max(254).optional().default(''),
  phone: z.string().max(32).optional().default(''),
  emailConsent: checkbox,
  whatsappConsent: checkbox,
  locale: localeSchema.catch('en'),
  ref: z.string().max(64).optional(),
});

const emailSchema = z.email();

export type ParseResult =
  | { ok: true; data: WaitlistSignup }
  | { ok: false; errors: Partial<Record<WaitlistField, WaitlistErrorCode>> };

/**
 * Validates the waitlist form. A contact is required, and each contact given needs its own
 * explicit consent (the boxes start unticked). Mirrors the rules in public.join_waitlist().
 */
export function parseWaitlistForm(raw: Record<string, unknown>): ParseResult {
  const parsed = rawFormSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { contact: 'contact_required' } };
  const f = parsed.data;
  const errors: Partial<Record<WaitlistField, WaitlistErrorCode>> = {};

  const emailInput = f.email.trim();
  const phoneInput = f.phone.trim();
  const email = emailInput === '' ? null : emailInput.toLowerCase();
  const phone = phoneInput === '' ? null : normalizePhone(phoneInput);

  if (email === null && phoneInput === '') errors.contact = 'contact_required';
  if (email !== null && !emailSchema.safeParse(email).success) errors.email = 'email_invalid';
  if (phoneInput !== '' && phone === null) errors.phone = 'phone_invalid';
  if (email !== null && !f.emailConsent) errors.emailConsent = 'email_consent_required';
  if (phoneInput !== '' && !f.whatsappConsent) errors.whatsappConsent = 'whatsapp_consent_required';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      email,
      phone,
      emailConsent: email !== null && f.emailConsent,
      whatsappConsent: phone !== null && f.whatsappConsent,
      locale: f.locale,
      refCode: normalizeReferralCode(f.ref),
    },
  };
}

export interface WaitlistJoinInput extends WaitlistSignup {
  source: string;
  dropId: string | null;
}

export interface WaitlistJoinResult {
  referralCode: string;
  position: number;
  alreadyJoined: boolean;
}

/** Storage behind the waitlist. Production: Supabase (service role). Tests: in-memory. */
export interface WaitlistStore {
  join(input: WaitlistJoinInput): Promise<WaitlistJoinResult>;
  /** Counts one hit; resolves true while within `max` hits per `windowSeconds`. */
  hitRateLimit(
    bucket: string,
    keyHash: string,
    max: number,
    windowSeconds: number,
  ): Promise<boolean>;
}

export const WAITLIST_RATE_LIMITS = {
  /** Per client IP (hashed): 5 submissions per 10 minutes. */
  ip: { bucket: 'waitlist:ip', max: 5, windowSeconds: 600 },
  /** Per contact (hashed email/phone): 3 submissions per day. */
  contact: { bucket: 'waitlist:contact', max: 3, windowSeconds: 86_400 },
} as const;

export type WaitlistOutcome =
  | { status: 'joined'; position: number; referralCode: string }
  /** Repeat sign-up, or a bot caught by the honeypot: both get the same generic reply. */
  | { status: 'received' }
  | { status: 'invalid'; errors: Partial<Record<WaitlistField, WaitlistErrorCode>> }
  | { status: 'rate_limited' };

export interface WaitlistContext {
  /** Client IP as seen by the server; hashed before it leaves the app. */
  ip: string;
  /** Keyed hash (e.g. HMAC-SHA-256 hex) so raw IPs/contacts never reach the database. */
  hash: (value: string) => Promise<string>;
  dropId: string | null;
  source: string;
}

/** Honeypot → validation → rate limits → store. Pure orchestration; no framework code. */
export async function handleWaitlistSignup(
  raw: Record<string, unknown>,
  ctx: WaitlistContext,
  store: WaitlistStore,
): Promise<WaitlistOutcome> {
  // Bots fill the hidden field: pretend success, spend nothing.
  if (typeof raw.website === 'string' && raw.website.trim() !== '') return { status: 'received' };

  const parsed = parseWaitlistForm(raw);
  if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
  const signup = parsed.data;

  const { ip, contact } = WAITLIST_RATE_LIMITS;
  if (
    !(await store.hitRateLimit(ip.bucket, await ctx.hash(`ip:${ctx.ip}`), ip.max, ip.windowSeconds))
  ) {
    return { status: 'rate_limited' };
  }
  for (const value of [signup.email, signup.phone]) {
    if (value === null) continue;
    const key = await ctx.hash(`contact:${value}`);
    if (!(await store.hitRateLimit(contact.bucket, key, contact.max, contact.windowSeconds))) {
      return { status: 'rate_limited' };
    }
  }

  const result = await store.join({ ...signup, source: ctx.source, dropId: ctx.dropId });
  if (result.alreadyJoined) return { status: 'received' };
  return { status: 'joined', position: result.position, referralCode: result.referralCode };
}
