-- Migration: products
-- A product can only become `active` once all consumer-facing Arabic + English copy exists.
--
-- Rollback notes:
--   drop table if exists public.products cascade;
--   drop type if exists public.product_status;
--   drop type if exists public.product_gender;

create type public.product_status as enum ('draft', 'active', 'archived');
create type public.product_gender as enum ('men', 'women', 'unisex');

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  style_code     text not null unique check (style_code ~ '^[A-Z0-9]{2,16}$'),
  gender         public.product_gender not null,
  name_en        text not null check (length(name_en) between 1 and 200),
  name_ar        text check (name_ar is null or length(name_ar) between 1 and 200),
  description_en text,
  description_ar text,
  fabric         text not null check (length(fabric) between 1 and 200),
  care_en        text,
  care_ar        text,
  origin_country char(2) check (origin_country is null or origin_country ~ '^[A-Z]{2}$'),
  status         public.product_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint products_active_requires_copy check (
    status <> 'active' or (
      name_ar is not null and description_en is not null and description_ar is not null
      and care_en is not null and care_ar is not null and origin_country is not null
    )
  )
);

comment on column public.products.style_code is 'Style segment of the SKU: VZ-<style>-<colour>-<size>';
comment on column public.products.fabric is 'Composition, e.g. "100% European linen"';

create index products_status_idx on public.products (status);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

create policy "products: public reads active, staff read all"
  on public.products for select
  to anon, authenticated
  using (status = 'active' or (select public.is_staff()));

create policy "products: ops inserts"
  on public.products for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "products: ops updates"
  on public.products for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

create policy "products: owner deletes"
  on public.products for delete
  to authenticated
  using ((select public.is_staff('owner')));
