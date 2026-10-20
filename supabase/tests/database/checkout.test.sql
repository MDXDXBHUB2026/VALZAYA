-- Checkout function tests (pgTAP): order creation, payment events, expiry. Runs as the migration
-- owner with service-role claims (apply_order_transition checks them), rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select plan(44);

-- Fixtures ---------------------------------------------------------------------------------------
-- STOCK (105.00, 3 in the warehouse) and PRE (pre-order 200.00, ships 2026-12-15) in an open drop
-- capped at 10. Shipping: AE standard free, express 35.00; nothing international.
insert into public.settings (key, value, is_public) values
  ('shipping.rates', '{"AE": {"standard_fils": 0, "express_fils": 3500}, "international": null}', true),
  ('vat.rate_bp', '500', true)
on conflict (key) do update set value = excluded.value;

insert into auth.users (id, instance_id, aud, role, email) values
  ('d5000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@valzaya.test'),
  ('d5000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@valzaya.test'),
  ('d5000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@valzaya.test');

insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ('d7000000-0000-4000-8000-000000000001', 'test-checkout-product', 'TSTCHK', 'unisex', 'Checkout', 'دفع',
        'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active) values
  ('d7000000-0000-4000-8000-0000000000a1', 'd7000000-0000-4000-8000-000000000001', 'VZ-TSTCHK-SAND-M', 'M', 'SAND', 'Sand', 'رملي', 10500, 'stock', null, true),
  ('d7000000-0000-4000-8000-0000000000a2', 'd7000000-0000-4000-8000-000000000001', 'VZ-TSTCHK-SAND-L', 'L', 'SAND', 'Sand', 'رملي', 20000, 'preorder', '2026-12-15', true);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
values ('d7000000-0000-4000-8000-0000000000a1', 'warehouse', 3, 'initial_count', 'manual');
insert into public.drops (id, number, slug, title_en, title_ar, opens_at, unit_cap, status)
values ('d8000000-0000-4000-8000-000000000001', 903, 'test-checkout-drop', 'Checkout drop', 'د', now() - interval '1 day', 10, 'open');
insert into public.drop_items (drop_id, variant_id)
values ('d8000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a2');

insert into public.carts (id, guest_token_hash) values
  ('d9000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('d9000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('d9000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('d9000000-0000-4000-8000-000000000004', repeat('4', 64)),
  ('d9000000-0000-4000-8000-000000000005', repeat('5', 64));

create temporary view stock as
  select reserved from public.inventory_levels
   where variant_id = 'd7000000-0000-4000-8000-0000000000a1' and location = 'warehouse';
create temporary table o (k text primary key, id uuid, number text, total bigint, reason text);
create temporary table addr as
  select '{"recipient_name":"Test","phone":"+971500000000","line1":"1 Test St","city":"Dubai","emirate":"dubai","country_code":"AE"}'::jsonb as v;

-- 1. Refusals ---------------------------------------------------------------------------------------
select results_eq(
  $$ select reason from public.create_order_from_cart('d9000000-0000-4000-8000-000000000001', 'a@valzaya.test', null, 'en',
       (select v from addr), 'standard', 'd5000000-0000-4000-8000-00000000000a') $$,
  $$ values ('empty_cart') $$, 'an empty bag cannot be ordered');
insert into public.cart_items (cart_id, variant_id, quantity) values
  ('d9000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a1', 2),
  ('d9000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-0000000000a2', 1);
select results_eq(
  $$ select reason from public.create_order_from_cart('d9000000-0000-4000-8000-000000000001', 'a@valzaya.test', null, 'en',
       (select v || '{"country_code":"GB","emirate":null}' from addr), 'standard', 'd5000000-0000-4000-8000-00000000000a') $$,
  $$ values ('shipping_unavailable') $$, 'no rate for the country: refused before anything is held');
select results_eq($$ select reserved from stock $$, $$ values (0) $$, 'nothing was held');
select throws_ok(
  $$ select * from public.create_order_from_cart('d9000000-0000-4000-8000-000000000001', 'a@valzaya.test', null, 'en',
       (select v from addr), 'drone', 'd5000000-0000-4000-8000-00000000000a') $$,
  '22023', null, 'an unknown delivery option is refused');

-- 2. A bag becomes an order ---------------------------------------------------------------------------
insert into o select 'a', r.* from public.create_order_from_cart('d9000000-0000-4000-8000-000000000001',
  'a@valzaya.test', '+971500000001', 'en', (select v from addr), 'express', 'd5000000-0000-4000-8000-00000000000a') r;
select is((select reason from o where k = 'a'), 'ok', 'order created');
select ok((select number ~ '^VZ-[0-9]{6,}$' from o where k = 'a'), 'it gets a VZ- order number');
-- 2 x 105.00 + 200.00 + express 35.00 = 445.00
select is((select total from o where k = 'a'), 44500::bigint, 'total = lines at database prices + shipping');
select results_eq(
  $$ select status::text, subtotal_net_fils, vat_fils, total_fils, shipping_fils from public.orders
      where id = (select id from o where k = 'a') $$,
  $$ values ('pending_payment', 42381::bigint, 2119::bigint, 44500::bigint, 3500::bigint) $$,
  'pending_payment; VAT split per line and on shipping (20000+19048+3333 net, 1000+952+167 VAT)');
select results_eq(
  $$ select has_made_to_order_lines, delivery_promise_date, drop_id, email::text, phone, cart_id
       from public.orders where id = (select id from o where k = 'a') $$,
  $$ values (true, '2026-12-15'::date, 'd8000000-0000-4000-8000-000000000001'::uuid, 'a@valzaya.test',
             '+971500000001', 'd9000000-0000-4000-8000-000000000001'::uuid) $$,
  'pre-order line: made-to-order flag, promise date and drop recorded');
select results_eq(
  $$ select sku, quantity, unit_price_fils, line_net_fils, line_vat_fils, line_total_fils, drop_id
       from public.order_items where order_id = (select id from o where k = 'a') order by sku $$,
  $$ values ('VZ-TSTCHK-SAND-L', 1, 20000::bigint, 19048::bigint, 952::bigint, 20000::bigint, 'd8000000-0000-4000-8000-000000000001'::uuid),
            ('VZ-TSTCHK-SAND-M', 2, 10500::bigint, 20000::bigint, 1000::bigint, 21000::bigint, null::uuid) $$,
  'lines are snapshotted with their own VAT split and drop');
select is((select count(*)::int from public.order_events where order_id = (select id from o where k = 'a')), 1,
  'creation is recorded in order_events');
select is((select status::text from public.carts where id = 'd9000000-0000-4000-8000-000000000001'), 'converted',
  'the bag is closed');
select is((select count(*)::int from public.inventory_reservations
            where order_id = (select id from o where k = 'a') and status = 'converted'), 2,
  'its holds now belong to the order');
select results_eq($$ select reserved from stock $$, $$ values (2) $$, 'stock stays reserved for the order');
select is(public.drop_units_left('d8000000-0000-4000-8000-000000000001'), 9, 'the order line counts against the drop');
select throws_ok(
  $$ select * from public.create_order_from_cart('d9000000-0000-4000-8000-000000000001', 'a@valzaya.test', null, 'en',
       (select v from addr), 'standard', 'd5000000-0000-4000-8000-00000000000a') $$,
  'P0002', null, 'a converted bag cannot be ordered twice');

insert into public.cart_items (cart_id, variant_id, quantity)
values ('d9000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-0000000000a1', 2);
select results_eq(
  $$ select order_id, reason from public.create_order_from_cart('d9000000-0000-4000-8000-000000000002', 'b@valzaya.test', null, 'en',
       (select v from addr), 'standard', 'd5000000-0000-4000-8000-00000000000b') $$,
  $$ values (null::uuid, 'out_of_stock') $$, 'only 1 left: the second buyer is refused and gets no order');

-- 3. Payment captured -----------------------------------------------------------------------------------
select isnt(public.record_payment_session((select id from o where k = 'a'), 'card', 'mock_sess_a'), null,
  'a payment session is recorded');
select is((select amount_fils from public.payments where provider_ref = 'mock_sess_a'), 44500::bigint,
  'its amount is the order total');
select is(public.apply_payment_event('card', 'evt_a1', 'payment.captured', '{"ref":"mock_sess_a"}', 'mock_sess_a', 'captured'),
  'processed', 'captured event processed');
select is((select status::text from public.orders where id = (select id from o where k = 'a')), 'paid', 'order is paid');
select results_eq(
  $$ select status::text, captured_at is not null, raw_ref from public.payments where provider_ref = 'mock_sess_a' $$,
  $$ values ('captured', true, 'card:evt_a1') $$, 'payment captured, pointing at its webhook event');
select is((select actor_type from public.order_events
            where order_id = (select id from o where k = 'a') and to_status = 'paid'), 'provider',
  'the transition is recorded as made by the provider');
select ok((select processed_at is not null and signature_ok from public.webhook_events where event_id = 'evt_a1'),
  'the raw event is stored and marked processed');
select is(public.apply_payment_event('card', 'evt_a1', 'payment.captured', '{}', 'mock_sess_a', 'captured'),
  'duplicate', 'the same event again is a no-op');
select is((select count(*)::int from public.webhook_events where event_id = 'evt_a1'), 1, 'stored once');
select is(public.apply_payment_event('card', 'evt_a2', 'payment.failed', '{}', 'mock_sess_a', 'failed'),
  'ignored', 'a late failure for a captured payment is ignored');
select is((select status::text from public.payments where provider_ref = 'mock_sess_a'), 'captured', 'still captured');
select is(public.apply_payment_event('card', 'evt_x', 'payment.captured', '{}', 'mock_nope', 'captured'),
  'unknown_payment', 'an event for an unknown session is stored and reported');
select throws_ok(
  $$ select public.record_payment_session((select id from o where k = 'a'), 'card', 'mock_sess_a2') $$,
  'P0002', null, 'a paid order takes no new payment session');

-- 4. Payment failed: the order is cancelled and its stock goes back ---------------------------------
insert into public.cart_items (cart_id, variant_id, quantity)
values ('d9000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-0000000000a1', 1);
insert into o select 'b', r.* from public.create_order_from_cart('d9000000-0000-4000-8000-000000000003',
  'b@valzaya.test', null, 'ar', (select v from addr), 'standard', 'd5000000-0000-4000-8000-00000000000b') r;
select is((select total from o where k = 'b'), 10500::bigint, 'standard delivery is free');
select results_eq($$ select reserved from stock $$, $$ values (3) $$, 'all 3 units are now reserved');
select isnt(public.record_payment_session((select id from o where k = 'b'), 'card', 'mock_sess_b'), null, 'session b');
select is(public.apply_payment_event('card', 'evt_b1', 'payment.failed', '{}', 'mock_sess_b', 'failed'),
  'processed', 'failed event processed');
select is((select status::text from public.orders where id = (select id from o where k = 'b')), 'cancelled',
  'the unpaid order is cancelled');
select results_eq($$ select reserved from stock $$, $$ values (2) $$, 'and its unit is back in stock');

-- 5. Expiry ------------------------------------------------------------------------------------------
insert into public.cart_items (cart_id, variant_id, quantity)
values ('d9000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-0000000000a2', 2);
insert into o select 'c', r.* from public.create_order_from_cart('d9000000-0000-4000-8000-000000000004',
  'c@valzaya.test', null, 'en', (select v from addr), 'standard', 'd5000000-0000-4000-8000-00000000000c') r;
select isnt(public.record_payment_session((select id from o where k = 'c'), 'card', 'mock_sess_c'), null, 'session c');
select is(public.drop_units_left('d8000000-0000-4000-8000-000000000001'), 7, 'drop: 10 - 1 paid - 2 pending');
update public.orders set placed_at = now() - interval '31 minutes' where id = (select id from o where k = 'c');
select is(public.expire_unpaid_orders(30), 1, 'one order past its payment window is expired');
select results_eq(
  $$ select o.status::text, p.status::text from public.orders o join public.payments p on p.order_id = o.id
      where o.id = (select id from o where k = 'c') $$,
  $$ values ('cancelled', 'expired') $$, 'order cancelled, payment expired');
select is(public.drop_units_left('d8000000-0000-4000-8000-000000000001'), 9, 'its drop units are back');
select is(public.apply_payment_event('card', 'evt_c1', 'payment.captured', '{}', 'mock_sess_c', 'captured'),
  'processed', 'a capture arriving after expiry is still recorded (money was taken)');
select results_eq(
  $$ select p.status::text, o.status::text, w.error from public.payments p
       join public.orders o on o.id = p.order_id
       join public.webhook_events w on w.event_id = 'evt_c1'
      where p.provider_ref = 'mock_sess_c' $$,
  $$ values ('captured', 'cancelled', 'captured while order is cancelled: refund needed') $$,
  'payment captured, order stays cancelled, flagged for a refund');
select throws_ok(
  $$ select public.apply_payment_event('card', 'evt_z', 'x', '{}', 'mock_sess_c', 'refunded') $$,
  '22023', null, 'an unknown outcome is refused');

select * from finish();
rollback;
