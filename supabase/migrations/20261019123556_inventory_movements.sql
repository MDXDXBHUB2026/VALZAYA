-- Migration: inventory_movements
-- Append-only stock ledger. Inserting a movement applies its deltas to inventory_levels in
-- the same transaction; the CHECKs on inventory_levels reject negative stock.
--
-- Rollback notes:
--   drop trigger if exists inventory_movements_apply on public.inventory_movements;
--   drop function if exists public.apply_inventory_movement();
--   drop table if exists public.inventory_movements;
--   drop type if exists public.inventory_reason;

create type public.inventory_reason as enum (
  'initial_count', 'manual_adjustment', '3pl_sync', 'inbound_received', 'transfer',
  'order_reserved', 'order_released', 'order_shipped', 'return_restocked', 'damaged'
);

create table public.inventory_movements (
  id             bigint generated always as identity primary key,
  variant_id     uuid not null references public.product_variants (id) on delete restrict,
  location       public.inventory_location not null,
  delta_on_hand  integer not null default 0,
  delta_reserved integer not null default 0,
  reason         public.inventory_reason not null,
  source         public.inventory_source not null default 'manual',
  reference_type text check (reference_type is null or reference_type ~ '^[a-z_]{2,40}$'),
  reference_id   text,
  note           text check (note is null or length(note) <= 500),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint inventory_movements_nonzero check (delta_on_hand <> 0 or delta_reserved <> 0)
);

create index inventory_movements_variant_idx on public.inventory_movements (variant_id, location, created_at desc);
create index inventory_movements_created_by_idx on public.inventory_movements (created_by);

create trigger inventory_movements_append_only
  before update or delete on public.inventory_movements
  for each row execute function public.prevent_mutation();

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_levels as l (variant_id, location, on_hand, reserved, updated_from)
  values (new.variant_id, new.location, new.delta_on_hand, new.delta_reserved, new.source)
  on conflict (variant_id, location) do update
    set on_hand      = l.on_hand + excluded.on_hand,
        reserved     = l.reserved + excluded.reserved,
        updated_from = excluded.updated_from;
  return new;
end;
$$;

revoke execute on function public.apply_inventory_movement() from public, anon, authenticated;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

alter table public.inventory_movements enable row level security;

create policy "inventory_movements: staff read"
  on public.inventory_movements for select
  to authenticated
  using ((select public.is_staff()));

create policy "inventory_movements: ops records manual movements"
  on public.inventory_movements for insert
  to authenticated
  with check (
    (select public.is_staff('ops'))
    and created_by = (select auth.uid())
    and source = 'manual'
  );
