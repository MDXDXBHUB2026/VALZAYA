-- Minimal stand-ins for what a Supabase project provides, so the migrations and the database
-- test suites run on a plain Postgres 16 (CI, or a throwaway local database). Not a migration;
-- never applied to a Supabase project. Used by supabase/tests/run-db-tests.sh.
do $r$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
  end if;
end
$r$;
grant anon, authenticated, service_role to current_user;

create schema auth;
create schema extensions;
create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

create extension if not exists pgcrypto;
create extension if not exists pgtap with schema extensions;

create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint,
                              allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;

-- Supabase grants API roles on new public objects by default; RLS and explicit revokes do the rest.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
