-- Migration: rate_limits
-- Fixed-window counters for public forms (waitlist now; auth/checkout later). Lives in the
-- non-API `private` schema; only the service role reaches it, through public.hit_rate_limit().
-- Keys are HMAC/SHA-256 hashes computed by the app — raw IPs, emails and phones are never stored.
--
-- Rollback notes:
--   drop function if exists public.hit_rate_limit(text, text, integer, integer);
--   drop table if exists private.rate_limits;

create table private.rate_limits (
  bucket       text not null check (bucket ~ '^[a-z0-9_:]{1,40}$'),
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer not null default 1 check (hits > 0),
  primary key (bucket, key_hash, window_start)
);

create index rate_limits_window_start_idx on private.rate_limits (window_start);

-- Not exposed via the API; RLS on with no policies so only owner/service role can touch it.
alter table private.rate_limits enable row level security;
revoke all on table private.rate_limits from public, anon, authenticated;

-- Counts one hit and returns true while the caller is within p_max hits per p_window_seconds.
create or replace function public.hit_rate_limit(
  p_bucket         text,
  p_key_hash       text,
  p_max            integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, v_window, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Opportunistic cleanup instead of a cron job: ~1% of calls drop windows older than a day.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke execute on function public.hit_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, text, integer, integer) to service_role;
