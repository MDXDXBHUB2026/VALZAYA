-- Reservation + capped-drop accounting tests (pgTAP). Runs as the migration owner, in one
-- transaction that is rolled back. Who may call the functions is covered in rls.test.sql;
-- real parallel buyers are covered by supabase/tests/concurrency/reserve_race.sh.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

-- Fixtures ---------------------------------------------------------------------------------
-- One product: STOCK (3 in the warehouse), PRE (preorder, capped at 2 in the drop), OFF (inactive).
-- One open drop capped at 4 units. Three guest carts.
insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ('e1000000-0000-4000-8000-000000000001', 'test-res-product', 'TSTRES', 'unisex', 'Res', 'ر',
        'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active) values
  ('e1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-000000000001', 'VZ-TSTRES-SAND-M', 'M', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ('e1000000-0000-4000-8000-0000000000a2', 'e1000000-0000-4000-8000-000000000001', 'VZ-TSTRES-SAND-L', 'L', 'SAND', 'Sand', 'رملي', 10000, 'preorder', '2026-12-15', true),
  ('e1000000-0000-4000-8000-0000000000a3', 'e1000000-0000-4000-8000-000000000001', 'VZ-TSTRES-SAND-S', 'S', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, false);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
values ('e1000000-0000-4000-8000-0000000000a1', 'warehouse', 3, 'initial_count', 'manual');

insert into public.drops (id, number, slug, title_en, title_ar, opens_at, unit_cap, status)
values ('e2000000-0000-4000-8000-000000000001', 901, 'test-res-drop', 'Res drop', 'إصدار', now() - interval '1 day', 4, 'open');
insert into public.drop_items (drop_id, variant_id, unit_cap) values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a1', null),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a2', 2),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a3', null);

insert into public.carts (id, guest_token_hash) values
  ('e3000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('e3000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('e3000000-0000-4000-8000-000000000003', repeat('3', 64));

create temporary view res_stock as
  select reserved, available from public.inventory_levels
   where variant_id = 'e1000000-0000-4000-8000-0000000000a1' and location = 'warehouse';
create temporary view res_active as
  select cart_id, variant_id, quantity, expires_at from public.inventory_reservations
   where status = 'active' and cart_id::text like 'e3000000-%';

-- 1. A cart holds stock and drop units --------------------------------------------------------
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a1', 2);

select results_eq(
  $$ select reserved, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000001') $$,
  $$ values (true, 'ok') $$,
  'cart 1 holds 2 units of a stock variant');
select results_eq($$ select reserved, available from res_stock $$, $$ values (2, 1) $$,
  'the hold reserves warehouse stock through the ledger');
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 2,
  'the hold counts against the drop cap (4 - 2)');
select ok((select expires_at between now() + interval '19 minutes' and now() + interval '21 minutes'
             from res_active where cart_id = 'e3000000-0000-4000-8000-000000000001'),
  'holds expire after 20 minutes by default');

-- 2. Another cart cannot take stock that is held -----------------------------------------------
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-0000000000a1', 2);

select results_eq(
  $$ select reserved, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000002') $$,
  $$ values (false, 'out_of_stock') $$,
  'cart 2 cannot hold 2 when only 1 is free');
select is((select count(*)::int from res_active where cart_id = 'e3000000-0000-4000-8000-000000000002'), 0,
  'a refused cart gets no holds');
select results_eq($$ select reserved from res_stock $$, $$ values (2) $$, 'stock untouched by the refusal');

-- 3. Re-reserving replaces, never double counts ------------------------------------------------
select results_eq(
  $$ select reserved, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000001') $$,
  $$ values (true, 'ok') $$,
  'cart 1 can refresh its holds');
select results_eq($$ select reserved from res_stock $$, $$ values (2) $$, 'refreshing does not double reserve');
select is((select count(*)::int from res_active where cart_id = 'e3000000-0000-4000-8000-000000000001'), 1,
  'one active hold per cart line');

update public.cart_items set quantity = 1
 where cart_id = 'e3000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select quantity, reserved from public.reserve_cart('e3000000-0000-4000-8000-000000000001') $$,
  $$ values (1, true) $$,
  'a smaller quantity is re-held');
select results_eq($$ select reserved, available from res_stock $$, $$ values (1, 2) $$,
  'the freed unit goes back to stock');

-- 4. Per-variant and per-drop caps -------------------------------------------------------------
delete from public.cart_items where cart_id = 'e3000000-0000-4000-8000-000000000002';
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-0000000000a2', 3);
select results_eq(
  $$ select reason from public.reserve_cart('e3000000-0000-4000-8000-000000000002') $$,
  $$ values ('variant_cap') $$,
  'a preorder variant capped at 2 in the drop refuses 3');

update public.cart_items set quantity = 2 where cart_id = 'e3000000-0000-4000-8000-000000000002';
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-0000000000a1', 2);
select results_eq(
  $$ select variant_id, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000002') order by variant_id $$,
  $$ values ('e1000000-0000-4000-8000-0000000000a1'::uuid, 'drop_cap'),
            ('e1000000-0000-4000-8000-0000000000a2'::uuid, 'drop_cap') $$,
  '1 held + 4 in this cart exceeds a drop cap of 4: every line in the drop is refused');
select is((select count(*)::int from res_active where cart_id = 'e3000000-0000-4000-8000-000000000002'), 0,
  'all or nothing: no partial holds');

delete from public.cart_items
 where cart_id = 'e3000000-0000-4000-8000-000000000002' and variant_id = 'e1000000-0000-4000-8000-0000000000a1';
select results_eq(
  $$ select reserved, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000002') $$,
  $$ values (true, 'ok') $$,
  'preorder lines hold drop units without touching stock');
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 1, '4 - 1 - 2 = 1 unit left');
select results_eq(
  $$ select available from public.variant_availability('e1000000-0000-4000-8000-000000000001')
      where variant_id = 'e1000000-0000-4000-8000-0000000000a2' $$,
  $$ values (false) $$,
  'variant_availability: a variant at its cap shows unavailable');

-- 5. A failing line leaves earlier holds in place ----------------------------------------------
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a3', 1);
select results_eq(
  $$ select variant_id, reason from public.reserve_cart('e3000000-0000-4000-8000-000000000001') order by variant_id $$,
  $$ values ('e1000000-0000-4000-8000-0000000000a1'::uuid, 'ok'),
            ('e1000000-0000-4000-8000-0000000000a3'::uuid, 'not_on_sale') $$,
  'an inactive variant is not on sale');
select is((select sum(quantity)::int from res_active where cart_id = 'e3000000-0000-4000-8000-000000000001'), 1,
  'the cart keeps its existing hold when a refresh is refused');
delete from public.cart_items
 where cart_id = 'e3000000-0000-4000-8000-000000000001' and variant_id = 'e1000000-0000-4000-8000-0000000000a3';

-- 6. The drop must be selling -----------------------------------------------------------------
update public.drops set status = 'scheduled' where id = 'e2000000-0000-4000-8000-000000000001';
insert into public.cart_items (cart_id, variant_id, quantity)
values ('e3000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-0000000000a1', 1);
select results_eq(
  $$ select reason from public.reserve_cart('e3000000-0000-4000-8000-000000000003') $$,
  $$ values ('not_on_sale') $$,
  'nothing can be held from a drop that has not opened');
update public.drops set status = 'open' where id = 'e2000000-0000-4000-8000-000000000001';

-- 7. Expiry ------------------------------------------------------------------------------------
update public.inventory_reservations set expires_at = now() - interval '1 minute'
 where cart_id = 'e3000000-0000-4000-8000-000000000001' and status = 'active';
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 2,
  'an expired hold stops counting against the drop at once (only cart 2''s 2 remain)');
select results_eq(
  $$ select available from public.variant_availability('e1000000-0000-4000-8000-000000000001')
      where variant_id = 'e1000000-0000-4000-8000-0000000000a1' $$,
  $$ values (true) $$,
  'variant_availability counts expired holds as free stock before they are released');

select is(public.release_cart_reservations('e3000000-0000-4000-8000-000000000002'), 1,
  'release_cart_reservations releases a cart''s holds');
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 4, 'the drop is back to 4');

update public.cart_items set quantity = 3 where cart_id = 'e3000000-0000-4000-8000-000000000003';
select is((select bool_and(reserved) from public.reserve_cart('e3000000-0000-4000-8000-000000000003')), true,
  'another cart can take the stock behind an expired hold');
select results_eq($$ select reserved, available from res_stock $$, $$ values (3, 0) $$,
  'the expired hold was released on the way (1 + 3 would not fit in 3)');
select is((select status::text from public.inventory_reservations
            where cart_id = 'e3000000-0000-4000-8000-000000000001' order by created_at desc limit 1),
  'released', 'the expired hold is marked released');

update public.inventory_reservations set expires_at = now() - interval '1 minute'
 where cart_id = 'e3000000-0000-4000-8000-000000000003' and status = 'active';
select is(public.release_expired_reservations(), 1, 'release_expired_reservations releases the expired hold');
select results_eq($$ select reserved from res_stock $$, $$ values (0) $$, 'and gives its stock back');
select is(public.release_expired_reservations(), 0, 'running it again is a no-op');

-- 8. Deleting a cart --------------------------------------------------------------------------
select is((select bool_and(reserved) from public.reserve_cart('e3000000-0000-4000-8000-000000000003')), true,
  'cart 3 holds 3 again');
delete from public.carts where id = 'e3000000-0000-4000-8000-000000000003';
select results_eq($$ select reserved, available from res_stock $$, $$ values (0, 3) $$,
  'deleting a cart gives its held stock back');
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 4, 'and its drop units');

-- 9. Sold lines count; guard rails --------------------------------------------------------------
insert into public.orders (id, email, subtotal_net_fils, vat_fils, total_fils, shipping_address)
values ('e4000000-0000-4000-8000-000000000001', 'res@valzaya.test', 28572, 1428, 30000, '{"city":"Dubai"}');
insert into public.order_items (order_id, variant_id, drop_id, sku, product_name_en, colour_en, size, stock_mode,
                                quantity, unit_price_fils, line_net_fils, line_vat_fils, line_total_fils)
values ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000a2',
        'e2000000-0000-4000-8000-000000000001', 'VZ-TSTRES-SAND-L', 'Res', 'Sand', 'L', 'preorder',
        3, 10000, 28572, 1428, 30000);
select is(public.drop_units_left('e2000000-0000-4000-8000-000000000001'), 1,
  'units on an open order count against the drop');

select throws_ok(
  $$ select * from public.reserve_cart('e3000000-0000-4000-8000-000000000003') $$,
  'P0002', null, 'an unknown or deleted cart cannot be reserved');
select throws_ok(
  $$ select * from public.reserve_cart('e3000000-0000-4000-8000-000000000001', 90) $$,
  '22023', null, 'holds longer than 60 minutes are refused');

-- 10. The stock ledger applies decreases (fix_apply_inventory_movement) ------------------------
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
values ('e1000000-0000-4000-8000-0000000000a1', 'warehouse', -1, 'damaged', 'manual');
select results_eq($$ select reserved, available from res_stock $$, $$ values (0, 2) $$,
  'a negative on_hand movement is applied to the existing row');
select throws_ok(
  $$ insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
     values ('e1000000-0000-4000-8000-0000000000a1', 'warehouse', -5, 'damaged', 'manual') $$,
  '23514', null, 'stock can still never go below zero');
select throws_ok(
  $$ insert into public.inventory_movements (variant_id, location, delta_reserved, reason, source)
     values ('e1000000-0000-4000-8000-0000000000a1', 'warehouse', 3, 'order_reserved', 'manual') $$,
  '23514', null, 'and never more can be reserved than is on hand');

select * from finish();
rollback;
