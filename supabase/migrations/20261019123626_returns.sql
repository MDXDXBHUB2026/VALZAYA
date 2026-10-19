-- Migration: returns
-- RMA numbers: RMA-000001. items = JSON array of {"order_item_id": uuid, "quantity": int}.
-- Customers may open a return on their own order (status 'requested'); ops handles the rest.
--
-- Rollback notes:
--   drop table if exists public.returns;
--   drop function if exists public.next_rma_number();
--   drop sequence if exists public.rma_number_seq;
--   drop type if exists public.return_status;
--   drop type if exists public.return_type;

create type public.return_type as enum ('refund', 'exchange');
create type public.return_status as enum (
  'requested', 'approved', 'rejected', 'in_transit', 'received', 'inspected', 'completed', 'cancelled'
);

create sequence public.rma_number_seq as bigint start with 1;

create or replace function public.next_rma_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n text := nextval('public.rma_number_seq')::text;
begin
  return 'RMA-' || lpad(n, greatest(6, length(n)), '0');
end;
$$;

revoke execute on function public.next_rma_number() from public, anon;
grant execute on function public.next_rma_number() to authenticated, service_role;

create table public.returns (
  id          uuid primary key default gen_random_uuid(),
  rma_no      text not null unique default public.next_rma_number() check (rma_no ~ '^RMA-[0-9]{6,}$'),
  order_id    uuid not null references public.orders (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  type        public.return_type not null,
  reason      text not null check (length(reason) between 1 and 1000),
  status      public.return_status not null default 'requested',
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index returns_order_id_idx on public.returns (order_id);
create index returns_customer_id_idx on public.returns (customer_id);

create trigger returns_set_updated_at
  before update on public.returns
  for each row execute function public.set_updated_at();

alter table public.returns enable row level security;

create policy "returns: customer reads own, staff read all"
  on public.returns for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "returns: customer opens on own order"
  on public.returns for insert
  to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'requested'
    and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy "returns: ops updates"
  on public.returns for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));
