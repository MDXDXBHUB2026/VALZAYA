-- Migration: payments
-- One row per provider payment/session attempt. Hosted checkout/redirect only — this table
-- never holds card data. raw_ref points at the provider's object/event (e.g. the
-- webhook_events row "<provider>:<event_id>") rather than copying provider payloads here.
-- Written only server-side (service role) from checkout + verified webhooks.
--
-- Rollback notes:
--   drop table if exists public.payments cascade;
--   drop type if exists public.payment_status;

create type public.payment_status as enum (
  'created', 'pending', 'authorized', 'captured', 'failed', 'cancelled', 'expired',
  'refunded', 'partially_refunded'
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete restrict,
  provider     public.payment_provider not null,
  provider_ref text check (provider_ref is null or length(provider_ref) between 1 and 255),
  status       public.payment_status not null default 'created',
  amount_fils  bigint not null check (amount_fils > 0),
  currency     char(3) not null default 'AED' check (currency = 'AED'),
  raw_ref      text check (raw_ref is null or length(raw_ref) <= 300),
  captured_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint payments_provider_ref_unique unique (provider, provider_ref)
);

create index payments_order_id_idx on public.payments (order_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();

alter table public.payments enable row level security;

create policy "payments: customer reads own, staff read all"
  on public.payments for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
    or (select public.is_staff())
  );

revoke insert, update, delete on public.payments from anon, authenticated;
