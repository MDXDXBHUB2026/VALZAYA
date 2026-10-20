-- Migration: checkout functions (B4a)
-- The order path, all in the database so prices, totals and stock come from one transaction and
-- never from the client. Service role only.
--   create_order_from_cart   bag -> holds (reserve_cart) -> order pending_payment + lines;
--                            the cart is converted and its holds become the order's.
--   record_payment_session   one payments row per provider session; amount from the order.
--   apply_payment_event      a verified provider webhook: stored in webhook_events (idempotent),
--                            then payment status and order status (paid / cancelled) move.
--   expire_unpaid_orders     cancels pending_payment orders past their payment window.
-- Totals: prices are VAT-inclusive; VAT is split per line and on shipping with the same rounding
-- as @valzaya/core splitInclusive(). Shipping comes from settings.shipping.rates.
-- Lock order: cart, drops, stock rows (reserve_cart); order row before stock rows on cancel.
--
-- Rollback notes:
--   drop function if exists public.expire_unpaid_orders(integer);
--   drop function if exists public.apply_payment_event(public.payment_provider, text, text, jsonb, text, text);
--   drop function if exists public.record_payment_session(uuid, public.payment_provider, text);
--   drop function if exists public.create_order_from_cart(uuid, text, text, text, jsonb, text, uuid);
--   drop function if exists private.cancel_order_release(uuid, text);
--   drop function if exists private.split_inclusive(bigint, integer);

-- net = round_half_up(gross * 10000 / (10000 + rate)), vat = gross - net. Mirrors core.
create or replace function private.split_inclusive(p_gross bigint, p_rate_bp integer)
returns table (net bigint, vat bigint)
language sql
immutable
set search_path = ''
as $$
  select (2 * p_gross * 10000 + (10000 + p_rate_bp)) / (2 * (10000 + p_rate_bp)),
         p_gross - (2 * p_gross * 10000 + (10000 + p_rate_bp)) / (2 * (10000 + p_rate_bp));
$$;

-- Cancels an unpaid order through the state machine and gives back the stock it reserved.
-- Locks the order row, then its stock rows in variant order. Caller must be the service role.
create or replace function private.cancel_order_release(p_order_id uuid, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.orders o where o.id = p_order_id for update;

  perform 1
     from public.inventory_levels l
    where l.location = 'warehouse'
      and l.variant_id in (select i.variant_id from public.order_items i
                            where i.order_id = p_order_id and i.stock_mode = 'stock')
    order by l.variant_id
      for update;

  perform public.apply_order_transition(p_order_id, 'cancelled', p_reason, '{}'::jsonb, 'system');

  insert into public.inventory_movements
    (variant_id, location, delta_reserved, reason, source, reference_type, reference_id, note)
  select i.variant_id, 'warehouse', -sum(i.quantity)::integer, 'order_released', 'manual',
         'order', p_order_id::text, p_reason
    from public.order_items i
   where i.order_id = p_order_id and i.stock_mode = 'stock' and i.variant_id is not null
   group by i.variant_id
   order by i.variant_id;
end;
$$;

revoke execute on function private.split_inclusive(bigint, integer) from public;
revoke execute on function private.cancel_order_release(uuid, text) from public;

-- Turns the cart into an order, or explains why not (reason <> 'ok', nothing changes).
-- reason: ok | empty_cart | shipping_unavailable | any reserve_cart() reason.
-- Holds are taken for 30 minutes (the payment window) and become the order's on success.
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
begin
  if p_delivery is null or p_delivery not in ('standard', 'express') then
    raise exception 'delivery must be standard or express' using errcode = '22023';
  end if;
  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'shipping address must be an object' using errcode = '22023';
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
  select p_customer_id, p_email, nullif(p_phone, ''), p_locale,
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

-- One payment attempt per provider session. The amount is always the order total.
create or replace function public.record_payment_session(
  p_order_id     uuid,
  p_provider     public.payment_provider,
  p_provider_ref text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_id    uuid;
begin
  select o.total_fils into v_total from public.orders o
   where o.id = p_order_id and o.status = 'pending_payment' for update;
  if not found then
    raise exception 'order % is not awaiting payment', p_order_id using errcode = 'P0002';
  end if;
  insert into public.payments (order_id, provider, provider_ref, status, amount_fils)
  values (p_order_id, p_provider, p_provider_ref, 'pending', v_total)
  returning id into v_id;
  return v_id;
end;
$$;

-- Applies one verified provider event. The caller has already checked the signature.
-- p_outcome: captured | failed | cancelled | expired.
-- Returns: processed | duplicate | unknown_payment | ignored (a late event for a settled payment).
-- A capture for an order that is no longer awaiting payment is recorded and flagged
-- (webhook_events.error = '... refund needed') for ops; the order is not revived.
create or replace function public.apply_payment_event(
  p_provider     public.payment_provider,
  p_event_id     text,
  p_event_type   text,
  p_payload      jsonb,
  p_provider_ref text,
  p_outcome      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   bigint;
  v_payment public.payments;
  v_status  public.order_status;
  v_note    text;
  v_result  text := 'processed';
begin
  if p_outcome is null or p_outcome not in ('captured', 'failed', 'cancelled', 'expired') then
    raise exception 'unknown payment outcome %', p_outcome using errcode = '22023';
  end if;

  -- Rule 4: store the raw event first; the unique (provider, event_id) makes redelivery a no-op.
  insert into public.webhook_events (provider, event_id, event_type, signature_ok, payload)
  values (p_provider::text, p_event_id, p_event_type, true, coalesce(p_payload, '{}'::jsonb))
  on conflict on constraint webhook_events_idempotency do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  select * into v_payment from public.payments pm
   where pm.provider = p_provider and pm.provider_ref = p_provider_ref for update;
  if not found then
    update public.webhook_events w set processed_at = now(), attempts = 1, error = 'unknown payment'
     where w.id = v_event;
    return 'unknown_payment';
  end if;
  select o.status into v_status from public.orders o where o.id = v_payment.order_id for update;

  if v_payment.status in ('captured', 'refunded', 'partially_refunded')
     or (p_outcome <> 'captured' and v_payment.status not in ('created', 'pending', 'authorized')) then
    -- Settled already: a repeat or a late failure changes nothing.
    v_result := 'ignored';
    v_note := format('payment already %s; %s ignored', v_payment.status, p_outcome);
  elsif p_outcome = 'captured' then
    -- Money was taken, so record it even if the session had expired.
    update public.payments pm
       set status = 'captured', captured_at = now(), raw_ref = p_provider::text || ':' || p_event_id
     where pm.id = v_payment.id;
    if v_status = 'pending_payment' then
      perform public.apply_order_transition(v_payment.order_id, 'paid', 'payment captured',
                                            jsonb_build_object('payment_id', v_payment.id), 'provider');
    elsif v_status <> 'paid' then
      -- Money taken for an order that was already cancelled (e.g. expired): ops must refund.
      v_note := format('captured while order is %s: refund needed', v_status);
    end if;
  else
    update public.payments pm
       set status = p_outcome::public.payment_status, raw_ref = p_provider::text || ':' || p_event_id
     where pm.id = v_payment.id;
    if v_status = 'pending_payment' then
      perform private.cancel_order_release(v_payment.order_id, 'payment ' || p_outcome);
    end if;
  end if;

  update public.webhook_events w set processed_at = now(), attempts = 1, error = v_note
   where w.id = v_event;
  return v_result;
end;
$$;

-- Cancels pending_payment orders placed more than p_minutes ago and expires their payments.
-- Safe to run at any time and in parallel (rows another call is handling are skipped).
create or replace function public.expire_unpaid_orders(p_minutes integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select o.id from public.orders o
     where o.status = 'pending_payment' and o.placed_at < now() - make_interval(mins => greatest(p_minutes, 1))
     order by o.placed_at
       for update skip locked
  loop
    update public.payments pm set status = 'expired'
     where pm.order_id = v_id and pm.status in ('created', 'pending');
    perform private.cancel_order_release(v_id, 'payment window expired');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.create_order_from_cart(uuid, text, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke execute on function public.record_payment_session(uuid, public.payment_provider, text) from public, anon, authenticated;
revoke execute on function public.apply_payment_event(public.payment_provider, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.create_order_from_cart(uuid, text, text, text, jsonb, text, uuid) to service_role;
grant execute on function public.record_payment_session(uuid, public.payment_provider, text) to service_role;
grant execute on function public.apply_payment_event(public.payment_provider, text, text, jsonb, text, text) to service_role;
grant execute on function public.expire_unpaid_orders(integer) to service_role;
