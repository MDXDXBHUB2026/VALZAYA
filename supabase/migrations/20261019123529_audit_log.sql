-- Migration: audit_log
-- Append-only record of every privileged change. Written by SECURITY DEFINER functions
-- (write_audit, audit_row_change, apply_order_transition) — never directly by API roles.
--
-- Rollback notes:
--   drop trigger if exists staff_members_audit on public.staff_members;
--   drop function if exists public.audit_row_change();
--   drop function if exists public.write_audit(text, text, text, jsonb, jsonb, jsonb, text);
--   drop function if exists public.current_actor_type();
--   drop table if exists public.audit_log;

create table public.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_type    text not null check (actor_type in ('staff', 'customer', 'system', 'provider')),
  actor_user_id uuid references auth.users (id) on delete set null,
  action        text not null check (length(action) between 1 and 120),
  entity_type   text not null,
  entity_id     text not null,
  before        jsonb,
  after         jsonb,
  metadata      jsonb not null default '{}'::jsonb
);

comment on table public.audit_log is 'Append-only audit trail. Owner can read; nobody can update/delete.';

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.prevent_mutation();

alter table public.audit_log enable row level security;

create policy "audit_log: owner reads"
  on public.audit_log for select
  to authenticated
  using ((select public.is_staff('owner')));
-- No insert/update/delete policies: API roles cannot write. Service role and the
-- SECURITY DEFINER helpers below write it.

-- Who is acting right now (from the JWT).
create or replace function public.current_actor_type()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 'system'
    when public.is_staff() then 'staff'
    else 'customer'
  end;
$$;

create or replace function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_actor_type  text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_type, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values (
    coalesce(p_actor_type, public.current_actor_type()),
    (select auth.uid()),
    p_action, p_entity_type, p_entity_id, p_before, p_after, coalesce(p_metadata, '{}'::jsonb)
  );
$$;

-- Generic row-change audit trigger. TG_ARGV[0] = primary key column name (default 'id').
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pk_col text := coalesce(tg_argv[0], 'id');
  rec    jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  perform public.write_audit(
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    rec ->> pk_col,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke execute on function public.current_actor_type() from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
grant execute on function public.write_audit(text, text, text, jsonb, jsonb, jsonb, text) to service_role;

create trigger staff_members_audit
  after insert or update or delete on public.staff_members
  for each row execute function public.audit_row_change('user_id');
