-- Migration: product_media
-- storage_path is the object path inside the `product-media` Storage bucket
-- (bucket created in *_storage_product_media.sql). Alt text is required (WCAG 2.1 AA).
--
-- Rollback notes:
--   drop table if exists public.product_media;

create table public.product_media (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  variant_id   uuid references public.product_variants (id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[a-z0-9][a-z0-9/_.-]*$'),
  kind         text not null default 'image' check (kind in ('image', 'video')),
  alt_en       text not null check (length(alt_en) between 1 and 300),
  alt_ar       text check (alt_ar is null or length(alt_ar) between 1 and 300),
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index product_media_product_id_idx on public.product_media (product_id, sort_order);
create index product_media_variant_id_idx on public.product_media (variant_id);

create trigger product_media_set_updated_at
  before update on public.product_media
  for each row execute function public.set_updated_at();

alter table public.product_media enable row level security;

create policy "product_media: public reads media of active products, staff read all"
  on public.product_media for select
  to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    or (select public.is_staff())
  );

create policy "product_media: ops inserts"
  on public.product_media for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "product_media: ops updates"
  on public.product_media for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

create policy "product_media: ops deletes"
  on public.product_media for delete
  to authenticated
  using ((select public.is_staff('ops')));
