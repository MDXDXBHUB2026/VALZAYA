-- Migration: customers
-- One profile per auth user (customers.id = auth.users.id), created automatically on sign-up.
-- Guest checkout does not create a customer row; guest orders carry email on the order.
--
-- Rollback notes:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_auth_user();
--   drop table if exists public.customers cascade;

create table public.customers (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            extensions.citext not null,
  full_name        text check (full_name is null or length(full_name) <= 200),
  phone            text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'ar')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.customers.phone is 'E.164, e.g. +971501234567';

create index customers_email_idx on public.customers (email);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- Create the profile when an auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customers (id, email)
  values (new.id, coalesce(new.email, new.id::text || '@no-email.invalid'))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.customers enable row level security;

create policy "customers: read own (staff read all)"
  on public.customers for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy "customers: update own"
  on public.customers for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "customers: owner updates any"
  on public.customers for update
  to authenticated
  using ((select public.is_staff('owner')))
  with check ((select public.is_staff('owner')));

-- Customers may only change these columns; email changes go through Supabase Auth.
revoke insert, update, delete on public.customers from anon, authenticated;
grant update (full_name, phone, preferred_locale) on public.customers to authenticated;
