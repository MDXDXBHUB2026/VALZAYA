-- Cart function tests (pgTAP). Runs as the migration owner, rolled back. Who may call the
-- functions is covered in rls.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

-- Fixtures: an active product with a stocked variant (S1) and a second variant (S2), one
-- inactive variant (OFF), an open drop listing S1, and a signed-in customer.
insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ('f1000000-0000-4000-8000-000000000001', 'test-cart-product', 'TSTCART', 'unisex', 'Cart', 'س',
        'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active) values
  ('f1000000-0000-4000-8000-0000000000a1', 'f1000000-0000-4000-8000-000000000001', 'VZ-TSTCART-SAND-M', 'M', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ('f1000000-0000-4000-8000-0000000000a2', 'f1000000-0000-4000-8000-000000000001', 'VZ-TSTCART-SAND-L', 'L', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ('f1000000-0000-4000-8000-0000000000a3', 'f1000000-0000-4000-8000-000000000001', 'VZ-TSTCART-SAND-S', 'S', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, false);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source) values
  ('f1000000-0000-4000-8000-0000000000a1', 'warehouse', 5, 'initial_count', 'manual');
insert into public.drops (id, number, slug, title_en, title_ar, opens_at, unit_cap, status)
values ('f2000000-0000-4000-8000-000000000001', 902, 'test-cart-drop', 'Cart drop', 'س', now() - interval '1 day', 50, 'open');
insert into public.drop_items (drop_id, variant_id)
values ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1');
insert into auth.users (id, instance_id, aud, role, email) values
  ('f3000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cart@valzaya.test');

create temporary table t (k text primary key, v uuid);

-- 1. Guest carts --------------------------------------------------------------------------------
select is(public.cart_for_guest(repeat('a', 64)), null, 'no cart behind an unknown token');
insert into t values ('guest', public.cart_for_guest(repeat('a', 64), true));
select isnt((select v from t where k = 'guest'), null, 'cart_for_guest creates a cart when asked');
select is(public.cart_for_guest(repeat('a', 64), true), (select v from t where k = 'guest'),
  'the same token always finds the same cart');
select ok((select expires_at between now() + interval '29 days' and now() + interval '31 days'
             from public.carts where id = (select v from t where k = 'guest')),
  'a guest cart lives 30 days');
select throws_ok($$ select public.cart_for_guest('not-a-hash', true) $$, '22023', null,
  'a malformed token hash is refused');

-- 2. Adding and changing lines -------------------------------------------------------------------
select is(public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1'), 1,
  'add one unit');
select is(public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1', 2), 3,
  'adding again adds to the same line');
select is(public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1', 10), 10,
  'a line is capped at 10');
select is((select count(*)::int from public.cart_items where cart_id = (select v from t where k = 'guest')), 1,
  'still one line');
select throws_ok(
  $$ select public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a3') $$,
  'P0002', null, 'an inactive variant cannot be added');
select throws_ok(
  $$ select public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1', 11) $$,
  '22023', null, 'more than 10 at once is refused');

select is(public.cart_set_quantity((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1', 2), 2,
  'set a line to 2');
select is(public.cart_set_quantity((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a2', 4), 0,
  'setting a line that is not in the cart creates nothing');
select is((select count(*)::int from public.cart_items where cart_id = (select v from t where k = 'guest')), 1,
  'no line was created');

-- 3. Edits release checkout holds ---------------------------------------------------------------
select is((select bool_and(reserved) from public.reserve_cart((select v from t where k = 'guest'))), true,
  'the cart holds its 2 units');
select is(public.drop_units_left('f2000000-0000-4000-8000-000000000001'), 48, 'drop: 50 - 2 held');
select is(public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a2'), 1,
  'editing the cart');
select is(public.drop_units_left('f2000000-0000-4000-8000-000000000001'), 50,
  'releases its holds (checkout re-reserves)');
select is((select reserved from public.inventory_levels
            where variant_id = 'f1000000-0000-4000-8000-0000000000a1' and location = 'warehouse'), 0,
  'and the stock it held');

select is(public.cart_set_quantity((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a2', 0), 0,
  'quantity 0 removes the line');
select is((select count(*)::int from public.cart_items where cart_id = (select v from t where k = 'guest')), 1,
  'one line left');

-- 4. Merging a guest cart into a signed-in cart (B5) ---------------------------------------------
insert into public.carts (id, customer_id) values ('f4000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-00000000000a');
insert into public.cart_items (cart_id, variant_id, quantity) values
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a1', 9),
  ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-0000000000a2', 1);
select is(public.merge_carts((select v from t where k = 'guest'), 'f4000000-0000-4000-8000-000000000001'), 1,
  'merge folds the guest line in');
select is((select quantity from public.cart_items
            where cart_id = 'f4000000-0000-4000-8000-000000000001' and variant_id = 'f1000000-0000-4000-8000-0000000000a1'),
  10, 'quantities add up, capped at 10 (9 + 2)');
select is((select status::text from public.carts where id = (select v from t where k = 'guest')), 'abandoned',
  'the guest cart is closed');
select is(public.cart_for_guest(repeat('a', 64), true), null,
  'its token no longer finds or creates a cart (the app issues a new token)');
select throws_ok(
  $$ select public.cart_add_item((select v from t where k = 'guest'), 'f1000000-0000-4000-8000-0000000000a1') $$,
  'P0002', null, 'a closed cart cannot be edited');

select * from finish();
rollback;
