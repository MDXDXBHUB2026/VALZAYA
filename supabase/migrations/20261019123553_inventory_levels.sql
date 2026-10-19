-- Migration: inventory_levels
-- Current stock per variant per location. Never written directly by API roles: every change
-- goes through an inventory_movements row (ledger), whose trigger updates this table.
-- available = on_hand - reserved. Preorder/MTO variants are capped by drops, not by stock.
--
-- Rollback notes:
--   drop table if exists public.inventory_levels;
--   drop type if exists public.inventory_source;
--   drop type if exists public.inventory_location;

create type public.inventory_location as enum ('warehouse', 'studio');
create type public.inventory_source as enum ('manual', '3pl_sync');

create table public.inventory_levels (
  variant_id   uuid not null references public.product_variants (id) on delete cascade,
  location     public.inventory_location not null,
  on_hand      integer not null default 0 check (on_hand >= 0),
  reserved     integer not null default 0 check (reserved >= 0),
  available    integer generated always as (on_hand - reserved) stored,
  updated_from public.inventory_source not null default 'manual',
  updated_at   timestamptz not null default now(),
  primary key (variant_id, location),
  constraint inventory_levels_reserved_le_on_hand check (reserved <= on_hand)
);

create trigger inventory_levels_set_updated_at
  before update on public.inventory_levels
  for each row execute function public.set_updated_at();

alter table public.inventory_levels enable row level security;

create policy "inventory_levels: staff read"
  on public.inventory_levels for select
  to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.inventory_levels from anon, authenticated;
