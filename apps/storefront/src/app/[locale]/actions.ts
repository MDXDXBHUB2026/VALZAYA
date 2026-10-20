'use server';

import { handleWaitlistSignup, type WaitlistOutcome } from '@valzaya/core';
import { headers } from 'next/headers';
import { isLocale } from '@/i18n/config';
import { getCatalogue } from '@/lib/catalogue';
import { clientIp } from '@/lib/client-ip';
import { siteOrigin } from '@/lib/site-origin';
import { getWaitlistBackend } from '@/lib/waitlist/backend';
import { hmacHex } from '@/lib/waitlist/hash';

export interface FormValues {
  email: string;
  phone: string;
  emailConsent: boolean;
  whatsappConsent: boolean;
}

export type WaitlistFormState =
  | { status: 'idle' }
  | { status: 'joined'; position: number; referralUrl: string }
  | { status: 'received' }
  | (Extract<WaitlistOutcome, { status: 'invalid' }> & { values: FormValues })
  | { status: 'rate_limited'; values: FormValues }
  | { status: 'error'; values: FormValues };

export async function joinWaitlist(
  _prev: WaitlistFormState,
  formData: FormData,
): Promise<WaitlistFormState> {
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') raw[key] = value;
  }
  const values: FormValues = {
    email: (raw.email ?? '').slice(0, 254),
    phone: (raw.phone ?? '').slice(0, 32),
    emailConsent: raw.emailConsent === 'on',
    whatsappConsent: raw.whatsappConsent === 'on',
  };
  const locale = isLocale(raw.locale) ? raw.locale : 'en';

  try {
    const h = await headers();
    const backend = getWaitlistBackend();
    const drop = await getCatalogue().getCurrentDrop();
    const outcome = await handleWaitlistSignup(
      raw,
      {
        ip: clientIp(h),
        hash: (value) => hmacHex(backend.hashSecret, value),
        dropId: drop?.id ?? null,
        source: 'landing',
      },
      backend.store,
    );

    switch (outcome.status) {
      case 'joined':
        return {
          status: 'joined',
          position: outcome.position,
          referralUrl: `${siteOrigin(h)}/${locale}?ref=${encodeURIComponent(outcome.referralCode)}`,
        };
      case 'received':
        return { status: 'received' };
      case 'invalid':
        return { ...outcome, values };
      case 'rate_limited':
        return { status: 'rate_limited', values };
    }
  } catch (error) {
    // Never log form contents (PII); the error message carries only codes.
    console.error(
      '[waitlist] sign-up failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return { status: 'error', values };
  }
}
