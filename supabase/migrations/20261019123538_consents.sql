-- Migration: consents
-- Append-only consent ledger. The latest row per (subject, channel) is the current state;
-- withdrawing consent inserts a new row with granted = false. Subject is a customer, or an
-- email/phone for anonymous waitlist sign-ups (those are written server-side).
--
-- Rollback notes:
--   drop table if exists public.consents cascade;
--   drop type if exists public.consent_channel;

create type public.consent_channel as enum ('marketing_email', 'marketing_whatsapp');

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid references public.customers (id) on delete cascade,
  email          extensions.citext,
  phone          text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  channel        public.consent_channel not null,
  granted        boolean not null,
  source         text not null check (source in ('account', 'checkout', 'waitlist', 'staff')),
  policy_version text not null check (length(policy_version) between 1 and 40),
  locale         text not null default 'en' check (locale in ('en', 'ar')),
  captured_at    timestamptz not null default now(),
  constraint consents_has_subject check (customer_id is not null or email is not null or phone is not null),
  constraint consents_whatsapp_needs_phone check (channel <> 'marketing_whatsapp' or phone is not null or customer_id is not null)
);

create index consents_customer_channel_idx on public.consents (customer_id, channel, captured_at desc);
create index consents_email_idx on public.consents (email) where email is not null;

create trigger consents_append_only
  before update or delete on public.consents
  for each row execute function public.prevent_mutation();

alter table public.consents enable row level security;

create policy "consents: customer reads own, staff read all"
  on public.consents for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "consents: customer records own"
  on public.consents for insert
  to authenticated
  with check (customer_id = (select auth.uid()) and source in ('account', 'checkout'));
