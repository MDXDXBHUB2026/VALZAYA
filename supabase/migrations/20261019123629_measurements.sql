-- Migration: measurements
-- Made-to-order body measurement profiles. MTO-ready; not used in the UI yet.
-- profile is a JSON object, e.g. {"chest": 102, "waist": 86, "sleeve": 64}.
--
-- Rollback notes:
--   drop table if exists public.measurements;

create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  label       text check (label is null or length(label) <= 60),
  unit        text not null default 'cm' check (unit in ('cm', 'in')),
  profile     jsonb not null check (jsonb_typeof(profile) = 'object'),
  taken_by    text not null default 'self' check (taken_by in ('self', 'studio')),
  taken_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index measurements_customer_id_idx on public.measurements (customer_id, taken_at desc);

create trigger measurements_set_updated_at
  before update on public.measurements
  for each row execute function public.set_updated_at();

alter table public.measurements enable row level security;

create policy "measurements: customer reads own, staff read all"
  on public.measurements for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "measurements: customer or ops inserts"
  on public.measurements for insert
  to authenticated
  with check (customer_id = (select auth.uid()) or (select public.is_staff('ops')));

create policy "measurements: customer or ops updates"
  on public.measurements for update
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff('ops')))
  with check (customer_id = (select auth.uid()) or (select public.is_staff('ops')));

create policy "measurements: customer deletes own"
  on public.measurements for delete
  to authenticated
  using (customer_id = (select auth.uid()));
