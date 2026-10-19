-- Migration: shipments
-- Outbound shipments created via the WarehouseProvider (3PL) adapter. `provider` is the
-- adapter id (e.g. 'mock' in prototype). events is the tracking history as a JSON array.
--
-- Rollback notes:
--   drop table if exists public.shipments;
--   drop type if exists public.shipment_status;

create type public.shipment_status as enum (
  'pending', 'created', 'picked', 'packed', 'handed_to_carrier', 'in_transit',
  'out_for_delivery', 'delivered', 'failed_delivery', 'returned_to_sender', 'cancelled'
);

create table public.shipments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  provider           text not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  provider_order_ref text check (provider_order_ref is null or length(provider_order_ref) between 1 and 255),
  tracking_no        text check (tracking_no is null or length(tracking_no) between 1 and 100),
  carrier            text check (carrier is null or length(carrier) between 1 and 100),
  status             public.shipment_status not null default 'pending',
  events             jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shipments_provider_ref_unique unique (provider, provider_order_ref)
);

create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_tracking_no_idx on public.shipments (tracking_no);

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

alter table public.shipments enable row level security;

create policy "shipments: customer reads own, staff read all"
  on public.shipments for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

create policy "shipments: ops creates"
  on public.shipments for insert
  to authenticated
  with check ((select public.is_staff('ops')));

create policy "shipments: ops updates"
  on public.shipments for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));
