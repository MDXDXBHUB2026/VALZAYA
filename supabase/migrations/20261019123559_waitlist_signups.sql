-- Migration: waitlist_signups
-- Anonymous sign-ups are written server-side (service role) after validation + rate limiting;
-- signed-in customers may manage their own rows.
--
-- Rollback notes:
--   drop table if exists public.waitlist_signups;

create table public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext,
  phone       text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  drop_id     uuid references public.drops (id) on delete set null,
  customer_id uuid references public.customers (id) on delete cascade,
  source      text not null check (source ~ '^[a-z0-9_]{1,40}$'),
  consent_id  uuid references public.consents (id) on delete set null,
  locale      text not null default 'en' check (locale in ('en', 'ar')),
  created_at  timestamptz not null default now(),
  constraint waitlist_signups_has_contact check (email is not null or phone is not null)
);

create unique index waitlist_signups_email_drop_uniq
  on public.waitlist_signups (email, drop_id) nulls not distinct where email is not null;
create unique index waitlist_signups_phone_drop_uniq
  on public.waitlist_signups (phone, drop_id) nulls not distinct where phone is not null;
create index waitlist_signups_drop_id_idx on public.waitlist_signups (drop_id);
create index waitlist_signups_customer_id_idx on public.waitlist_signups (customer_id);
create index waitlist_signups_consent_id_idx on public.waitlist_signups (consent_id);

alter table public.waitlist_signups enable row level security;

create policy "waitlist_signups: customer reads own, staff read all"
  on public.waitlist_signups for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "waitlist_signups: customer joins"
  on public.waitlist_signups for insert
  to authenticated
  with check (customer_id = (select auth.uid()));

create policy "waitlist_signups: customer leaves"
  on public.waitlist_signups for delete
  to authenticated
  using (customer_id = (select auth.uid()));
