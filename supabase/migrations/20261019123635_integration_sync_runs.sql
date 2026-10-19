-- Migration: integration_sync_runs
-- One row per adapter sync job (3PL product push, inventory pull, …). Service role writes.
--
-- Rollback notes:
--   drop table if exists public.integration_sync_runs;

create table public.integration_sync_runs (
  id          bigint generated always as identity primary key,
  provider    text not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  kind        text not null check (kind in (
                'products_push', 'inventory_pull', 'shipment_pull', 'outbound_order_push',
                'inbound_asn', 'returns_push'
              )),
  status      text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'partial')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  counts      jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  error       text,
  constraint integration_sync_runs_time_order check (finished_at is null or finished_at >= started_at)
);

create index integration_sync_runs_provider_kind_idx on public.integration_sync_runs (provider, kind, started_at desc);

alter table public.integration_sync_runs enable row level security;

create policy "integration_sync_runs: staff read"
  on public.integration_sync_runs for select
  to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.integration_sync_runs from anon, authenticated;
