-- Migration: refunds
-- Owner may request a refund (status 'requested'); the server/provider adapter processes it
-- (service role). A trigger prevents refunding more than the payment amount.
--
-- Rollback notes:
--   drop trigger if exists refunds_check_amount on public.refunds;
--   drop function if exists public.check_refund_amount();
--   drop table if exists public.refunds;
--   drop type if exists public.refund_status;

create type public.refund_status as enum ('requested', 'pending', 'succeeded', 'failed', 'cancelled');

create table public.refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references public.payments (id) on delete restrict,
  order_id     uuid not null references public.orders (id) on delete restrict,
  amount_fils  bigint not null check (amount_fils > 0),
  reason       text not null check (length(reason) between 1 and 500),
  status       public.refund_status not null default 'requested',
  provider_ref text check (provider_ref is null or length(provider_ref) between 1 and 255),
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint refunds_provider_ref_unique unique (payment_id, provider_ref)
);

create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_order_id_idx on public.refunds (order_id);
create index refunds_requested_by_idx on public.refunds (requested_by);

create trigger refunds_set_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

create or replace function public.check_refund_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment  public.payments;
  v_refunded bigint;
begin
  select * into v_payment from public.payments where id = new.payment_id for update;
  if v_payment.order_id <> new.order_id then
    raise exception 'refund order_id does not match payment order' using errcode = '23514';
  end if;
  if new.status in ('requested', 'pending', 'succeeded') then
    select coalesce(sum(r.amount_fils), 0) into v_refunded
    from public.refunds r
    where r.payment_id = new.payment_id
      and r.id <> new.id
      and r.status in ('requested', 'pending', 'succeeded');
    if v_refunded + new.amount_fils > v_payment.amount_fils then
      raise exception 'refunds (% + %) exceed payment amount %', v_refunded, new.amount_fils, v_payment.amount_fils
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_refund_amount() from public, anon, authenticated;

create trigger refunds_check_amount
  before insert or update of amount_fils, status, payment_id, order_id on public.refunds
  for each row execute function public.check_refund_amount();

create trigger refunds_audit
  after insert or update or delete on public.refunds
  for each row execute function public.audit_row_change();

alter table public.refunds enable row level security;

create policy "refunds: customer reads own, staff read all"
  on public.refunds for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

create policy "refunds: owner requests"
  on public.refunds for insert
  to authenticated
  with check (
    (select public.is_staff('owner'))
    and status = 'requested'
    and requested_by = (select auth.uid())
  );

revoke update, delete on public.refunds from anon, authenticated;
