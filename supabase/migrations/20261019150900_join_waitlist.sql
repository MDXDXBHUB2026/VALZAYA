-- Migration: join_waitlist
-- The only write path for anonymous waitlist sign-ups. Called by the storefront server action
-- with the service role AFTER zod validation, honeypot and rate limiting. One transaction:
-- consent rows (one per channel, append-only ledger) + the sign-up, then queue position.
--
-- Rules enforced here (not only in the app):
--   * at least one contact (email or E.164 phone);
--   * explicit consent is required for every contact channel supplied;
--   * a repeat sign-up never modifies the existing row and never records a withdrawal, so nobody
--     can revoke someone else's consent or change their details through the public form;
--   * self-referral is ignored.
-- Policy version comes from settings('policies.versions')->>'marketing_consent', not the caller.
--
-- Rollback notes:
--   drop function if exists public.join_waitlist(text, text, boolean, boolean, text, text, text, uuid);

create or replace function public.join_waitlist(
  p_email            text,
  p_phone            text,
  p_email_consent    boolean,
  p_whatsapp_consent boolean,
  p_locale           text,
  p_source           text,
  p_ref_code         text,
  p_drop_id          uuid
)
returns table (signup_id uuid, referral_code text, queue_position bigint, already_joined boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email      extensions.citext := nullif(btrim(p_email), '');
  v_phone      text := nullif(btrim(p_phone), '');
  v_locale     text := coalesce(p_locale, 'en');
  v_policy     text;
  v_existing   public.waitlist_signups;
  v_signup     public.waitlist_signups;
  v_referrer   uuid;
  v_email_cid  uuid;
  v_wa_cid     uuid;
begin
  if v_email is null and v_phone is null then
    raise exception 'email or phone is required' using errcode = '22023';
  end if;
  if v_email is not null and not coalesce(p_email_consent, false) then
    raise exception 'email consent is required' using errcode = '22023';
  end if;
  if v_phone is not null and not coalesce(p_whatsapp_consent, false) then
    raise exception 'whatsapp consent is required' using errcode = '22023';
  end if;

  select coalesce(s.value ->> 'marketing_consent', 'unversioned') into v_policy
    from public.settings s where s.key = 'policies.versions';
  v_policy := coalesce(v_policy, 'unversioned');

  -- Consent ledger: always append the grants that came with this submission.
  if v_email is not null then
    insert into public.consents (email, channel, granted, source, policy_version, locale)
    values (v_email, 'marketing_email', true, 'waitlist', v_policy, v_locale)
    returning id into v_email_cid;
  end if;
  if v_phone is not null then
    insert into public.consents (phone, channel, granted, source, policy_version, locale)
    values (v_phone, 'marketing_whatsapp', true, 'waitlist', v_policy, v_locale)
    returning id into v_wa_cid;
  end if;

  select * into v_existing
    from public.waitlist_signups w
   where w.drop_id is not distinct from p_drop_id
     and ((v_email is not null and w.email = v_email) or (v_phone is not null and w.phone = v_phone))
   order by w.created_at
   limit 1;

  if found then
    v_signup := v_existing;
    already_joined := true;
  else
    if nullif(btrim(p_ref_code), '') is not null then
      select w.id into v_referrer
        from public.waitlist_signups w
       where w.referral_code = upper(btrim(p_ref_code));
    end if;

    begin
      insert into public.waitlist_signups (email, phone, drop_id, source, consent_id, locale, referred_by)
      values (v_email, v_phone, p_drop_id, p_source, coalesce(v_email_cid, v_wa_cid), v_locale, v_referrer)
      returning * into v_signup;
      already_joined := false;
    exception when unique_violation then
      -- A concurrent submission with the same contact won the race: treat as a repeat sign-up.
      select * into v_signup
        from public.waitlist_signups w
       where w.drop_id is not distinct from p_drop_id
         and ((v_email is not null and w.email = v_email) or (v_phone is not null and w.phone = v_phone))
       order by w.created_at
       limit 1;
      already_joined := true;
    end;
  end if;

  signup_id := v_signup.id;
  referral_code := v_signup.referral_code;
  select count(*) into queue_position
    from public.waitlist_signups w
   where w.drop_id is not distinct from v_signup.drop_id
     and (w.created_at, w.id) <= (v_signup.created_at, v_signup.id);
  return next;
end;
$$;

revoke execute on function public.join_waitlist(text, text, boolean, boolean, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, boolean, boolean, text, text, text, uuid)
  to service_role;
