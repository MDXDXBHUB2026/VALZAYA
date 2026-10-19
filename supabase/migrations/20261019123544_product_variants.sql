-- Migration: product_variants
-- price_fils is the VAT-inclusive consumer price in integer fils (1 AED = 100 fils).
-- SKU must equal VZ-<product.style_code>-<colour_code>-<size> (enforced by trigger).
--
-- Rollback notes:
--   drop table if exists public.product_variants cascade;
--   drop function if exists public.check_variant_sku();
--   drop type if exists public.stock_mode;

create type public.stock_mode as enum ('stock', 'preorder', 'mto');

create table public.product_variants (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products (id) on delete restrict,
  sku                text not null unique check (sku ~ '^VZ-[A-Z0-9]{2,16}-[A-Z0-9]{2,16}-[A-Z0-9]{1,6}$'),
  barcode            text unique check (barcode is null or barcode ~ '^[0-9]{8,14}$'),
  size               text not null check (size ~ '^[A-Z0-9]{1,6}$'),
  colour_code        text not null check (colour_code ~ '^[A-Z0-9]{2,16}$'),
  colour_en          text not null check (length(colour_en) between 1 and 60),
  colour_ar          text check (colour_ar is null or length(colour_ar) between 1 and 60),
  price_fils         bigint not null check (price_fils >= 0),
  stock_mode         public.stock_mode not null default 'stock',
  preorder_ship_date date,
  active             boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint product_variants_unique_option unique (product_id, colour_code, size),
  constraint product_variants_preorder_needs_date check (stock_mode <> 'preorder' or preorder_ship_date is not null),
  constraint product_variants_active_needs_ar check (not active or colour_ar is not null)
);

comment on column public.product_variants.price_fils is 'VAT-inclusive price in fils (AED x 100)';
comment on column public.product_variants.barcode is 'GTIN/EAN (8-14 digits) when assigned';

create index product_variants_product_id_idx on public.product_variants (product_id);

create trigger product_variants_set_updated_at
  before update on public.product_variants
  for each row execute function public.set_updated_at();

create or replace function public.check_variant_sku()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_style text;
begin
  select p.style_code into v_style from public.products p where p.id = new.product_id;
  if new.sku <> 'VZ-' || v_style || '-' || new.colour_code || '-' || new.size then
    raise exception 'SKU % does not match VZ-%-%-%', new.sku, v_style, new.colour_code, new.size
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_variant_sku() from public, anon, authenticated;

create trigger product_variants_check_sku
  before insert or update of sku, product_id, colour_code, size on public.product_variants
  for each row execute function public.check_variant_sku();

-- Price changes are audited.
create trigger product_variants_audit
  after insert or update or delete on public.product_variants
  for each row execute function public.audit_row_change();

alter table public.product_variants enable row level security;

create policy "product_variants: public reads active of active products, staff read all"
  on public.product_variants for select
  to anon, authenticated
  using (
    (active and exists (
      select 1 from public.products p where p.id = product_id and p.status = 'active'
    ))
    or (select public.is_staff())
  );

create policy "product_variants: ops inserts"
  on public.product_variants for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "product_variants: ops updates"
  on public.product_variants for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

create policy "product_variants: owner deletes"
  on public.product_variants for delete
  to authenticated
  using ((select public.is_staff('owner')));
