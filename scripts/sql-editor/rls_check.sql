-- RLS check for the Supabase Dashboard SQL Editor (no Docker / CLI needed).
-- Same assertions as supabase/tests/database/rls.test.sql, which stays the source of truth;
-- keep the two in sync when that file changes.
-- How to run: Dashboard -> SQL Editor -> paste this whole file -> Run.
-- It ALWAYS ends with an error named "RLS TEST RESULTS": that error carries the results and
-- aborts the transaction, so none of the test users/orders below are ever saved.
-- Pass = every line starts with "ok" and there is no "Looks like you failed" line.
begin;
select set_config('vz.tap', '', true);
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select set_config('vz.tap', current_setting('vz.tap') || E'\n' || plan(22), true);

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

-- Customer A (alice) --------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is((select count(*)::int from public.orders), 1,
  'customer sees exactly one order (their own)'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.orders where id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s order'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.order_items where order_id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s order items'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.payments where order_id = '0b000000-0000-4000-8000-0000000000b1' $$,
  'customer cannot read another customer''s payments'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.customers where id = 'b0000000-0000-4000-8000-00000000000b' $$,
  'customer cannot read another customer''s profile'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is((select count(*)::int from public.order_items), 1,
  'customer reads their own order items'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || throws_ok(
  $$ insert into public.orders (customer_id, email, subtotal_net_fils, vat_fils, total_fils, shipping_address)
     values ('a0000000-0000-4000-8000-00000000000a', 'alice@valzaya.test', 0, 0, 0, '{}') $$,
  '42501', null, 'customer cannot create orders directly'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || throws_ok(
  $$ select public.apply_order_transition('0a000000-0000-4000-8000-0000000000a1', 'paid') $$,
  '42501', null, 'customer cannot change order status'), true);
-- Attempted write to someone else's order: RLS filters it to 0 rows (checked below as owner).
update public.orders set phone = '+971500000001' where id = '0b000000-0000-4000-8000-0000000000b1';
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.settings where not is_public $$,
  'customer cannot read private settings'), true);

-- Anonymous ---------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.orders $$, 'anon cannot read orders'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.order_items $$, 'anon cannot read order items'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.customers $$, 'anon cannot read customers'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.payments $$, 'anon cannot read payments'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.products where slug = 'test-draft-product' $$,
  'anon cannot see draft products'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || isnt_empty($$ select 1 from public.settings where key = 'test.public' $$,
  'anon can read public settings'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.settings where key = 'test.private' $$,
  'anon cannot read private settings'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || throws_ok(
  $$ insert into public.webhook_events (provider, event_id, signature_ok, payload)
     values ('mock', 'evt_anon', true, '{}') $$,
  '42501', null, 'anon cannot write webhook_events'), true);

-- Ops staff -----------------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);

select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is((select count(*)::int from public.orders
           where id in ('0a000000-0000-4000-8000-0000000000a1', '0b000000-0000-4000-8000-0000000000b1')), 2,
  'ops can read all orders'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.settings where key = 'test.private' $$,
  'ops cannot read private settings'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is_empty($$ select 1 from public.audit_log $$, 'ops cannot read the audit log'), true);
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || throws_ok(
  $$ insert into public.webhook_events (provider, event_id, signature_ok, payload)
     values ('mock', 'evt_ops', true, '{}') $$,
  '42501', null, 'staff cannot write webhook_events (service role only)'), true);

-- Back to owner role to verify the blocked write -------------------------------------------
reset role;
select set_config('vz.tap', current_setting('vz.tap') || E'\n' || is((select phone from public.orders where id = '0b000000-0000-4000-8000-0000000000b1'), null,
  'customer update of another customer''s order changed nothing'), true);

reset role;
do $$
begin
  raise exception E'RLS TEST RESULTS (rolled back, nothing saved)\n%',
    current_setting('vz.tap')
    || coalesce(E'\n' || (select string_agg(f, E'\n') from finish() f), '');
end $$;
rollback;
