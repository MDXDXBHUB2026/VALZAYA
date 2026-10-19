-- RLS tests (pgTAP). Run: pnpm db:test   (supabase test db --linked)
-- Everything runs in one transaction and is rolled back — no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

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

select * from finish();
rollback;
