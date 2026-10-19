-- Migration: addresses
-- UAE addresses require an emirate; international addresses must not have one.
--
-- Rollback notes:
--   drop table if exists public.addresses;
--   drop type if exists public.uae_emirate;

create type public.uae_emirate as enum (
  'abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'
);

create table public.addresses (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers (id) on delete cascade,
  label               text check (label is null or length(label) <= 60),
  recipient_name      text not null check (length(recipient_name) between 1 and 200),
  phone               text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  country_code        char(2) not null default 'AE' check (country_code ~ '^[A-Z]{2}$'),
  emirate             public.uae_emirate,
  city                text not null check (length(city) between 1 and 120),
  area                text check (area is null or length(area) <= 120),
  line1               text not null check (length(line1) between 1 and 300),
  line2               text check (line2 is null or length(line2) <= 300),
  postal_code         text check (postal_code is null or length(postal_code) <= 20),
  is_default_shipping boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint addresses_emirate_iff_uae check ((country_code = 'AE') = (emirate is not null))
);

create index addresses_customer_id_idx on public.addresses (customer_id);
create unique index addresses_one_default_per_customer
  on public.addresses (customer_id) where is_default_shipping;

create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

alter table public.addresses enable row level security;

create policy "addresses: customer reads own, staff read all"
  on public.addresses for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "addresses: customer inserts own"
  on public.addresses for insert
  to authenticated
  with check (customer_id = (select auth.uid()));

create policy "addresses: customer updates own"
  on public.addresses for update
  to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()));

create policy "addresses: customer deletes own"
  on public.addresses for delete
  to authenticated
  using (customer_id = (select auth.uid()));
