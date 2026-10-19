-- Migration: settings
-- Key/value store config. Owner only, except rows flagged is_public (e.g. store.open) which
-- the storefront may read anonymously. Every change is audited.
--
-- Rollback notes:
--   drop table if exists public.settings;

create table public.settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  description text,
  updated_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index settings_updated_by_idx on public.settings (updated_by);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

create trigger settings_audit
  after insert or update or delete on public.settings
  for each row execute function public.audit_row_change('key');

alter table public.settings enable row level security;

create policy "settings: public rows readable, owner reads all"
  on public.settings for select
  to anon, authenticated
  using (is_public or (select public.is_staff('owner')));

create policy "settings: owner inserts"
  on public.settings for insert
  to authenticated
  with check ((select public.is_staff('owner')));

create policy "settings: owner updates"
  on public.settings for update
  to authenticated
  using ((select public.is_staff('owner')))
  with check ((select public.is_staff('owner')));

create policy "settings: owner deletes"
  on public.settings for delete
  to authenticated
  using ((select public.is_staff('owner')));
