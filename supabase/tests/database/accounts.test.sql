-- Accounts + early access tests (pgTAP): login-required orders, the early-access gate, personal
-- access codes, customer bags and claiming the guest bag at sign-in. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select plan(32);

-- Fixtures -------------------------------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  ('shipping.rates', '{"AE": {"standard_fils": 0, "express_fils": 3500}}', true)
on conflict (key) do update set value = excluded.value;

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waitlisted@valzaya.test'),
  ('c1000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'general@valzaya.test'),
  ('c1000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nobody@valzaya.test'),
  ('c1000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codeholder@valzaya.test'),
  ('c1000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@valzaya.test');

insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ('c2000000-0000-4000-8000-000000000001', 'test-early-product', 'TSTEAR', 'unisex', 'Early', 'مبكر',
        'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active)
values ('c2000000-0000-4000-8000-0000000000a1', 'c2000000-0000-4000-8000-000000000001', 'VZ-TSTEAR-SAND-M', 'M',
        'SAND', 'Sand', 'رملي', 10000, 'stock', null, true);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source)
values ('c2000000-0000-4000-8000-0000000000a1', 'warehouse', 10, 'initial_count', 'manual');
insert into public.drops (id, number, slug, title_en, title_ar, early_access_at, opens_at, unit_cap, status) values
  ('c3000000-0000-4000-8000-000000000001', 904, 'test-early-drop', 'Early drop', 'م', now() - interval '1 day', now() + interval '1 day', 50, 'early_access'),
  ('c3000000-0000-4000-8000-000000000002', 905, 'test-closed-drop', 'Closed drop', 'م', null, now() - interval '9 days', 50, 'closed');
insert into public.drop_items (drop_id, variant_id)
values ('c3000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000a1');

-- waitlisted@ joined this drop's waitlist before having an account; general@ joined with no drop.
insert into public.consents (id, email, channel, granted, source, policy_version) values
  ('c4000000-0000-4000-8000-0000000000a1', 'waitlisted@valzaya.test', 'marketing_email', true, 'waitlist', 'v1'),
  ('c4000000-0000-4000-8000-0000000000a2', 'general@valzaya.test', 'marketing_email', true, 'waitlist', 'v1');
insert into public.waitlist_signups (email, drop_id, source, consent_id) values
  ('WAITLISTED@valzaya.test', 'c3000000-0000-4000-8000-000000000001', 'landing', 'c4000000-0000-4000-8000-0000000000a1'),
  ('general@valzaya.test', null, 'landing', 'c4000000-0000-4000-8000-0000000000a2');

create temporary table addr as
  select '{"recipient_name":"T","phone":"+971500000000","line1":"1 St","city":"Dubai","emirate":"dubai","country_code":"AE"}'::jsonb as v;
create temporary table k (name text primary key, code text);

-- A fresh bag with one unit for a customer (helper).
create function pg_temp.bag_for(p_customer uuid) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := public.cart_for_customer(p_customer, true);
  perform public.cart_add_item(v, 'c2000000-0000-4000-8000-0000000000a1', 1);
  return v;
end $$;
create function pg_temp.order_reason(p_customer uuid) returns text language sql as $$
  select reason from public.create_order_from_cart(pg_temp.bag_for(p_customer), 'typed@valzaya.test', null, 'en',
    (select v from addr), 'standard', p_customer);
$$;

-- 1. Orders need a signed-in customer ----------------------------------------------------------
insert into public.carts (id, guest_token_hash) values ('c5000000-0000-4000-8000-000000000001', repeat('9', 64));
select public.cart_add_item('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000a1', 1);
select results_eq(
  $$ select reason from public.create_order_from_cart('c5000000-0000-4000-8000-000000000001', 'g@valzaya.test', null, 'en',
       (select v from addr), 'standard') $$,
  $$ values ('login_required') $$, 'a guest cannot order (bag yes, checkout no)');
select is((select count(*)::int from public.inventory_reservations where cart_id = 'c5000000-0000-4000-8000-000000000001'), 0,
  'and nothing is held for them');

-- 2. The early-access gate ------------------------------------------------------------------------
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a3'), 'early_access_only',
  'a customer who is not waitlisted and has no code cannot buy during early access');
select is((select count(*)::int from public.inventory_reservations ir
             join public.carts c on c.id = ir.cart_id
            where c.customer_id = 'c1000000-0000-4000-8000-0000000000a3'), 0,
  'the refusal holds nothing');
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a1'), 'ok',
  'a customer whose verified email is on this drop''s waitlist can (email match ignores case)');
select is((select email::text from public.orders where customer_id = 'c1000000-0000-4000-8000-0000000000a1'),
  'waitlisted@valzaya.test', 'the order email is the account email, not what the form sent');
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a2'), 'ok',
  'the general waitlist (no drop) also qualifies');

-- 3. Personal access codes ----------------------------------------------------------------------
insert into k select 'c' || row_number() over (), code
  from public.issue_access_codes('c3000000-0000-4000-8000-000000000001', 3, 'test batch');
select is((select count(*)::int from k), 3, 'three codes issued');
select ok((select bool_and(code ~ '^VZ-[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$') from k),
  'format VZ-XXXXX-XXXXX without look-alike characters');
select is((select count(*)::int from public.drop_access_codes
            where drop_id = 'c3000000-0000-4000-8000-000000000001' and note = 'test batch'), 3, 'three hashes stored');
select is((select count(*)::int from public.drop_access_codes a join k on a.code_hash = k.code), 0,
  'the codes themselves are never stored');
select throws_ok($$ select * from public.issue_access_codes('c3000000-0000-4000-8000-000000000001', 0) $$,
  '22023', null, 'a batch needs 1..500 codes');

select results_eq(
  $$ select reason from public.redeem_access_code('c1000000-0000-4000-8000-0000000000a4', 'VZ-NOPE0-NOPE0') $$,
  $$ values ('invalid') $$, 'an unknown code is invalid');
select results_eq(
  $$ select drop_id, reason from public.redeem_access_code('c1000000-0000-4000-8000-0000000000a4', (select code from k where name = 'c1')) $$,
  $$ values ('c3000000-0000-4000-8000-000000000001'::uuid, 'ok') $$, 'a code is redeemed for its drop');
select results_eq(
  $$ select reason from public.redeem_access_code('c1000000-0000-4000-8000-0000000000a4',
       lower(replace((select code from k where name = 'c1'), '-', ' '))) $$,
  $$ values ('ok') $$, 'redeeming again (any case, any separators) is fine for its holder');
select results_eq(
  $$ select reason from public.redeem_access_code('c1000000-0000-4000-8000-0000000000a5', (select code from k where name = 'c1')) $$,
  $$ values ('used') $$, 'nobody else can use a redeemed code');
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a4'), 'ok',
  'a code holder can buy during early access without being waitlisted');
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a5'), 'early_access_only',
  'a customer whose code attempt failed still cannot');

insert into k select 'closed', code from public.issue_access_codes('c3000000-0000-4000-8000-000000000002', 1);
select results_eq(
  $$ select reason from public.redeem_access_code('c1000000-0000-4000-8000-0000000000a5', (select code from k where name = 'closed')) $$,
  $$ values ('closed') $$, 'a code for a closed drop cannot be redeemed');
select throws_ok(
  $$ select * from public.redeem_access_code('c9999999-0000-4000-8000-000000000000', (select code from k where name = 'c2')) $$,
  'P0002', null, 'only existing customers redeem codes');

update public.drops set status = 'open' where id = 'c3000000-0000-4000-8000-000000000001';
select is(pg_temp.order_reason('c1000000-0000-4000-8000-0000000000a3'), 'ok',
  'once the drop is open, any signed-in customer can buy');

-- 4. Customer bags ------------------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('c1000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@valzaya.test'),
  ('c1000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'returning@valzaya.test');
select is(public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1'), null, 'no bag until one is needed');
select is(public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1', true),
          public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1', true), 'one active bag per customer');
select throws_ok($$ select public.cart_for_customer('c9999999-0000-4000-8000-000000000000', true) $$,
  'P0002', null, 'unknown customers get no bag');

-- new@ has an empty bag from above; returning@ has no bag at all.
insert into public.carts (id, guest_token_hash) values
  ('c6000000-0000-4000-8000-000000000001', repeat('a', 64)),
  ('c6000000-0000-4000-8000-000000000002', repeat('b', 64));
select public.cart_add_item('c6000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000a1', 2);
select public.cart_add_item('c6000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-0000000000a1', 3);

select is(public.claim_guest_cart(repeat('b', 64), 'c1000000-0000-4000-8000-0000000000b2'),
  'c6000000-0000-4000-8000-000000000002'::uuid, 'no customer bag yet: the guest bag is adopted');
select results_eq(
  $$ select customer_id, guest_token_hash, status::text from public.carts where id = 'c6000000-0000-4000-8000-000000000002' $$,
  $$ values ('c1000000-0000-4000-8000-0000000000b2'::uuid, null::text, 'active') $$,
  'it now belongs to the customer and no longer to the cookie');

select is(public.claim_guest_cart(repeat('a', 64), 'c1000000-0000-4000-8000-0000000000b1'),
  public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1'), 'a customer bag exists: the guest bag is merged into it');
select is((select quantity from public.cart_items
            where cart_id = public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1')), 2,
  'with its lines');
select is((select status::text from public.carts where id = 'c6000000-0000-4000-8000-000000000001'), 'abandoned',
  'and the guest bag is closed');
select is(public.claim_guest_cart(repeat('c', 64), 'c1000000-0000-4000-8000-0000000000b1'),
  public.cart_for_customer('c1000000-0000-4000-8000-0000000000b1'), 'no guest bag: the customer bag is returned');
select is(public.claim_guest_cart(repeat('d', 64), 'c1000000-0000-4000-8000-0000000000a5'),
  (select public.cart_for_customer('c1000000-0000-4000-8000-0000000000a5')), 'neither: whatever the customer has (or null)');
select ok((select relrowsecurity from pg_class where oid = 'public.drop_access_codes'::regclass),
  'drop_access_codes has RLS enabled');

select * from finish();
rollback;
