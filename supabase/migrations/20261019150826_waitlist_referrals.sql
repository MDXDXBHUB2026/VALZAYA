-- Migration: waitlist_referrals
-- Every waitlist sign-up gets a shareable referral code (?ref=CODE) and may record who referred it.
-- Referrals are counted only; they do not change queue position (no rule exists for that yet).
--
-- Rollback notes:
--   drop index if exists public.waitlist_signups_referred_by_idx;
--   alter table public.waitlist_signups drop column if exists referred_by,
--                                       drop column if exists referral_code;

alter table public.waitlist_signups
  add column referral_code text
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    check (referral_code ~ '^[0-9A-F]{10}$'),
  add column referred_by uuid references public.waitlist_signups (id) on delete set null,
  add constraint waitlist_signups_not_self_referred check (referred_by is null or referred_by <> id);

-- Existing rows get a code from the column default; then require it.
update public.waitlist_signups
   set referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
 where referral_code is null;

alter table public.waitlist_signups
  alter column referral_code set not null,
  add constraint waitlist_signups_referral_code_key unique (referral_code);

create index waitlist_signups_referred_by_idx on public.waitlist_signups (referred_by);
