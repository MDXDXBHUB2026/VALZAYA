-- Migration: order_state_machine
-- The order_status enum and the allowed transitions table. This MUST mirror
-- packages/core/src/order-state-machine.ts (ORDER_STATUSES / ORDER_TRANSITIONS); the core
-- Vitest suite parses this file and fails if they drift. Enforcement lives in
-- public.apply_order_transition() (migration *_order_events.sql).
--
-- Changing transitions later = a NEW migration that inserts/deletes rows here, plus the
-- matching change in core (and update the test's marker block below if copied).
--
-- Rollback notes:
--   drop table if exists public.allowed_order_transitions;
--   drop type if exists public.order_status;   -- only after orders/order_events are dropped

create type public.order_status as enum (
  'pending_payment',
  'paid',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'partially_refunded',
  'exchange_requested',
  'exchange_in_progress',
  'exchange_completed'
);

create table public.allowed_order_transitions (
  from_status public.order_status not null,
  to_status   public.order_status not null,
  primary key (from_status, to_status)
);

comment on table public.allowed_order_transitions is 'Mirror of ORDER_TRANSITIONS in @valzaya/core. Read-only reference data.';

-- BEGIN TRANSITIONS
insert into public.allowed_order_transitions (from_status, to_status) values
  ('pending_payment', 'paid'),
  ('pending_payment', 'cancelled'),
  ('paid', 'in_production'),
  ('paid', 'ready_to_ship'),
  ('paid', 'refunded'),
  ('paid', 'partially_refunded'),
  ('in_production', 'ready_to_ship'),
  ('in_production', 'refunded'),
  ('in_production', 'partially_refunded'),
  ('ready_to_ship', 'shipped'),
  ('ready_to_ship', 'refunded'),
  ('ready_to_ship', 'partially_refunded'),
  ('shipped', 'delivered'),
  ('delivered', 'exchange_requested'),
  ('delivered', 'partially_refunded'),
  ('delivered', 'refunded'),
  ('partially_refunded', 'partially_refunded'),
  ('partially_refunded', 'refunded'),
  ('partially_refunded', 'exchange_requested'),
  ('exchange_requested', 'exchange_in_progress'),
  ('exchange_requested', 'delivered'),
  ('exchange_requested', 'partially_refunded'),
  ('exchange_requested', 'refunded'),
  ('exchange_in_progress', 'exchange_completed'),
  ('exchange_completed', 'exchange_requested'),
  ('exchange_completed', 'partially_refunded'),
  ('exchange_completed', 'refunded');
-- END TRANSITIONS

alter table public.allowed_order_transitions enable row level security;

create policy "allowed_order_transitions: staff read"
  on public.allowed_order_transitions for select
  to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.allowed_order_transitions from anon, authenticated;
