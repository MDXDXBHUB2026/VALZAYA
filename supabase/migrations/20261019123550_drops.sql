-- Migration: drops + drop_items
-- A drop is a numbered, limited release. unit_cap is the total units sellable in the drop;
-- drop_items.unit_cap optionally caps an individual variant within it.
-- Public can see every drop that is not a draft (needed for "coming soon" + waitlist).
--
-- Rollback notes:
--   drop table if exists public.drop_items;
--   drop table if exists public.drops cascade;
--   drop type if exists public.drop_status;

create type public.drop_status as enum ('draft', 'scheduled', 'early_access', 'open', 'sold_out', 'closed');

create table public.drops (
  id              uuid primary key default gen_random_uuid(),
  number          integer not null unique check (number > 0),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_en        text not null check (length(title_en) between 1 and 200),
  title_ar        text check (title_ar is null or length(title_ar) between 1 and 200),
  opens_at        timestamptz not null,
  early_access_at timestamptz,
  closes_at       timestamptz,
  unit_cap        integer not null check (unit_cap > 0),
  status          public.drop_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint drops_early_before_open check (early_access_at is null or early_access_at <= opens_at),
  constraint drops_close_after_open check (closes_at is null or closes_at > opens_at),
  constraint drops_published_needs_ar check (status = 'draft' or title_ar is not null)
);

create trigger drops_set_updated_at
  before update on public.drops
  for each row execute function public.set_updated_at();

create table public.drop_items (
  drop_id    uuid not null references public.drops (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  unit_cap   integer check (unit_cap is null or unit_cap > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (drop_id, variant_id)
);

create index drop_items_variant_id_idx on public.drop_items (variant_id);

alter table public.drops enable row level security;
alter table public.drop_items enable row level security;

create policy "drops: public reads published, staff read all"
  on public.drops for select
  to anon, authenticated
  using (status <> 'draft' or (select public.is_staff()));

create policy "drops: ops inserts"
  on public.drops for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "drops: ops updates"
  on public.drops for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

create policy "drops: owner deletes"
  on public.drops for delete
  to authenticated
  using ((select public.is_staff('owner')));

create policy "drop_items: public reads items of published drops, staff read all"
  on public.drop_items for select
  to anon, authenticated
  using (
    exists (select 1 from public.drops d where d.id = drop_id and d.status <> 'draft')
    or (select public.is_staff())
  );

create policy "drop_items: ops inserts"
  on public.drop_items for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "drop_items: ops updates"
  on public.drop_items for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

create policy "drop_items: ops deletes"
  on public.drop_items for delete
  to authenticated
  using ((select public.is_staff('ops')));
