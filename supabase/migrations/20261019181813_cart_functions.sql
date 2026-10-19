-- Migration: cart functions (B3)
-- The storefront edits carts only through these functions, as the service role:
--   cart_for_guest(token_hash, create)   find (or create) the active cart behind a guest cookie
--   cart_add_item(cart, variant, qty)    add to a line (capped at 10 per line)
--   cart_set_quantity(cart, variant, qty) change a line; 0 removes it
--   merge_carts(from, into)              fold a guest cart into a signed-in one (wired in B5)
-- Every edit releases the cart's checkout holds: checkout (B4) re-reserves what the cart holds
-- at that moment, so a stale hold never blocks other buyers.
-- Guest carts live 30 days from their last edit (carts.expires_at).
--
-- Rollback notes:
--   drop function if exists public.merge_carts(uuid, uuid);
--   drop function if exists public.cart_set_quantity(uuid, uuid, integer);
--   drop function if exists public.cart_add_item(uuid, uuid, integer);
--   drop function if exists public.cart_for_guest(text, boolean);
--   drop function if exists private.lock_active_cart(uuid);

-- Locks an active cart (FOR UPDATE) or raises P0002. Also extends a guest cart's life.
create or replace function private.lock_active_cart(p_cart_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.carts c where c.id = p_cart_id and c.status = 'active' for update;
  if not found then
    raise exception 'cart % is not active', p_cart_id using errcode = 'P0002';
  end if;
  update public.carts c
     set expires_at = now() + interval '30 days'
   where c.id = p_cart_id and c.guest_token_hash is not null;
end;
$$;

revoke execute on function private.lock_active_cart(uuid) from public;

-- Returns the active cart for a guest token hash, creating it when p_create. Returns null when
-- there is none (or the hash belongs to a cart already checked out): issue a new token then.
create or replace function public.cart_for_guest(p_token_hash text, p_create boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'guest token hash must be 64 lowercase hex characters' using errcode = '22023';
  end if;

  select c.id into v_id from public.carts c
   where c.guest_token_hash = p_token_hash and c.status = 'active';
  if v_id is not null or not coalesce(p_create, false) then
    return v_id;
  end if;

  insert into public.carts (guest_token_hash, expires_at)
  values (p_token_hash, now() + interval '30 days')
  on conflict (guest_token_hash) do nothing
  returning id into v_id;

  if v_id is null then
    -- Created by a parallel request, or the hash belongs to a cart that is no longer active.
    select c.id into v_id from public.carts c
     where c.guest_token_hash = p_token_hash and c.status = 'active';
  end if;
  return v_id;
end;
$$;

-- Adds p_quantity to a line (creating it). The line is capped at 10. Returns the new quantity.
-- Only active variants of active products can be added (P0002 otherwise).
create or replace function public.cart_add_item(p_cart_id uuid, p_variant_id uuid, p_quantity integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer;
begin
  if p_quantity is null or p_quantity not between 1 and 10 then
    raise exception 'quantity must be between 1 and 10' using errcode = '22023';
  end if;
  perform private.lock_active_cart(p_cart_id);

  if not exists (select 1 from public.product_variants v
                   join public.products p on p.id = v.product_id
                  where v.id = p_variant_id and v.active and p.status = 'active') then
    raise exception 'variant % is not on sale', p_variant_id using errcode = 'P0002';
  end if;

  insert into public.cart_items as ci (cart_id, variant_id, quantity)
  values (p_cart_id, p_variant_id, p_quantity)
  on conflict (cart_id, variant_id)
    do update set quantity = least(ci.quantity + excluded.quantity, 10)
  returning ci.quantity into v_qty;

  perform public.release_cart_reservations(p_cart_id);
  return v_qty;
end;
$$;

-- Sets a line's quantity (0 removes it). Never creates a line. Returns the new quantity
-- (0 when removed or when there was no such line).
create or replace function public.cart_set_quantity(p_cart_id uuid, p_variant_id uuid, p_quantity integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer;
begin
  if p_quantity is null or p_quantity not between 0 and 10 then
    raise exception 'quantity must be between 0 and 10' using errcode = '22023';
  end if;
  perform private.lock_active_cart(p_cart_id);

  if p_quantity = 0 then
    delete from public.cart_items ci where ci.cart_id = p_cart_id and ci.variant_id = p_variant_id;
    v_qty := 0;
  else
    update public.cart_items ci set quantity = p_quantity
     where ci.cart_id = p_cart_id and ci.variant_id = p_variant_id
    returning ci.quantity into v_qty;
  end if;

  perform public.release_cart_reservations(p_cart_id);
  return coalesce(v_qty, 0);
end;
$$;

-- Folds every line of p_from into p_into (quantities add up, capped at 10 per line), then
-- marks p_from abandoned. Returns the number of lines merged. Used at sign-in (B5).
create or replace function public.merge_carts(p_from uuid, p_into uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_from is null or p_into is null or p_from = p_into then
    raise exception 'merge needs two different carts' using errcode = '22023';
  end if;
  -- Lock both carts in id order (same order as reserve_cart: cart rows first).
  if p_from < p_into then
    perform private.lock_active_cart(p_from);
    perform private.lock_active_cart(p_into);
  else
    perform private.lock_active_cart(p_into);
    perform private.lock_active_cart(p_from);
  end if;

  insert into public.cart_items as ci (cart_id, variant_id, quantity)
  select p_into, f.variant_id, f.quantity
    from public.cart_items f where f.cart_id = p_from
  on conflict (cart_id, variant_id)
    do update set quantity = least(ci.quantity + excluded.quantity, 10);
  get diagnostics v_count = row_count;

  perform public.release_cart_reservations(p_from);
  perform public.release_cart_reservations(p_into);
  update public.carts c set status = 'abandoned' where c.id = p_from;
  return v_count;
end;
$$;

revoke execute on function public.cart_for_guest(text, boolean) from public, anon, authenticated;
revoke execute on function public.cart_add_item(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.cart_set_quantity(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.merge_carts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cart_for_guest(text, boolean) to service_role;
grant execute on function public.cart_add_item(uuid, uuid, integer) to service_role;
grant execute on function public.cart_set_quantity(uuid, uuid, integer) to service_role;
grant execute on function public.merge_carts(uuid, uuid) to service_role;
