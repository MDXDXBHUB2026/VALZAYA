-- Migration: inventory_reservations + order_items.drop_id
-- A reservation holds units for a cart for a short time (default 20 min) while the customer
-- checks out, so two buyers can never pay for the same last unit.
--   * stock-mode lines also hold warehouse stock: inventory_levels.reserved is raised through
--     the inventory_movements ledger ('order_reserved') and lowered again on release
--     ('order_released'). location is set for these rows and null for preorder/mto.
--   * every line that belongs to a drop counts against drops.unit_cap and
--     drop_items.unit_cap until it is released or expires.
-- Rows are written only by the SECURITY DEFINER functions in *_reservation_functions.sql.
-- order_items.drop_id records which drop a sold line counted against (B4 fills it).
--
-- Rollback notes:
--   alter table public.order_items drop column if exists drop_id;
--   drop trigger if exists inventory_reservations_release_on_delete on public.inventory_reservations;
--   drop function if exists public.release_deleted_reservation();
--   drop table if exists public.inventory_reservations;
--   drop type if exists public.reservation_status;

create type public.reservation_status as enum ('active', 'released', 'converted');

create table public.inventory_reservations (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references public.carts (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete restrict,
  drop_id     uuid references public.drops (id) on delete restrict,
  location    public.inventory_location,
  quantity    integer not null check (quantity between 1 and 10),
  status      public.reservation_status not null default 'active',
  expires_at  timestamptz not null,
  order_id    uuid references public.orders (id) on delete set null,
  released_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint inventory_reservations_released_at check ((status = 'released') = (released_at is not null))
);

comment on table public.inventory_reservations is 'Checkout holds. Active rows past expires_at no longer count and are released lazily.';
comment on column public.inventory_reservations.location is 'Set when the hold also reserves physical stock (stock-mode variants); null for preorder/mto';

create unique index inventory_reservations_one_active_line
  on public.inventory_reservations (cart_id, variant_id) where status = 'active';
create index inventory_reservations_active_variant_idx
  on public.inventory_reservations (variant_id, expires_at) where status = 'active';
create index inventory_reservations_active_drop_idx
  on public.inventory_reservations (drop_id, expires_at) where status = 'active';
create index inventory_reservations_active_expiry_idx
  on public.inventory_reservations (expires_at) where status = 'active';
create index inventory_reservations_order_id_idx on public.inventory_reservations (order_id);

-- Deleting a cart cascades here; give back any stock its active holds still reserve.
create or replace function public.release_deleted_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and old.location is not null then
    insert into public.inventory_movements
      (variant_id, location, delta_reserved, reason, source, reference_type, reference_id, note)
    values
      (old.variant_id, old.location, -old.quantity, 'order_released', 'manual',
       'cart_reservation', old.id::text, 'cart deleted');
  end if;
  return old;
end;
$$;

revoke execute on function public.release_deleted_reservation() from public, anon, authenticated;

create trigger inventory_reservations_release_on_delete
  after delete on public.inventory_reservations
  for each row execute function public.release_deleted_reservation();

alter table public.inventory_reservations enable row level security;

create policy "inventory_reservations: staff read"
  on public.inventory_reservations for select
  to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.inventory_reservations from anon, authenticated;

-- Which drop each sold line counted against (null for lines sold outside a drop).
alter table public.order_items
  add column drop_id uuid references public.drops (id) on delete restrict;

create index order_items_drop_id_idx on public.order_items (drop_id);
