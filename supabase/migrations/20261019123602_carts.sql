-- Migration: carts + cart_items
-- Logged-in carts are owned via customer_id (RLS). Guest carts are identified by the SHA-256
-- of an httpOnly cookie token and are only reachable server-side (service role).
-- Prices are NOT stored on cart lines; they are snapshotted onto order_items at checkout.
--
-- Rollback notes:
--   drop table if exists public.cart_items;
--   drop table if exists public.carts cascade;
--   drop type if exists public.cart_status;

create type public.cart_status as enum ('active', 'converted', 'abandoned');

create table public.carts (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid references public.customers (id) on delete cascade,
  guest_token_hash text unique check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'),
  status           public.cart_status not null default 'active',
  currency         char(3) not null default 'AED' check (currency = 'AED'),
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint carts_has_owner check (customer_id is not null or guest_token_hash is not null)
);

create unique index carts_one_active_per_customer
  on public.carts (customer_id) where status = 'active' and customer_id is not null;

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity   integer not null check (quantity between 1 and 10),
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_items_unique_variant unique (cart_id, variant_id)
);

create index cart_items_variant_id_idx on public.cart_items (variant_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "carts: customer reads own, staff read all"
  on public.carts for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "carts: customer creates own"
  on public.carts for insert
  to authenticated
  with check (customer_id = (select auth.uid()) and guest_token_hash is null);

create policy "carts: customer updates own"
  on public.carts for update
  to authenticated
  using (customer_id = (select auth.uid()))
  with check (customer_id = (select auth.uid()) and guest_token_hash is null);

create policy "carts: customer deletes own"
  on public.carts for delete
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "cart_items: customer reads own, staff read all"
  on public.cart_items for select
  to authenticated
  using (
    exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

create policy "cart_items: customer adds to own active cart"
  on public.cart_items for insert
  to authenticated
  with check (
    exists (select 1 from public.carts c
            where c.id = cart_id and c.customer_id = (select auth.uid()) and c.status = 'active')
  );

create policy "cart_items: customer updates own active cart"
  on public.cart_items for update
  to authenticated
  using (
    exists (select 1 from public.carts c
            where c.id = cart_id and c.customer_id = (select auth.uid()) and c.status = 'active')
  )
  with check (
    exists (select 1 from public.carts c
            where c.id = cart_id and c.customer_id = (select auth.uid()) and c.status = 'active')
  );

create policy "cart_items: customer removes from own active cart"
  on public.cart_items for delete
  to authenticated
  using (
    exists (select 1 from public.carts c
            where c.id = cart_id and c.customer_id = (select auth.uid()) and c.status = 'active')
  );
