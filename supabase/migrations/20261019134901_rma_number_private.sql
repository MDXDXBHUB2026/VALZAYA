-- Migration: rma_number_private
-- Security Advisor lint 0029: public.next_rma_number() was callable by any signed-in user via
-- /rest/v1/rpc/next_rma_number, letting a customer burn RMA numbers and read return volume.
-- Revoking EXECUTE is not an option: it is the default for returns.rma_no, and customers may
-- open returns on their own orders. Instead move it (and its sequence) to a `private` schema
-- that PostgREST/GraphQL do not expose. Column defaults reference the function by OID, so
-- returns.rma_no keeps working unchanged.
--
-- Rollback notes:
--   alter function private.next_rma_number() set schema public;
--   alter sequence private.rma_number_seq set schema public;
--   then re-create public.next_rma_number() with nextval('public.rma_number_seq')
--   (body as in 20261019123626_returns.sql);
--   drop schema if exists private;   -- only if nothing else lives there

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter sequence public.rma_number_seq set schema private;
alter function public.next_rma_number() set schema private;

-- Body referenced the sequence by its old qualified name (search_path is '').
create or replace function private.next_rma_number()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n text := nextval('private.rma_number_seq')::text;
begin
  return 'RMA-' || lpad(n, greatest(6, length(n)), '0');
end;
$$;

revoke execute on function private.next_rma_number() from public, anon;
grant execute on function private.next_rma_number() to authenticated, service_role;
