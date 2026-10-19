-- Migration: helpers
-- Shared extensions and trigger functions used by every later migration.
--
-- Rollback notes:
--   drop function if exists public.prevent_mutation();
--   drop function if exists public.set_updated_at();
--   (citext is left installed; it lives in the `extensions` schema.)

create extension if not exists citext with schema extensions;

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Makes ledger / history tables append-only (attach BEFORE UPDATE OR DELETE).
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

-- Trigger functions are never called directly by API roles.
revoke execute on function public.prevent_mutation() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
