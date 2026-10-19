-- Migration: webhook_events
-- Every inbound webhook is stored raw BEFORE processing (CLAUDE.md rule 4). The idempotency
-- key is (provider, event_id): a duplicate delivery hits the unique constraint and is skipped.
-- Service role only for writes; owner can read for debugging.
--
-- Rollback notes:
--   drop table if exists public.webhook_events;

create table public.webhook_events (
  id           bigint generated always as identity primary key,
  provider     text not null check (provider ~ '^[a-z0-9_]{2,40}$'),
  event_id     text not null check (length(event_id) between 1 and 255),
  event_type   text check (event_type is null or length(event_type) <= 120),
  signature_ok boolean not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  attempts     integer not null default 0 check (attempts >= 0),
  error        text,
  constraint webhook_events_idempotency unique (provider, event_id)
);

create index webhook_events_unprocessed_idx on public.webhook_events (received_at) where processed_at is null;

alter table public.webhook_events enable row level security;

create policy "webhook_events: owner reads"
  on public.webhook_events for select
  to authenticated
  using ((select public.is_staff('owner')));

revoke insert, update, delete on public.webhook_events from anon, authenticated;
