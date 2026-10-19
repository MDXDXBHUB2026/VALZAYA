-- RLS tests (pgTAP). Run: pnpm db:test   (supabase test db --linked)
-- Everything runs in one transaction and is rolled back — no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(85);

-- Fixtures (as the migration owner; RLS bypassed) -----------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@valzaya.test'),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@valzaya.test'),
  ('c0000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops@valzaya.test');

insert into public.staff_members (user_id, role, display_name)
values ('c0000000-0000-4000-8000-00000000000c', 'ops', 'Test Ops');

insert into public.orders (id, customer_id, email, subtotal_net_fils, vat_fils, total_fils, shipping_address) values
  ('0a000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 'alice@valzaya.test', 100000, 5000, 105000, '{"city":"Dubai"}'),
  ('0b000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'bob@valzaya.test',   100000, 5000, 105000, '{"city":"Abu Dhabi"}');

insert into public.order_items (order_id, sku, product_name_en, colour_en, size, stock_mode, quantity,
                                unit_price_fils, line_net_fils, line_vat_fils, line_total_fils) values
  ('0a000000-0000-4000-8000-0000000000a1', 'VZ-TEST01-SAND-M', 'Test', 'Sand', 'M', 'stock', 1, 105000, 100000, 5000, 105000),
  ('0b000000-0000-4000-8000-0000000000b1', 'VZ-TEST01-SAND-L', 'Test', 'Sand', 'L', 'stock', 1, 105000, 100000, 5000, 105000);

insert into public.payments (order_id, provider, provider_ref, status, amount_fils)
values ('0b000000-0000-4000-8000-0000000000b1', 'card', 'test_ref_b', 'captured', 105000);

insert into public.products (slug, style_code, gender, name_en, fabric, status)
values ('test-draft-product', 'TSTDRAFT', 'unisex', 'Draft product', '100% linen', 'draft');

insert into public.settings (key, value, is_public) values
  ('test.private', '"secret"', false),
  ('test.public', '"hello"', true);

-- Consents: alice, bob, and an anonymous waitlist subject (written server-side).
insert into public.consents (id, customer_id, email, channel, granted, source, policy_version) values
  ('c0a00000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', null, 'marketing_email', true, 'account', 'v1'),
  ('c0b00000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', null, 'marketing_email', true, 'account', 'v1'),
  ('c0d00000-0000-4000-8000-0000000000d1', null, 'guest@valzaya.test', 'marketing_email', true, 'waitlist', 'v1');

insert into public.waitlist_signups (id, customer_id, email, source, consent_id) values
  ('5a000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 'alice@valzaya.test', 'landing', 'c0a00000-0000-4000-8000-0000000000a1'),
  ('5b000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'bob@valzaya.test',   'landing', 'c0b00000-0000-4000-8000-0000000000b1'),
  ('5d000000-0000-4000-8000-0000000000d1', null,                                   'guest@valzaya.test', 'landing', 'c0d00000-0000-4000-8000-0000000000d1');

-- Catalogue: one active product with an in-stock, a sold-out and a pre-order variant.
insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ('a1000000-0000-4000-8000-000000000001', 'test-active-product', 'TSTACT', 'unisex', 'Active', 'نشط',
        'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active) values
  ('a1000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-000000000001', 'VZ-TSTACT-SAND-M', 'M', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ('a1000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-000000000001', 'VZ-TSTACT-SAND-L', 'L', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ('a1000000-0000-4000-8000-0000000000a3', 'a1000000-0000-4000-8000-000000000001', 'VZ-TSTACT-SAND-S', 'S', 'SAND', 'Sand', 'رملي', 10000, 'preorder', '2026-12-15', true),
  ('a1000000-0000-4000-8000-0000000000a4', 'a1000000-0000-4000-8000-000000000001', 'VZ-TSTACT-SAND-XS', 'XS', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, false);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
values ('a1000000-0000-4000-8000-0000000000a1', 'warehouse', 3, 'initial_count', 'manual');

-- Checkout holds: an open drop (cap 10) and a draft drop; alice's cart holds 2 units in the open one.
insert into public.drops (id, number, slug, title_en, title_ar, opens_at, unit_cap, status) values
  ('d1000000-0000-4000-8000-000000000001', 801, 'test-open-drop', 'Open', 'مفتوح', now() - interval '1 day', 10, 'open'),
  ('d1000000-0000-4000-8000-000000000002', 802, 'test-draft-drop', 'Draft', null, now() + interval '9 days', 10, 'draft');
insert into public.drop_items (drop_id, variant_id) values
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-0000000000a3');
insert into public.carts (id, customer_id) values
  ('ca000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a');
insert into public.inventory_reservations (cart_id, variant_id, drop_id, quantity, expires_at) values
  ('ca000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a3',
   'd1000000-0000-4000-8000-000000000001', 2, now() + interval '20 minutes');

-- Customer A (alice) --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.orders), 1,
  'customer sees exactly one order (their own)');
select is_empty($$ select 1 from public.orders where id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s order');
select is_empty($$ select 1 from public.order_items where order_id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s order items');
select is_empty($$ select 1 from public.payments where order_id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s payments');
select is_empty($$ select 1 from public.customers where id = 'b0000000-0000-4000-8000-00000000000b' $$,
  'customer cannot read another customer''s profile');
select is((select count(*)::int from public.order_items), 1,
  'customer reads their own order items');
select throws_ok(
  $$ insert into public.orders (customer_id, email, subtotal_net_fils, vat_fils, total_fils, shipping_address)
     values ('a0000000-0000-4000-8000-00000000000a', 'alice@valzaya.test', 0, 0, 0, '{}') $$,
  '42501', null, 'customer cannot create orders directly');
select throws_ok(
  $$ select public.apply_order_transition('0a000000-0000-4000-8000-0000000000a1', 'paid') $$,
  '42501', null, 'customer cannot change order status');
-- Attempted write to someone else's order: RLS filters it to 0 rows (checked below as owner).
update public.orders set phone = '+971500000001' where id = '0b000000-0000-4000-8000-0000000000b1';
select is_empty($$ select 1 from public.settings where not is_public $$,
  'customer cannot read private settings');

-- Waitlist + consents as alice: own rows only; anonymous sign-ups are service-role only.
select is((select count(*)::int from public.waitlist_signups), 1,
  'customer sees only their own waitlist sign-up');
select is_empty($$ select 1 from public.waitlist_signups where customer_id is null $$,
  'customer cannot read anonymous waitlist sign-ups');
select throws_ok(
  $$ insert into public.waitlist_signups (customer_id, email, source)
     values ('b0000000-0000-4000-8000-00000000000b', 'bob2@valzaya.test', 'landing') $$,
  '42501', null, 'customer cannot add a waitlist sign-up for another customer');
select throws_ok(
  $$ insert into public.waitlist_signups (customer_id, email, source)
     values (null, 'spoof@valzaya.test', 'landing') $$,
  '42501', null, 'customer cannot add an anonymous waitlist sign-up');
select lives_ok(
  $$ insert into public.waitlist_signups (customer_id, phone, source)
     values ('a0000000-0000-4000-8000-00000000000a', '+971500000002', 'account') $$,
  'customer can join the waitlist for themselves');
-- Attempted delete of bob's sign-up: RLS filters it to 0 rows (checked below as owner).
delete from public.waitlist_signups where id = '5b000000-0000-4000-8000-0000000000b1';

select is((select count(*)::int from public.consents), 1,
  'customer sees only their own consents');
select is_empty($$ select 1 from public.consents where customer_id is null $$,
  'customer cannot read anonymous waitlist consents');
select throws_ok(
  $$ insert into public.consents (customer_id, channel, granted, source, policy_version)
     values ('b0000000-0000-4000-8000-00000000000b', 'marketing_email', false, 'account', 'v1') $$,
  '42501', null, 'customer cannot record consent for another customer');
select throws_ok(
  $$ insert into public.consents (customer_id, channel, granted, source, policy_version)
     values ('a0000000-0000-4000-8000-00000000000a', 'marketing_email', true, 'waitlist', 'v1') $$,
  '42501', null, 'customer cannot record a waitlist-source consent (server-side only)');
select lives_ok(
  $$ insert into public.consents (customer_id, channel, granted, source, policy_version)
     values ('a0000000-0000-4000-8000-00000000000a', 'marketing_email', false, 'account', 'v1') $$,
  'customer can withdraw their own consent by appending a row');

-- Returns: customer opens one on their own order; rma_no comes from private.next_rma_number().
select lives_ok(
  $$ insert into public.returns (order_id, customer_id, type, reason)
     values ('0a000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 'refund', 'test') $$,
  'customer can open a return on their own order');
select ok((select bool_and(rma_no ~ '^RMA-[0-9]{6,}$') from public.returns
           where order_id = '0a000000-0000-4000-8000-0000000000a1'),
  'customer return gets an RMA number from the private generator');
select throws_ok(
  $$ select * from public.join_waitlist('alice@valzaya.test', null, true, false, 'en', 'landing', null, null) $$,
  '42501', null, 'customer cannot call join_waitlist (service role only)');
select is_empty($$ select 1 from public.inventory_reservations $$,
  'customer cannot read checkout holds, not even their own cart''s');
select throws_ok(
  $$ select * from public.reserve_cart('ca000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'customer cannot call reserve_cart (service role only)');
select throws_ok(
  $$ select public.cart_add_item('ca000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'customer cannot call cart_add_item (server only)');

-- Anonymous ---------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is_empty($$ select 1 from public.orders $$, 'anon cannot read orders');
select is_empty($$ select 1 from public.order_items $$, 'anon cannot read order items');
select is_empty($$ select 1 from public.customers $$, 'anon cannot read customers');
select is_empty($$ select 1 from public.payments $$, 'anon cannot read payments');
select is_empty($$ select 1 from public.products where slug = 'test-draft-product' $$,
  'anon cannot see draft products');
select isnt_empty($$ select 1 from public.settings where key = 'test.public' $$,
  'anon can read public settings');
select is_empty($$ select 1 from public.settings where key = 'test.private' $$,
  'anon cannot read private settings');
select throws_ok(
  $$ insert into public.webhook_events (provider, event_id, signature_ok, payload)
     values ('mock', 'evt_anon', true, '{}') $$,
  '42501', null, 'anon cannot write webhook_events');
select is_empty($$ select 1 from public.waitlist_signups $$, 'anon cannot read waitlist sign-ups');
select is_empty($$ select 1 from public.consents $$, 'anon cannot read consents');
select throws_ok(
  $$ insert into public.waitlist_signups (email, source) values ('anon@valzaya.test', 'landing') $$,
  '42501', null, 'anon cannot insert waitlist sign-ups directly (server-side only)');
select throws_ok(
  $$ insert into public.consents (email, channel, granted, source, policy_version)
     values ('anon@valzaya.test', 'marketing_email', true, 'waitlist', 'v1') $$,
  '42501', null, 'anon cannot insert consents directly (server-side only)');
select throws_ok($$ select private.next_rma_number() $$,
  '42501', null, 'anon cannot call the RMA number generator');
select is(
  (select array_agg(variant_id::text || '=' || available::text order by variant_id)
     from public.variant_availability('a1000000-0000-4000-8000-000000000001')),
  array['a1000000-0000-4000-8000-0000000000a1=true', 'a1000000-0000-4000-8000-0000000000a2=false',
        'a1000000-0000-4000-8000-0000000000a3=true'],
  'anon: availability is a boolean per active variant (stocked, sold out, pre-order; inactive hidden)');
select is_empty($$ select * from public.variant_availability(
    (select id from public.products where slug = 'test-draft-product')) $$,
  'anon: availability of a draft product is empty');
select is_empty($$ select 1 from public.inventory_levels $$, 'anon cannot read raw stock levels');
select throws_ok(
  $$ select * from public.join_waitlist('anon@valzaya.test', null, true, false, 'en', 'landing', null, null) $$,
  '42501', null, 'anon cannot call join_waitlist directly (server action only)');
select throws_ok(
  $$ select public.hit_rate_limit('waitlist:ip', repeat('a', 64), 5, 600) $$,
  '42501', null, 'anon cannot call hit_rate_limit');
select throws_ok($$ select 1 from private.rate_limits $$,
  '42501', null, 'anon cannot read rate limit counters');
select is_empty($$ select 1 from public.inventory_reservations $$, 'anon cannot read checkout holds');
select throws_ok(
  $$ select * from public.reserve_cart('ca000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'anon cannot call reserve_cart');
select throws_ok(
  $$ select public.release_cart_reservations('ca000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'anon cannot call release_cart_reservations');
select throws_ok(
  $$ select public.release_expired_reservations() $$,
  '42501', null, 'anon cannot call release_expired_reservations');
select throws_ok($$ select public.cart_for_guest(repeat('a', 64), true) $$,
  '42501', null, 'anon cannot call cart_for_guest (guest carts are server-side only)');
select throws_ok(
  $$ select public.cart_add_item('ca000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'anon cannot call cart_add_item');
select throws_ok(
  $$ select public.cart_set_quantity('ca000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1', 0) $$,
  '42501', null, 'anon cannot call cart_set_quantity');
select throws_ok(
  $$ select public.merge_carts('ca000000-0000-4000-8000-0000000000a1', 'ca000000-0000-4000-8000-0000000000a2') $$,
  '42501', null, 'anon cannot call merge_carts');
select throws_ok(
  $$ select private.drop_units_used('d1000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call the private drop accounting helpers');
select is(public.drop_units_left('d1000000-0000-4000-8000-000000000001'), 8,
  'anon: drop_units_left is the public counter (cap 10 - 2 held)');
select is(public.drop_units_left('d1000000-0000-4000-8000-000000000002'), null,
  'anon: drop_units_left reveals nothing about a draft drop');

-- Ops staff -----------------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

select is((select count(*)::int from public.orders
           where id in ('0a000000-0000-4000-8000-0000000000a1', '0b000000-0000-4000-8000-0000000000b1')), 2,
  'ops can read all orders');
select is_empty($$ select 1 from public.settings where key = 'test.private' $$,
  'ops cannot read private settings');
select is_empty($$ select 1 from public.audit_log $$, 'ops cannot read the audit log');
select throws_ok(
  $$ insert into public.webhook_events (provider, event_id, signature_ok, payload)
     values ('mock', 'evt_ops', true, '{}') $$,
  '42501', null, 'staff cannot write webhook_events (service role only)');
select is((select count(*)::int from public.waitlist_signups
           where id in ('5a000000-0000-4000-8000-0000000000a1', '5b000000-0000-4000-8000-0000000000b1',
                        '5d000000-0000-4000-8000-0000000000d1')), 3,
  'ops can read all waitlist sign-ups');
select is((select count(*)::int from public.consents
           where id in ('c0a00000-0000-4000-8000-0000000000a1', 'c0b00000-0000-4000-8000-0000000000b1',
                        'c0d00000-0000-4000-8000-0000000000d1')), 3,
  'ops can read all consents');
select isnt_empty($$ select 1 from public.inventory_reservations
                     where cart_id = 'ca000000-0000-4000-8000-0000000000a1' $$,
  'ops can read checkout holds');
select throws_ok(
  $$ insert into public.inventory_reservations (cart_id, variant_id, quantity, expires_at)
     values ('ca000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1', 1, now()) $$,
  '42501', null, 'staff cannot write checkout holds directly (functions only)');
select throws_ok(
  $$ select * from public.reserve_cart('ca000000-0000-4000-8000-0000000000a1') $$,
  '42501', null, 'staff cannot call reserve_cart (service role only)');

-- Service role: the waitlist write path used by the storefront server action -----------------
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select already_joined from public.join_waitlist('new@valzaya.test', null, true, false, 'en', 'landing', null, null)),
  false, 'join_waitlist: new email joins');
select ok(
  (select referral_code ~ '^[0-9A-F]{10}$' and queue_position >= 1
     from public.join_waitlist('wa@valzaya.test', '+971500000009', true, true, 'ar', 'landing', null, null)),
  'join_waitlist: returns a referral code and a queue position');
select is(
  (select already_joined from public.join_waitlist('NEW@valzaya.test', null, true, false, 'en', 'landing', null, null)),
  true, 'join_waitlist: repeat sign-up (any case) is detected');
select is(
  (select referral_code from public.join_waitlist('new@valzaya.test', '+971500000099', true, true, 'en', 'landing', null, null)),
  (select referral_code from public.waitlist_signups where email = 'new@valzaya.test'),
  'join_waitlist: repeat sign-up returns the original row');
select is((select phone from public.waitlist_signups where email = 'new@valzaya.test'), null,
  'join_waitlist: repeat sign-up does not change the stored contact details');
select is((select count(*)::int from public.consents where email = 'new@valzaya.test' and not granted), 0,
  'join_waitlist: public form never records a consent withdrawal');
select lives_ok(
  $$ select * from public.join_waitlist('friend@valzaya.test', null, true, false, 'en', 'landing',
       (select lower(referral_code) from public.waitlist_signups where email = 'new@valzaya.test'), null) $$,
  'join_waitlist: accepts a referral code');
select is(
  (select referred_by from public.waitlist_signups where email = 'friend@valzaya.test'),
  (select id from public.waitlist_signups where email = 'new@valzaya.test'),
  'join_waitlist: referral is attributed to the referrer');
select throws_ok(
  $$ select * from public.join_waitlist('noconsent@valzaya.test', null, false, false, 'en', 'landing', null, null) $$,
  '22023', null, 'join_waitlist: email without consent is rejected');
select throws_ok(
  $$ select * from public.join_waitlist(null, '+971500000077', false, false, 'en', 'landing', null, null) $$,
  '22023', null, 'join_waitlist: WhatsApp number without consent is rejected');
select throws_ok(
  $$ select * from public.join_waitlist(null, null, true, true, 'en', 'landing', null, null) $$,
  '22023', null, 'join_waitlist: a contact is required');
select is(public.hit_rate_limit('test:bucket', repeat('b', 64), 2, 600), true, 'rate limit: 1st hit allowed');
select is(public.hit_rate_limit('test:bucket', repeat('b', 64), 2, 600), true, 'rate limit: 2nd hit allowed');
select is(public.hit_rate_limit('test:bucket', repeat('b', 64), 2, 600), false, 'rate limit: 3rd hit blocked');
select is_empty($$ select * from public.reserve_cart('ca000000-0000-4000-8000-0000000000a1') $$,
  'reserve_cart: service role can call it (an empty cart holds nothing)');
select is(public.cart_for_guest(repeat('f', 64)), null,
  'cart_for_guest: service role can call it (unknown token, no cart created)');

-- Back to owner role to verify the blocked write -------------------------------------------
reset role;
select is((select phone from public.orders where id = '0b000000-0000-4000-8000-0000000000b1'), null,
  'customer update of another customer''s order changed nothing');
select isnt_empty($$ select 1 from public.waitlist_signups where id = '5b000000-0000-4000-8000-0000000000b1' $$,
  'customer delete of another customer''s waitlist sign-up removed nothing');
select throws_ok(
  $$ update public.consents set granted = false where id = 'c0d00000-0000-4000-8000-0000000000d1' $$,
  null, null, 'consents are append-only, even for the table owner');
select hasnt_function('public', 'next_rma_number',
  'RMA number generator is not in the API-exposed public schema');
select ok((select relrowsecurity from pg_class where oid = 'public.inventory_reservations'::regclass),
  'inventory_reservations has RLS enabled');

select * from finish();
rollback;
