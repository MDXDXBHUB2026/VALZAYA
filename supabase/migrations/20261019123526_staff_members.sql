-- Migration: staff_members + is_staff()
-- Staff roles: owner (full access) and ops (orders, inventory, shipments, products; no
-- settings/finance writes). A user is staff only while `active`.
--
-- is_staff()        -> any active staff member
-- is_staff('ops')   -> ops OR owner (owner implies every role)
-- is_staff('owner') -> owner only
--
-- Rollback notes:
--   drop table if exists public.staff_members cascade;   -- also drops dependent policies
--   drop function if exists public.is_staff(public.staff_role);
--   drop type if exists public.staff_role;

create type public.staff_role as enum ('owner', 'ops');

create table public.staff_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         public.staff_role not null,
  display_name text not null check (length(display_name) between 1 and 120),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.staff_members is 'Manager-portal users and their role. Owner manages this table.';

create trigger staff_members_set_updated_at
  before update on public.staff_members
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER so policies on other tables can call it without recursing into
-- staff_members RLS. search_path is pinned to '' and every name is schema-qualified.
create or replace function public.is_staff(required_role public.staff_role default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members s
    where s.user_id = (select auth.uid())
      and s.active
      and (required_role is null or s.role = 'owner' or s.role = required_role)
  );
$$;

revoke execute on function public.is_staff(public.staff_role) from public;
grant execute on function public.is_staff(public.staff_role) to anon, authenticated, service_role;

alter table public.staff_members enable row level security;

create policy "staff_members: read self or owner reads all"
  on public.staff_members for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff('owner')));

create policy "staff_members: owner inserts"
  on public.staff_members for insert
  to authenticated
  with check ((select public.is_staff('owner')));

create policy "staff_members: owner updates"
  on public.staff_members for update
  to authenticated
  using ((select public.is_staff('owner')))
  with check ((select public.is_staff('owner')));

create policy "staff_members: owner deletes"
  on public.staff_members for delete
  to authenticated
  using ((select public.is_staff('owner')));
