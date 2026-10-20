-- Migration: accounts + early access (B5a)
-- Decisions (2026-10-20): ordering needs a signed-in customer (guests may still fill a bag);
-- during a drop's early_access window only (a) customers whose verified account email is on
-- that drop's waitlist (or the general waitlist) or (b) customers who redeemed a personal access
-- code for the drop may order. Codes are single-use per person, issued on request by the owner.
--   drop_access_codes        hashed codes; a code is bound to the first customer who redeems it
--   issue_access_codes       generates codes for a drop, returns them once (only hashes stored)
--   redeem_access_code       binds a code to a signed-in customer
--   cart_for_customer        the signed-in customer's active bag
--   claim_guest_cart         at sign-in: adopt the guest bag, or merge it into the customer's
--   create_order_from_cart   replaced: login_required / early_access_only refusals; the order
--                            email is the customer's account email
-- All service role only.
--
-- Rollback notes:
--   re-create public.create_order_from_cart from 20261020023844_checkout_functions.sql;
--   drop function if exists public.claim_guest_cart(text, uuid);
--   drop function if exists public.cart_for_customer(uuid, boolean);
--   drop function if exists public.redeem_access_code(uuid, text);
--   drop function if exists public.issue_access_codes(uuid, integer, text);
--   drop function if exists private.early_access_allowed(uuid, uuid);
--   drop function if exists private.access_code_hash(text);
--   drop table if exists public.drop_access_codes;

create table public.drop_access_codes (
  id          uuid primary key default gen_random_uuid(),
  drop_id     uuid not null references public.drops (id) on delete cascade,
  code_hash   text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  note        text check (note is null or length(note) <= 200),
  redeemed_by uuid references public.customers (id) on delete set null,
  redeemed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint drop_access_codes_redeemed check (redeemed_by is null or redeemed_at is not null)
);

comment on table public.drop_access_codes is 'Personal early-access codes; only SHA-256 hashes are stored.';

create index drop_access_codes_drop_idx on public.drop_access_codes (drop_id);
create index drop_access_codes_redeemed_by_idx on public.drop_access_codes (redeemed_by);

alter table public.drop_access_codes enable row level security;

create policy "drop_access_codes: staff read"
  on public.drop_access_codes for select
  to authenticated
  using ((select public.is_staff()));

revoke insert, update, delete on public.drop_access_codes from anon, authenticated;

-- Codes are compared case- and separator-insensitively: "vz-ab2cd ef3gh" = "VZ-AB2CD-EF3GH".
create or replace function private.access_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('valzaya-access:' || upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

create or replace function private.early_access_allowed(p_customer_id uuid, p_drop_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.waitlist_signups w
             join public.customers c on c.id = p_customer_id
            where (w.drop_id = p_drop_id or w.drop_id is null)
              -- lower(): with search_path = '' the citext operator is not in scope.
              and (w.customer_id = p_customer_id or lower(w.email::text) = lower(c.email::text)))
      or exists (
           select 1 from public.drop_access_codes a
            where a.drop_id = p_drop_id and a.redeemed_by = p_customer_id);
$$;

revoke execute on function private.access_code_hash(text) from public;
revoke execute on function private.early_access_allowed(uuid, uuid) from public;

-- Generates p_count codes (VZ-XXXXX-XXXXX, no look-alike characters) and returns them once.
create or replace function public.issue_access_codes(p_drop_id uuid, p_count integer, p_note text default null)
returns table (code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes    bytea;
  v_chars    text;
  v_code     text;
  i          integer;
begin
  if p_count is null or p_count not between 1 and 500 then
    raise exception 'count must be between 1 and 500' using errcode = '22023';
  end if;
  if not exists (select 1 from public.drops d where d.id = p_drop_id) then
    raise exception 'drop % not found', p_drop_id using errcode = 'P0002';
  end if;
  for n in 1 .. p_count loop
    loop
      v_bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
      v_chars := '';
      for i in 0 .. 9 loop
        v_chars := v_chars || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
      end loop;
      v_code := 'VZ-' || substr(v_chars, 1, 5) || '-' || substr(v_chars, 6, 5);
      begin
        insert into public.drop_access_codes (drop_id, code_hash, note)
        values (p_drop_id, private.access_code_hash(v_code), p_note);
        exit;
      exception when unique_violation then
        -- astronomically unlikely; draw again
      end;
    end loop;
    code := v_code;
    return next;
  end loop;
end;
$$;

-- Binds a code to a customer. reason: ok | invalid | used | closed (drop no longer published).
-- Redeeming a code you already hold is ok (idempotent).
create or replace function public.redeem_access_code(p_customer_id uuid, p_code text)
returns table (drop_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.drop_access_codes;
begin
  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;
  select * into v_row from public.drop_access_codes a
   where a.code_hash = private.access_code_hash(p_code) for update;
  if not found then
    return query select null::uuid, 'invalid'::text;
    return;
  end if;
  if v_row.redeemed_by is not null and v_row.redeemed_by <> p_customer_id then
    return query select null::uuid, 'used'::text;
    return;
  end if;
  if not exists (select 1 from public.drops d
                  where d.id = v_row.drop_id and d.status in ('scheduled', 'early_access', 'open')) then
    return query select v_row.drop_id, 'closed'::text;
    return;
  end if;
  update public.drop_access_codes a set redeemed_by = p_customer_id, redeemed_at = coalesce(a.redeemed_at, now())
   where a.id = v_row.id;
  return query select v_row.drop_id, 'ok'::text;
end;
$$;

-- The signed-in customer's active bag (created when p_create). At most one per customer.
create or replace function public.cart_for_customer(p_customer_id uuid, p_create boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id from public.carts c where c.customer_id = p_customer_id and c.status = 'active';
  if v_id is not null or not coalesce(p_create, false) then
    return v_id;
  end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;
  insert into public.carts (customer_id) values (p_customer_id)
  on conflict (customer_id) where status = 'active' and customer_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.carts c where c.customer_id = p_customer_id and c.status = 'active';
  end if;
  return v_id;
end;
$$;

-- At sign-in: the guest bag becomes the customer's (adopted when they have none, merged when they
-- do). Returns the customer's active bag (null when neither exists).
create or replace function public.claim_guest_cart(p_token_hash text, p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guest uuid;
  v_mine  uuid;
begin
  v_guest := public.cart_for_guest(p_token_hash, false);
  v_mine := public.cart_for_customer(p_customer_id, false);
  if v_guest is null then
    return v_mine;
  end if;
  if v_mine is null then
    update public.carts c set customer_id = p_customer_id, guest_token_hash = null
     where c.id = v_guest;
    return v_guest;
  end if;
  perform public.merge_carts(v_guest, v_mine);
  return v_mine;
end;
$$;

revoke execute on function public.issue_access_codes(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.redeem_access_code(uuid, text) from public, anon, authenticated;
revoke execute on function public.cart_for_customer(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.claim_guest_cart(text, uuid) from public, anon, authenticated;
grant execute on function public.issue_access_codes(uuid, integer, text) to service_role;
grant execute on function public.redeem_access_code(uuid, text) to service_role;
grant execute on function public.cart_for_customer(uuid, boolean) to service_role;
grant execute on function public.claim_guest_cart(text, uuid) to service_role;

-- create_order_from_cart, now with the login and early-access checks ------------------------------
-- reason: ok | login_required | early_access_only | empty_cart | shipping_unavailable |
--         any reserve_cart() reason. p_email is ignored: the customer's account email is used.
create or replace function public.create_order_from_cart(
  p_cart_id          uuid,
  p_email            text,
  p_phone            text,
  p_locale           text,
  p_shipping_address jsonb,
  p_delivery         text,
  p_customer_id      uuid default null
)
returns table (order_id uuid, order_number text, total_fils bigint, reason text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_country text := upper(coalesce(p_shipping_address ->> 'country_code', ''));
  v_ship    bigint;
  v_rate_bp integer;
  v_lines   integer;
  v_fail    text;
  v_order   public.orders;
  v_email   text;
  v_gated   boolean;
begin
  if p_delivery is null or p_delivery not in ('standard', 'express') then
    raise exception 'delivery must be standard or express' using errcode = '22023';
  end if;
  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'shipping address must be an object' using errcode = '22023';
  end if;

  -- Orders need a signed-in customer; the order email is their verified account email.
  select c.email::text into v_email from public.customers c where c.id = p_customer_id;
  if v_email is null then
    return query select null::uuid, null::text, null::bigint, 'login_required'::text;
    return;
  end if;

  -- Early access: only waitlisted customers or code holders may buy from an early_access drop.
  select bool_or(not private.early_access_allowed(p_customer_id, d.id)) into v_gated
    from public.drops d
   where d.status = 'early_access'
     and d.id in (select private.variant_drop(ci.variant_id)
                    from public.cart_items ci where ci.cart_id = p_cart_id);
  if coalesce(v_gated, false) then
    return query select null::uuid, null::text, null::bigint, 'early_access_only'::text;
    return;
  end if;

  select (s.value -> v_country ->> (p_delivery || '_fils'))::bigint into v_ship
    from public.settings s where s.key = 'shipping.rates';
  if v_ship is null then
    return query select null::uuid, null::text, null::bigint, 'shipping_unavailable'::text;
    return;
  end if;
  select coalesce((select (s.value #>> '{}')::integer from public.settings s where s.key = 'vat.rate_bp'), 500)
    into v_rate_bp;

  -- Hold every line, all or nothing (locks cart, drops and stock rows).
  select count(*)::integer, (array_agg(r.reason order by r.variant_id) filter (where not r.reserved))[1]
    into v_lines, v_fail
    from public.reserve_cart(p_cart_id, 30) r;
  if v_lines = 0 then
    return query select null::uuid, null::text, null::bigint, 'empty_cart'::text;
    return;
  end if;
  if v_fail is not null then
    return query select null::uuid, null::text, null::bigint, v_fail;
    return;
  end if;

  -- Prices come from product_variants now, never from the client or the bag.
  insert into public.orders (customer_id, email, phone, locale, subtotal_net_fils, vat_fils, total_fils,
                             shipping_fils, vat_rate_bp, delivery_promise_date, has_made_to_order_lines,
                             shipping_address, cart_id, drop_id)
  with l as (
    select ir.drop_id, v.stock_mode, v.preorder_ship_date, (v.price_fils * ir.quantity)::bigint as gross
      from public.inventory_reservations ir
      join public.product_variants v on v.id = ir.variant_id
     where ir.cart_id = p_cart_id and ir.status = 'active'
  ), s as (
    select l.*, x.net, x.vat from l cross join lateral private.split_inclusive(l.gross, v_rate_bp) x
  ), sh as (
    select x.net, x.vat from private.split_inclusive(v_ship, v_rate_bp) x
  )
  select p_customer_id, v_email, nullif(p_phone, ''), p_locale,
         (select sum(s.net) from s) + (select sh.net from sh),
         (select sum(s.vat) from s) + (select sh.vat from sh),
         (select sum(s.gross) from s) + v_ship,
         v_ship, v_rate_bp,
         (select max(s.preorder_ship_date) from s),
         (select bool_or(s.stock_mode <> 'stock') from s),
         p_shipping_address, p_cart_id,
         (select (array_agg(s.drop_id order by s.drop_id) filter (where s.drop_id is not null))[1] from s)
  returning * into v_order;

  insert into public.order_items (order_id, variant_id, drop_id, sku, product_name_en, product_name_ar,
                                  colour_en, colour_ar, size, stock_mode, preorder_ship_date, quantity,
                                  unit_price_fils, vat_rate_bp, line_net_fils, line_vat_fils, line_total_fils)
  select v_order.id, ir.variant_id, ir.drop_id, v.sku, p.name_en, p.name_ar, v.colour_en, v.colour_ar,
         v.size, v.stock_mode, v.preorder_ship_date, ir.quantity, v.price_fils, v_rate_bp,
         x.net, x.vat, v.price_fils * ir.quantity
    from public.inventory_reservations ir
    join public.product_variants v on v.id = ir.variant_id
    join public.products p on p.id = v.product_id
    cross join lateral private.split_inclusive((v.price_fils * ir.quantity)::bigint, v_rate_bp) x
   where ir.cart_id = p_cart_id and ir.status = 'active'
   order by v.sort_order, v.sku;

  -- The holds now belong to the order (they keep the stock reserved until shipment or cancel).
  update public.inventory_reservations ir
     set status = 'converted', order_id = v_order.id
   where ir.cart_id = p_cart_id and ir.status = 'active';
  update public.carts c set status = 'converted' where c.id = p_cart_id;

  return query select v_order.id, v_order.order_number, v_order.total_fils, 'ok'::text;
end;
$$;

revoke execute on function public.create_order_from_cart(uuid, text, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.create_order_from_cart(uuid, text, text, text, jsonb, text, uuid) to service_role;
