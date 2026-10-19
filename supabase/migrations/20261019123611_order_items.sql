-- Migration: order_items
-- Immutable snapshot of each purchased line (name/colour/size/price/VAT at time of order).
-- Per-line money: line_total = unit_price * quantity = line_net + line_vat (all fils).
-- A deferred constraint trigger checks sum(line_total) + orders.shipping_fils = orders.total_fils
-- at COMMIT.
--
-- Rollback notes:
--   drop trigger if exists order_items_total_matches on public.order_items;
--   drop function if exists public.check_order_items_total();
--   drop table if exists public.order_items;

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  variant_id         uuid references public.product_variants (id) on delete set null,
  sku                text not null,
  product_name_en    text not null,
  product_name_ar    text,
  colour_en          text not null,
  colour_ar          text,
  size               text not null,
  stock_mode         public.stock_mode not null,
  preorder_ship_date date,
  quantity           integer not null check (quantity > 0),
  unit_price_fils    bigint not null check (unit_price_fils >= 0),
  vat_rate_bp        integer not null default 500 check (vat_rate_bp between 0 and 10000),
  line_net_fils      bigint not null check (line_net_fils >= 0),
  line_vat_fils      bigint not null check (line_vat_fils >= 0),
  line_total_fils    bigint not null check (line_total_fils >= 0),
  created_at         timestamptz not null default now(),
  constraint order_items_line_balance check (line_total_fils = line_net_fils + line_vat_fils),
  constraint order_items_line_total check (line_total_fils = unit_price_fils * quantity)
);

comment on column public.order_items.unit_price_fils is 'VAT-inclusive unit price at time of order';

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

create trigger order_items_immutable
  before update on public.order_items
  for each row execute function public.prevent_mutation();

create or replace function public.check_order_items_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_total    bigint;
  v_shipping bigint;
  v_sum      bigint;
begin
  select o.total_fils, o.shipping_fils into v_total, v_shipping
  from public.orders o where o.id = v_order_id;
  if not found then
    return null; -- order deleted in the same transaction
  end if;
  select coalesce(sum(i.line_total_fils), 0) into v_sum
  from public.order_items i where i.order_id = v_order_id;
  if v_sum + v_shipping <> v_total then
    raise exception 'order %: items % + shipping % <> total %', v_order_id, v_sum, v_shipping, v_total
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function public.check_order_items_total() from public, anon, authenticated;

create constraint trigger order_items_total_matches
  after insert or delete on public.order_items
  deferrable initially deferred
  for each row execute function public.check_order_items_total();

alter table public.order_items enable row level security;

create policy "order_items: customer reads own, staff read all"
  on public.order_items for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

revoke insert, update, delete on public.order_items from anon, authenticated;
