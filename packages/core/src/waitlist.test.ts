import { describe, expect, it, vi } from 'vitest';
import {
  WAITLIST_RATE_LIMITS,
  handleWaitlistSignup,
  normalizePhone,
  normalizeReferralCode,
  parseWaitlistForm,
  type WaitlistContext,
  type WaitlistStore,
} from './waitlist';

describe('normalizePhone', () => {
  it.each([
    ['+971 50 123 4567', '+971501234567'],
    ['00971501234567', '+971501234567'],
    ['050-123-4567', '+971501234567'],
    ['(050) 123 4567', '+971501234567'],
    ['501234567', '+971501234567'],
    ['971501234567', '+971501234567'],
    ['+44 7700 900123', '+447700900123'],
    ['0044 7700 900123', '+447700900123'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '12345', '07700900123', '+0123456789', '+1234567890123456', '05012'])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe('normalizeReferralCode', () => {
  it('upper-cases and trims a valid code', () => {
    expect(normalizeReferralCode(' 7f3a9c21be ')).toBe('7F3A9C21BE');
  });
  it.each([undefined, null, '', 'short', '7F3A9C21BEXX', 'ZZZZZZZZZZ'])('drops %j', (input) => {
    expect(normalizeReferralCode(input)).toBeNull();
  });
});

describe('parseWaitlistForm', () => {
  it('requires a contact', () => {
    expect(parseWaitlistForm({ locale: 'en' })).toEqual({
      ok: false,
      errors: { contact: 'contact_required' },
    });
  });

  it('requires consent for each contact given (boxes start unticked)', () => {
    const r = parseWaitlistForm({ email: 'a@b.co', phone: '0501234567', locale: 'en' });
    expect(r).toEqual({
      ok: false,
      errors: {
        emailConsent: 'email_consent_required',
        whatsappConsent: 'whatsapp_consent_required',
      },
    });
  });

  it('does not require consent for a channel left empty', () => {
    const r = parseWaitlistForm({ email: 'A@B.co', emailConsent: 'on', locale: 'ar' });
    expect(r).toEqual({
      ok: true,
      data: {
        email: 'a@b.co',
        phone: null,
        emailConsent: true,
        whatsappConsent: false,
        locale: 'ar',
        refCode: null,
      },
    });
  });

  it('accepts WhatsApp only, normalised to E.164', () => {
    const r = parseWaitlistForm({ phone: '050 123 4567', whatsappConsent: 'on', locale: 'en' });
    expect(r.ok && r.data.phone).toBe('+971501234567');
  });

  it('flags invalid email and phone', () => {
    const r = parseWaitlistForm({
      email: 'not-an-email',
      emailConsent: 'on',
      phone: '12',
      whatsappConsent: 'on',
      locale: 'en',
    });
    expect(r).toEqual({ ok: false, errors: { email: 'email_invalid', phone: 'phone_invalid' } });
  });

  it('ignores consent ticked for an empty channel', () => {
    const r = parseWaitlistForm({ email: 'a@b.co', emailConsent: 'on', whatsappConsent: 'on' });
    expect(r.ok && r.data.whatsappConsent).toBe(false);
  });

  it('falls back to en for an unknown locale and keeps a valid ref code', () => {
    const r = parseWaitlistForm({
      email: 'a@b.co',
      emailConsent: 'on',
      locale: 'fr',
      ref: 'abcdef0123',
    });
    expect(r.ok && r.data.locale).toBe('en');
    expect(r.ok && r.data.refCode).toBe('ABCDEF0123');
  });
});

function fakeStore(overrides: Partial<WaitlistStore> = {}): WaitlistStore {
  return {
    join: vi.fn(async () => ({ referralCode: 'ABCDEF0123', position: 7, alreadyJoined: false })),
    hitRateLimit: vi.fn(async () => true),
    ...overrides,
  };
}

const ctx: WaitlistContext = {
  ip: '203.0.113.9',
  hash: async (v) => `h(${v})`,
  dropId: 'drop-1',
  source: 'landing',
};

describe('handleWaitlistSignup', () => {
  const valid = { email: 'a@b.co', emailConsent: 'on', locale: 'en' };

  it('joins and returns position + referral code', async () => {
    const store = fakeStore();
    await expect(handleWaitlistSignup(valid, ctx, store)).resolves.toEqual({
      status: 'joined',
      position: 7,
      referralCode: 'ABCDEF0123',
    });
    expect(store.join).toHaveBeenCalledWith({
      email: 'a@b.co',
      phone: null,
      emailConsent: true,
      whatsappConsent: false,
      locale: 'en',
      refCode: null,
      source: 'landing',
      dropId: 'drop-1',
    });
  });

  it('honeypot: fake success, no rate-limit or store calls', async () => {
    const store = fakeStore();
    await expect(
      handleWaitlistSignup({ ...valid, website: 'http://spam' }, ctx, store),
    ).resolves.toEqual({
      status: 'received',
    });
    expect(store.hitRateLimit).not.toHaveBeenCalled();
    expect(store.join).not.toHaveBeenCalled();
  });

  it('invalid input never reaches the store', async () => {
    const store = fakeStore();
    const r = await handleWaitlistSignup({ locale: 'en' }, ctx, store);
    expect(r.status).toBe('invalid');
    expect(store.hitRateLimit).not.toHaveBeenCalled();
    expect(store.join).not.toHaveBeenCalled();
  });

  it('rate-limits per hashed IP before anything else', async () => {
    const store = fakeStore({ hitRateLimit: vi.fn(async () => false) });
    await expect(handleWaitlistSignup(valid, ctx, store)).resolves.toEqual({
      status: 'rate_limited',
    });
    const { ip } = WAITLIST_RATE_LIMITS;
    expect(store.hitRateLimit).toHaveBeenCalledWith(
      ip.bucket,
      'h(ip:203.0.113.9)',
      ip.max,
      ip.windowSeconds,
    );
    expect(store.join).not.toHaveBeenCalled();
  });

  it('rate-limits per hashed contact (email and phone)', async () => {
    const hit = vi.fn(async (bucket: string, key: string) => !key.includes('+971501234567'));
    const store = fakeStore({ hitRateLimit: hit });
    const r = await handleWaitlistSignup(
      { ...valid, phone: '0501234567', whatsappConsent: 'on' },
      ctx,
      store,
    );
    expect(r).toEqual({ status: 'rate_limited' });
    expect(hit).toHaveBeenCalledWith(
      WAITLIST_RATE_LIMITS.contact.bucket,
      'h(contact:a@b.co)',
      WAITLIST_RATE_LIMITS.contact.max,
      WAITLIST_RATE_LIMITS.contact.windowSeconds,
    );
    expect(store.join).not.toHaveBeenCalled();
  });

  it('repeat sign-up gets the generic reply (no position or code)', async () => {
    const store = fakeStore({
      join: vi.fn(async () => ({ referralCode: 'ABCDEF0123', position: 3, alreadyJoined: true })),
    });
    await expect(handleWaitlistSignup(valid, ctx, store)).resolves.toEqual({ status: 'received' });
  });

  it('passes a normalised referral code to the store', async () => {
    const store = fakeStore();
    await handleWaitlistSignup({ ...valid, ref: ' abcdef0123 ' }, ctx, store);
    expect(store.join).toHaveBeenCalledWith(expect.objectContaining({ refCode: 'ABCDEF0123' }));
  });

  it('propagates store failures to the caller', async () => {
    const store = fakeStore({ join: vi.fn(async () => Promise.reject(new Error('db down'))) });
    await expect(handleWaitlistSignup(valid, ctx, store)).rejects.toThrow('db down');
  });
});
