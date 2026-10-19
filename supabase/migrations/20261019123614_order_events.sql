-- Migration: order_events + order lifecycle enforcement
--   * order_events: append-only status history.
--   * guard_order_status(): orders must be created as pending_payment, and orders.status can
--     only change inside apply_order_transition().
--   * on_order_created(): creation writes order_events + audit_log.
--   * apply_order_transition(): the ONLY way to change status. Validates against
--     allowed_order_transitions (+ the paid -> production/ready guards from core), then
--     writes order_events + audit_log atomically. Callable by service role or ops/owner staff.
--
-- Rollback notes:
--   drop function if exists public.apply_order_transition(uuid, public.order_status, text, jsonb, text);
--   drop trigger if exists orders_on_created on public.orders;
--   drop function if exists public.on_order_created();
--   drop trigger if exists orders_guard_status on public.orders;
--   drop function if exists public.guard_order_status();
--   drop table if exists public.order_events;

create table public.order_events (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references public.orders (id) on delete cascade,
  from_status   public.order_status,
  to_status     public.order_status not null,
  actor_type    text not null check (actor_type in ('staff', 'customer', 'system', 'provider')),
  actor_user_id uuid references auth.users (id) on delete set null,
  reason        text check (reason is null or length(reason) <= 500),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index order_events_order_id_idx on public.order_events (order_id, created_at);
create index order_events_actor_user_id_idx on public.order_events (actor_user_id);

create trigger order_events_append_only
  before update or delete on public.order_events
  for each row execute function public.prevent_mutation();

alter table public.order_events enable row level security;

create policy "order_events: customer reads own, staff read all"
  on public.order_events for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

revoke insert, update, delete on public.order_events from anon, authenticated;

-- Guard ------------------------------------------------------------------------------------
create or replace function public.guard_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_payment' then
      raise exception 'orders must be created as pending_payment (got %)', new.status
        using errcode = 'P0001';
    end if;
  elsif new.status is distinct from old.status
        and coalesce(current_setting('valzaya.order_transition', true), '') <> 'on' then
    raise exception 'order status changes only via public.apply_order_transition()'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_order_status() from public, anon, authenticated;

create trigger orders_guard_status
  before insert or update of status on public.orders
  for each row execute function public.guard_order_status();

-- Creation event -----------------------------------------------------------------------------
create or replace function public.on_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_events (order_id, from_status, to_status, actor_type, actor_user_id, reason)
  values (new.id, null, new.status, public.current_actor_type(), (select auth.uid()), 'order created');

  perform public.write_audit(
    'order.created', 'orders', new.id::text, null,
    jsonb_build_object('order_number', new.order_number, 'status', new.status, 'total_fils', new.total_fils)
  );
  return null;
end;
$$;

revoke execute on function public.on_order_created() from public, anon, authenticated;

create trigger orders_on_created
  after insert on public.orders
  for each row execute function public.on_order_created();

-- The transition function ------------------------------------------------------------------
create or replace function public.apply_order_transition(
  p_order_id   uuid,
  p_to_status  public.order_status,
  p_reason     text default null,
  p_metadata   jsonb default '{}'::jsonb,
  p_actor_type text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service boolean := coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
  v_order      public.orders;
  v_from       public.order_status;
  v_actor      text;
begin
  if not v_is_service and not public.is_staff('ops') then
    raise exception 'not allowed to change order status' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0002';
  end if;
  v_from := v_order.status;

  if not exists (
    select 1 from public.allowed_order_transitions t
    where t.from_status = v_from and t.to_status = p_to_status
  ) then
    raise exception 'transition % -> % is not allowed', v_from, p_to_status using errcode = 'P0001';
  end if;

  -- Guards mirrored from checkTransition() in @valzaya/core.
  if v_from = 'paid' and p_to_status = 'in_production' and not v_order.has_made_to_order_lines then
    raise exception 'only preorder/mto orders go into production' using errcode = 'P0001';
  end if;
  if v_from = 'paid' and p_to_status = 'ready_to_ship' and v_order.has_made_to_order_lines then
    raise exception 'preorder/mto orders must go through in_production' using errcode = 'P0001';
  end if;

  v_actor := case when v_is_service then coalesce(p_actor_type, 'system') else 'staff' end;

  perform set_config('valzaya.order_transition', 'on', true);
  update public.orders set status = p_to_status where id = p_order_id returning * into v_order;
  perform set_config('valzaya.order_transition', 'off', true);

  insert into public.order_events (order_id, from_status, to_status, actor_type, actor_user_id, reason, metadata)
  values (p_order_id, v_from, p_to_status, v_actor, (select auth.uid()), p_reason, coalesce(p_metadata, '{}'::jsonb));

  perform public.write_audit(
    'order.status_changed', 'orders', p_order_id::text,
    jsonb_build_object('status', v_from),
    jsonb_build_object('status', p_to_status),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason),
    v_actor
  );

  return v_order;
end;
$$;

revoke execute on function public.apply_order_transition(uuid, public.order_status, text, jsonb, text) from public, anon;
grant execute on function public.apply_order_transition(uuid, public.order_status, text, jsonb, text) to authenticated, service_role;
