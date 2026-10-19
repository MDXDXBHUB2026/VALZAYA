-- Migration: reservation functions + capped-drop accounting
-- Never oversell: holds for a cart are checked and written under row locks, all or nothing.
--
-- Drop accounting. A variant counts against the lowest-numbered published drop that lists it
-- (status scheduled / early_access / open, not past closes_at). Units used by a drop =
--   lines of non-cancelled orders with order_items.drop_id = the drop
-- + active, unexpired reservations for the drop.
-- drops.unit_cap caps the drop; drop_items.unit_cap (optional) caps one variant within it.
-- Only cancelled orders give units back (a refund after payment does not).
--
-- Lock order (prevents deadlocks): the cart row, then drops by id, then warehouse
-- inventory_levels rows by variant_id. Every function that takes these locks uses this order.
--
-- Callers:
--   reserve_cart                 service_role (checkout, B4)
--   release_cart_reservations    service_role (cart emptied / abandoned)
--   release_expired_reservations service_role (on demand; can be scheduled later)
--   drop_units_left              anon/authenticated: the public "N of M left" counter
--   variant_availability         replaced: now also false when the drop or variant cap is used up
--
-- Rollback notes:
--   drop function if exists public.reserve_cart(uuid, integer);
--   drop function if exists public.release_cart_reservations(uuid);
--   drop function if exists public.release_expired_reservations(integer);
--   drop function if exists public.drop_units_left(uuid);
--   drop function if exists private.release_reservations(uuid[], text);
--   drop function if exists private.drop_units_used(uuid, uuid);
--   drop function if exists private.drop_variant_units_used(uuid, uuid, uuid);
--   drop function if exists private.variant_drop(uuid);
--   then restore variant_availability from 20261019153520_variant_availability.sql.

-- The drop a variant currently counts against (null = not in any published drop).
create or replace function private.variant_drop(p_variant_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select d.id
    from public.drop_items di
    join public.drops d on d.id = di.drop_id
   where di.variant_id = p_variant_id
     and d.status in ('scheduled', 'early_access', 'open')
     and (d.closes_at is null or d.closes_at > now())
   order by d.number
   limit 1;
$$;

-- Units a drop has used, optionally ignoring one cart's own holds.
create or replace function private.drop_units_used(p_drop_id uuid, p_exclude_cart uuid default null)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((
           select sum(i.quantity)
             from public.order_items i
             join public.orders o on o.id = i.order_id
            where i.drop_id = p_drop_id and o.status <> 'cancelled'), 0)
       + coalesce((
           select sum(r.quantity)
             from public.inventory_reservations r
            where r.drop_id = p_drop_id and r.status = 'active' and r.expires_at > now()
              and r.cart_id is distinct from p_exclude_cart), 0);
$$;

create or replace function private.drop_variant_units_used(p_drop_id uuid, p_variant_id uuid,
                                                          p_exclude_cart uuid default null)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((
           select sum(i.quantity)
             from public.order_items i
             join public.orders o on o.id = i.order_id
            where i.drop_id = p_drop_id and i.variant_id = p_variant_id
              and o.status <> 'cancelled'), 0)
       + coalesce((
           select sum(r.quantity)
             from public.inventory_reservations r
            where r.drop_id = p_drop_id and r.variant_id = p_variant_id
              and r.status = 'active' and r.expires_at > now()
              and r.cart_id is distinct from p_exclude_cart), 0);
$$;

-- Marks active holds released and gives back the stock they reserved.
-- The caller must already hold the inventory_levels row locks (lock order above).
create or replace function private.release_reservations(p_ids uuid[], p_note text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  with released as (
    update public.inventory_reservations r
       set status = 'released', released_at = now()
     where r.id = any (p_ids) and r.status = 'active'
    returning r.id, r.variant_id, r.location, r.quantity
  ), stock as (
    insert into public.inventory_movements
      (variant_id, location, delta_reserved, reason, source, reference_type, reference_id, note)
    select variant_id, location, -quantity, 'order_released', 'manual',
           'cart_reservation', id::text, p_note
      from released
     where location is not null
     order by variant_id
  )
  select count(*) into v_count from released;
  return v_count;
end;
$$;

revoke execute on function private.variant_drop(uuid) from public;
revoke execute on function private.drop_units_used(uuid, uuid) from public;
revoke execute on function private.drop_variant_units_used(uuid, uuid, uuid) from public;
revoke execute on function private.release_reservations(uuid[], text) from public;

-- reserve_cart: hold every line of an active cart for p_hold_minutes, or nothing at all.
-- Returns one row per cart line. reason is one of:
--   ok            held
--   not_on_sale   variant/product inactive, or its drop is not selling (scheduled / closed),
--                 or a preorder/mto variant that is in no published drop
--   out_of_stock  stock-mode variant without enough warehouse stock
--   variant_cap   drop_items.unit_cap for this variant would be exceeded
--   drop_cap      drops.unit_cap would be exceeded by this cart's lines in that drop
-- When any line is not ok, nothing changes and the cart keeps any holds it already had.
-- Calling it again refreshes the holds (new quantities, new expiry); it never double counts.
-- Early-access gating (who may buy while a drop is early_access) is the caller's job (B5).
create or replace function public.reserve_cart(p_cart_id uuid, p_hold_minutes integer default 20)
returns table (variant_id uuid, quantity integer, reserved boolean, reason text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status   public.cart_status;
  v_expires  timestamptz;
  v_all_ok   boolean := true;
  v_ids      uuid[] := '{}';
  v_qty      integer[] := '{}';
  v_reason   text[] := '{}';
  v_drop     uuid[] := '{}';
  v_stock    boolean[] := '{}';
  r          record;
  v_why      text;
  v_cap      integer;
  v_avail    bigint;
begin
  if p_hold_minutes is null or p_hold_minutes not between 1 and 60 then
    raise exception 'hold minutes must be between 1 and 60' using errcode = '22023';
  end if;

  -- Serialises calls for the same cart.
  select c.status into v_status from public.carts c where c.id = p_cart_id for update;
  if not found or v_status <> 'active' then
    raise exception 'cart % is not active', p_cart_id using errcode = 'P0002';
  end if;

  perform 1
     from public.drops d
    where d.id in (select private.variant_drop(ci.variant_id)
                     from public.cart_items ci where ci.cart_id = p_cart_id)
    order by d.id
      for update;

  perform 1
     from public.inventory_levels l
    where l.location = 'warehouse'
      and l.variant_id in (select ci.variant_id from public.cart_items ci
                            where ci.cart_id = p_cart_id)
    order by l.variant_id
      for update;

  -- Expired holds on these variants (any cart) give their stock back before we check.
  -- SKIP LOCKED: never wait on another cart's rows (that cart may be mid-delete).
  perform private.release_reservations(array(
    select ir.id from public.inventory_reservations ir
     where ir.status = 'active' and ir.expires_at <= now()
       and ir.variant_id in (select ci.variant_id from public.cart_items ci
                              where ci.cart_id = p_cart_id)
       for update skip locked), 'expired');

  for r in
    select ci.variant_id as vid, ci.quantity as qty, v.stock_mode,
           (v.active and p.status = 'active') as active,
           private.variant_drop(ci.variant_id) as drop_id
      from public.cart_items ci
      join public.product_variants v on v.id = ci.variant_id
      join public.products p on p.id = v.product_id
     where ci.cart_id = p_cart_id
     order by ci.variant_id
  loop
    v_why := 'ok';

    if not r.active then
      v_why := 'not_on_sale';
    elsif r.drop_id is null and r.stock_mode <> 'stock' then
      v_why := 'not_on_sale';
    elsif r.drop_id is not null and not exists (
            select 1 from public.drops d
             where d.id = r.drop_id and d.status in ('early_access', 'open')) then
      v_why := 'not_on_sale';
    end if;

    if v_why = 'ok' and r.stock_mode = 'stock' then
      -- Available now, plus what this cart already holds on the variant (it is replaced).
      select coalesce(sum(l.available), 0)
             + coalesce((select sum(ir.quantity) from public.inventory_reservations ir
                          where ir.cart_id = p_cart_id and ir.variant_id = r.vid
                            and ir.status = 'active' and ir.location = 'warehouse'), 0)
        into v_avail
        from public.inventory_levels l
       where l.variant_id = r.vid and l.location = 'warehouse';
      if v_avail < r.qty then
        v_why := 'out_of_stock';
      end if;
    end if;

    if v_why = 'ok' and r.drop_id is not null then
      select di.unit_cap into v_cap
        from public.drop_items di where di.drop_id = r.drop_id and di.variant_id = r.vid;
      if v_cap is not null
         and private.drop_variant_units_used(r.drop_id, r.vid, p_cart_id) + r.qty > v_cap then
        v_why := 'variant_cap';
      end if;
    end if;

    if v_why = 'ok' and r.drop_id is not null then
      select d.unit_cap into v_cap from public.drops d where d.id = r.drop_id;
      if private.drop_units_used(r.drop_id, p_cart_id)
         + (select sum(ci.quantity) from public.cart_items ci
             where ci.cart_id = p_cart_id and private.variant_drop(ci.variant_id) = r.drop_id)
         > v_cap then
        v_why := 'drop_cap';
      end if;
    end if;

    v_all_ok := v_all_ok and v_why = 'ok';
    v_ids    := v_ids || r.vid;
    v_qty    := v_qty || r.qty;
    v_reason := v_reason || v_why;
    v_drop   := v_drop || r.drop_id;
    v_stock  := v_stock || (r.stock_mode = 'stock');
  end loop;

  if v_all_ok then
    v_expires := now() + make_interval(mins => p_hold_minutes);

    -- Replace this cart's holds: give back the old ones, then take the new ones.
    perform private.release_reservations(array(
      select ir.id from public.inventory_reservations ir
       where ir.cart_id = p_cart_id and ir.status = 'active'), 'replaced');

    insert into public.inventory_reservations (cart_id, variant_id, drop_id, location, quantity, expires_at)
    select p_cart_id, u.vid, u.did, case when u.stock then 'warehouse'::public.inventory_location end,
           u.qty, v_expires
      from unnest(v_ids, v_drop, v_stock, v_qty) as u (vid, did, stock, qty);

    insert into public.inventory_movements
      (variant_id, location, delta_reserved, reason, source, reference_type, reference_id, note)
    select ir.variant_id, 'warehouse', ir.quantity, 'order_reserved', 'manual',
           'cart_reservation', ir.id::text, 'checkout hold'
      from public.inventory_reservations ir
     where ir.cart_id = p_cart_id and ir.status = 'active' and ir.location = 'warehouse'
     order by ir.variant_id;
  end if;

  return query
    select u.vid, u.qty, v_all_ok, u.why, case when v_all_ok then v_expires end
      from unnest(v_ids, v_qty, v_reason) as u (vid, qty, why);
end;
$$;

-- Gives back every active hold of one cart. Returns how many were released.
create or replace function public.release_cart_reservations(p_cart_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.carts c where c.id = p_cart_id for update;

  perform 1
     from public.inventory_levels l
    where l.location = 'warehouse'
      and l.variant_id in (select ir.variant_id from public.inventory_reservations ir
                            where ir.cart_id = p_cart_id and ir.status = 'active')
    order by l.variant_id
      for update;

  return private.release_reservations(array(
    select ir.id from public.inventory_reservations ir
     where ir.cart_id = p_cart_id and ir.status = 'active'), 'cart released');
end;
$$;

-- Gives back up to p_limit expired holds (oldest first). Safe to run at any time, in parallel.
create or replace function public.release_expired_reservations(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidates uuid[];
  v_ids        uuid[];
begin
  v_candidates := array(
    select ir.id from public.inventory_reservations ir
     where ir.status = 'active' and ir.expires_at <= now()
     order by ir.expires_at
     limit greatest(p_limit, 0));
  if cardinality(v_candidates) = 0 then
    return 0;
  end if;

  -- Stock rows first (lock order), then the holds themselves, skipping any another
  -- transaction is already releasing.
  perform 1
     from public.inventory_levels l
    where l.location = 'warehouse'
      and l.variant_id in (select ir.variant_id from public.inventory_reservations ir
                            where ir.id = any (v_candidates))
    order by l.variant_id
      for update;

  v_ids := array(
    select ir.id from public.inventory_reservations ir
     where ir.id = any (v_candidates) and ir.status = 'active' and ir.expires_at <= now()
       for update skip locked);

  return private.release_reservations(v_ids, 'expired');
end;
$$;

-- Public counter for a published drop: units still available to buy (never negative).
-- Null for a draft or unknown drop. Exposes nothing per variant.
create or replace function public.drop_units_left(p_drop_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(d.unit_cap - private.drop_units_used(d.id), 0)::integer
    from public.drops d
   where d.id = p_drop_id and d.status <> 'draft';
$$;

-- Same contract as before (one boolean per active variant, never counts), now also false when
-- the variant's drop or its per-variant cap is used up. Stock held by expired reservations
-- counts as available even before release_expired_reservations() runs.
create or replace function public.variant_availability(p_product_id uuid)
returns table (variant_id uuid, available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with vd as (
    select v.id, v.stock_mode, private.variant_drop(v.id) as drop_id
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.product_id = p_product_id
       and v.active
       and p.status = 'active'
  )
  select vd.id,
         (vd.stock_mode <> 'stock'
          or coalesce((select sum(l.available) from public.inventory_levels l
                        where l.variant_id = vd.id and l.location = 'warehouse'), 0)
           + coalesce((select sum(ir.quantity) from public.inventory_reservations ir
                        where ir.variant_id = vd.id and ir.status = 'active'
                          and ir.location = 'warehouse' and ir.expires_at <= now()), 0) > 0)
         and (vd.drop_id is null or (
              (select d.unit_cap from public.drops d where d.id = vd.drop_id)
                > private.drop_units_used(vd.drop_id)
              and coalesce((select di.unit_cap from public.drop_items di
                             where di.drop_id = vd.drop_id and di.variant_id = vd.id)
                             > private.drop_variant_units_used(vd.drop_id, vd.id), true)))
    from vd;
$$;

revoke execute on function public.reserve_cart(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_cart_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations(integer) from public, anon, authenticated;
grant execute on function public.reserve_cart(uuid, integer) to service_role;
grant execute on function public.release_cart_reservations(uuid) to service_role;
grant execute on function public.release_expired_reservations(integer) to service_role;

revoke execute on function public.drop_units_left(uuid) from public;
grant execute on function public.drop_units_left(uuid) to anon, authenticated, service_role;
