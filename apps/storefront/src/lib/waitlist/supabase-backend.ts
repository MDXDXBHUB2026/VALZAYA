import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { WaitlistJoinInput, WaitlistJoinResult, WaitlistStore } from '@valzaya/core';
import type { Database } from '@valzaya/core/db';
import { getPublicEnv } from '../env';
import { getServerEnv } from '../server-env';
import type { TeaserDrop, WaitlistBackend } from './types';

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/**
 * Production backend. Writes go through public.join_waitlist / public.hit_rate_limit, which only
 * the service role may execute; the public drop teaser is read with the anon key (RLS applies).
 */
export function createSupabaseBackend(): WaitlistBackend {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY: serviceKey } = getServerEnv();
  const service = createClient<Database>(url, serviceKey, NO_SESSION);
  const anon = createClient<Database>(url, anonKey, NO_SESSION);

  const store: WaitlistStore = {
    async join(input: WaitlistJoinInput): Promise<WaitlistJoinResult> {
      const { data, error } = await service.rpc('join_waitlist', {
        // The function treats '' as "not given"; generated types mark args non-null.
        p_email: input.email ?? '',
        p_phone: input.phone ?? '',
        p_email_consent: input.emailConsent,
        p_whatsapp_consent: input.whatsappConsent,
        p_locale: input.locale,
        p_source: input.source,
        p_ref_code: input.refCode ?? '',
        // uuid arg: null means "no drop"; the generated type cannot express that.
        p_drop_id: input.dropId as string,
      });
      if (error) throw new Error(`join_waitlist failed: ${error.code ?? 'unknown'}`);
      const row = data?.[0];
      if (!row) throw new Error('join_waitlist returned no row');
      return {
        referralCode: row.referral_code,
        position: Number(row.queue_position),
        alreadyJoined: row.already_joined,
      };
    },

    async hitRateLimit(bucket, keyHash, max, windowSeconds) {
      const { data, error } = await service.rpc('hit_rate_limit', {
        p_bucket: bucket,
        p_key_hash: keyHash,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      if (error) throw new Error(`hit_rate_limit failed: ${error.code ?? 'unknown'}`);
      return data === true;
    },
  };

  async function getTeaserDrop(): Promise<TeaserDrop | null> {
    const { data, error } = await anon
      .from('drops')
      .select('id, number, title_en, title_ar, early_access_at, opens_at')
      .in('status', ['scheduled', 'early_access', 'open'])
      .order('number', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`drop teaser query failed: ${error.code ?? 'unknown'}`);
    if (!data) return null;
    return {
      id: data.id,
      number: data.number,
      titleEn: data.title_en,
      titleAr: data.title_ar,
      earlyAccessAt: data.early_access_at,
      opensAt: data.opens_at,
    };
  }

  return { store, getTeaserDrop, hashSecret: serviceKey };
}
