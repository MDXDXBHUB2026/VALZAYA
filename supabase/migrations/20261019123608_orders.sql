-- Migration: orders
-- Money in integer fils. total = subtotal_net + vat. Shipping (VAT-inclusive, shipping_fils)
-- is already inside subtotal_net + vat; it is stored separately for display/reporting.
-- Orders are created and changed server-side only (service role / SECURITY DEFINER functions).
-- Customers read their own orders; staff read all; ops may edit a few non-financial fields.
-- Status changes ONLY via public.apply_order_transition() (see *_order_events.sql).
--
-- Rollback notes:
--   drop table if exists public.orders cascade;
--   drop function if exists public.next_order_number();
--   drop sequence if exists public.order_number_seq;
--   drop type if exists public.payment_provider;

create type public.payment_provider as enum ('card', 'tabby', 'tamara');

create sequence public.order_number_seq as bigint start with 1;

-- VZ-000001 … VZ-999999, then VZ-1000000 (never truncated).
create or replace function public.next_order_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n text := nextval('public.order_number_seq')::text;
begin
  return 'VZ-' || lpad(n, greatest(6, length(n)), '0');
end;
$$;

revoke execute on function public.next_order_number() from public, anon, authenticated;

create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            text not null unique default public.next_order_number(),
  customer_id             uuid references public.customers (id) on delete set null,
  email                   extensions.citext not null,
  phone                   text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  locale                  text not null default 'en' check (locale in ('en', 'ar')),
  status                  public.order_status not null default 'pending_payment',
  currency                char(3) not null default 'AED' check (currency = 'AED'),
  subtotal_net_fils       bigint not null check (subtotal_net_fils >= 0),
  vat_fils                bigint not null check (vat_fils >= 0),
  total_fils              bigint not null check (total_fils >= 0),
  shipping_fils           bigint not null default 0 check (shipping_fils >= 0),
  vat_rate_bp             integer not null default 500 check (vat_rate_bp between 0 and 10000),
  payment_method          public.payment_provider,
  delivery_promise_date   date,
  has_made_to_order_lines boolean not null default false,
  shipping_address        jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  billing_address         jsonb check (billing_address is null or jsonb_typeof(billing_address) = 'object'),
  cart_id                 uuid references public.carts (id) on delete set null,
  drop_id                 uuid references public.drops (id) on delete set null,
  placed_at               timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint orders_number_format check (order_number ~ '^VZ-[0-9]{6,}$'),
  constraint orders_totals_balance check (total_fils = subtotal_net_fils + vat_fils),
  constraint orders_shipping_within_total check (shipping_fils <= total_fils)
);

comment on column public.orders.shipping_fils is 'VAT-inclusive shipping charge; already included in subtotal_net_fils + vat_fils';
comment on column public.orders.shipping_address is 'Snapshot of the address at checkout';
comment on column public.orders.has_made_to_order_lines is 'True if any line is preorder/mto; drives the in_production step';

create index orders_customer_id_idx on public.orders (customer_id, placed_at desc);
create index orders_status_idx on public.orders (status);
create index orders_placed_at_idx on public.orders (placed_at desc);
create index orders_cart_id_idx on public.orders (cart_id);
create index orders_drop_id_idx on public.orders (drop_id);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Non-status edits are audited here; status changes are audited by apply_order_transition().
create trigger orders_audit_non_status_update
  after update on public.orders
  for each row
  when (old.status is not distinct from new.status)
  execute function public.audit_row_change();

alter table public.orders enable row level security;

create policy "orders: customer reads own, staff read all"
  on public.orders for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_staff()));

create policy "orders: ops edits fulfilment fields"
  on public.orders for update
  to authenticated
  using ((select public.is_staff('ops')))
  with check ((select public.is_staff('ops')));

-- No API-role inserts/deletes. Updates limited to these columns (RLS limits who).
revoke insert, update, delete on public.orders from anon, authenticated;
grant update (phone, delivery_promise_date, shipping_address, billing_address) on public.orders to authenticated;
