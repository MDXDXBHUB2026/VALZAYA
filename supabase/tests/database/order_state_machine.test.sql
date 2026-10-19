-- Order state machine enforcement in the database (pgTAP). Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d0000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dana@valzaya.test');

insert into public.orders (id, customer_id, email, subtotal_net_fils, vat_fils, total_fils, shipping_address)
values ('0d000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-00000000000d', 'dana@valzaya.test',
        100000, 5000, 105000, '{"city":"Sharjah"}');

select is((select count(*)::int from public.allowed_order_transitions), 27,
  'transition table has 27 rows (mirrors @valzaya/core)');
select matches((select order_number from public.orders where id = '0d000000-0000-4000-8000-0000000000d1'),
  '^VZ-[0-9]{6,}$', 'order number uses VZ-000000 format');
select is((select count(*)::int from public.order_events where order_id = '0d000000-0000-4000-8000-0000000000d1'), 1,
  'order creation writes an order_event');
select ok(exists(select 1 from public.audit_log
                 where entity_type = 'orders' and entity_id = '0d000000-0000-4000-8000-0000000000d1'
                   and action = 'order.created'),
  'order creation writes audit_log');
select throws_ok(
  $$ update public.orders set status = 'paid' where id = '0d000000-0000-4000-8000-0000000000d1' $$,
  'P0001', null, 'direct status UPDATE is blocked');
select throws_ok(
  $$ insert into public.orders (email, status, subtotal_net_fils, vat_fils, total_fils, shipping_address)
     values ('x@valzaya.test', 'paid', 0, 0, 0, '{}') $$,
  'P0001', null, 'orders must be created as pending_payment');

-- As the service role (server-side code path)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((select status from public.apply_order_transition('0d000000-0000-4000-8000-0000000000d1', 'paid', 'test payment')),
  'paid'::public.order_status, 'pending_payment -> paid is allowed');
select throws_ok(
  $$ select public.apply_order_transition('0d000000-0000-4000-8000-0000000000d1', 'shipped') $$,
  'P0001', null, 'paid -> shipped is forbidden');
select throws_ok(
  $$ select public.apply_order_transition('0d000000-0000-4000-8000-0000000000d1', 'in_production') $$,
  'P0001', null, 'stock-only order cannot go into production');
select is((select status from public.apply_order_transition('0d000000-0000-4000-8000-0000000000d1', 'ready_to_ship')),
  'ready_to_ship'::public.order_status, 'stock-only paid -> ready_to_ship is allowed');

reset role;
select is((select count(*)::int from public.order_events where order_id = '0d000000-0000-4000-8000-0000000000d1'), 3,
  'each applied transition writes one order_event');
select is((select count(*)::int from public.audit_log
           where entity_id = '0d000000-0000-4000-8000-0000000000d1' and action = 'order.status_changed'), 2,
  'each applied transition writes one audit_log row');

select * from finish();
rollback;
