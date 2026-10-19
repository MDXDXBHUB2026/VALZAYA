-- seed.sql — TEST DATA ONLY (valzaya-dev). Runs after migrations on `supabase db reset --linked`.
-- Names, prices, copy and Arabic text below are placeholders, not final brand content.
--
-- 4 hero products x 2 colours. Garments: sizes XS–XXL. Scarf: one size (OS).
-- Drop 01 (cap 60) containing every variant. One owner staff placeholder (cannot sign in:
-- no password/identity — link a real auth user to staff_members when you create one).

begin;

-- Owner placeholder ------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'owner@valzaya.test', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
) on conflict (id) do nothing;
-- (public.customers row is created by the on_auth_user_created trigger)

insert into public.staff_members (user_id, role, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner', 'Owner (placeholder)')
on conflict (user_id) do nothing;

-- Settings -----------------------------------------------------------------------------------
insert into public.settings (key, value, is_public, description) values
  ('store.open', 'false', true, 'Storefront accepting orders'),
  ('vat.trn', '"PLACEHOLDER-TRN"', false, 'UAE VAT Tax Registration Number (placeholder)'),
  ('vat.rate_bp', '500', true, 'UAE VAT rate in basis points'),
  ('shipping.rates', '{"AE": {"standard_fils": 0, "express_fils": 3500}, "international": null}', true,
     'Shipping charges in fils, VAT-inclusive (placeholder values)'),
  ('policies.versions', '{"terms": "0.1-draft", "privacy": "0.1-draft", "returns": "0.1-draft", "marketing_consent": "0.1-draft"}', true,
     'Current policy versions (EN + AR must both exist before publishing)')
on conflict (key) do nothing;

-- Products -----------------------------------------------------------------------------------
insert into public.products (
  id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
  fabric, care_en, care_ar, origin_country, status
) values
  ('10000000-0000-4000-8000-000000000001', 'men-linen-set', 'MLS01', 'men',
   'Men''s Linen Set', 'طقم كتان رجالي',
   'Test description: relaxed shirt and drawstring trouser in washed linen.',
   'وصف تجريبي: قميص وبنطال من الكتان المغسول.',
   '100% linen', 'Test care: cold hand wash, line dry.', 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف بالهواء.',
   'AE', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'women-linen-co-ord', 'WLC01', 'women',
   'Women''s Linen Co-ord', 'طقم كتان نسائي',
   'Test description: wrap top and wide-leg trouser in washed linen.',
   'وصف تجريبي: بلوزة ملفوفة وبنطال واسع من الكتان المغسول.',
   '100% linen', 'Test care: cold hand wash, line dry.', 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف بالهواء.',
   'AE', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'linen-shirt', 'LSH01', 'unisex',
   'Linen Shirt', 'قميص كتان',
   'Test description: classic camp-collar linen shirt.',
   'وصف تجريبي: قميص كتان كلاسيكي.',
   '100% linen', 'Test care: cold machine wash, line dry.', 'تعليمات تجريبية: غسيل في الغسالة بماء بارد وتجفيف بالهواء.',
   'AE', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'linen-scarf', 'LSC01', 'unisex',
   'Linen Scarf', 'وشاح كتان',
   'Test description: lightweight frayed-edge linen scarf.',
   'وصف تجريبي: وشاح كتان خفيف.',
   '100% linen', 'Test care: cold hand wash, dry flat.', 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف مسطح.',
   'AE', 'active')
on conflict (id) do nothing;

-- Variants -----------------------------------------------------------------------------------
-- Prices are VAT-inclusive fils. LSH01 is a preorder (ships 2026-12-15) to exercise that path.
with
  p(product_id, style, price_fils, stock_mode, ship_date, garment) as (values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'MLS01', 145000::bigint, 'stock'::public.stock_mode,    null::date,          true),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'WLC01', 135000::bigint, 'stock'::public.stock_mode,    null::date,          true),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'LSH01',  65000::bigint, 'preorder'::public.stock_mode, '2026-12-15'::date,  true),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'LSC01',  29500::bigint, 'stock'::public.stock_mode,    null::date,          false)
  ),
  c(colour_code, colour_en, colour_ar, colour_sort) as (values
    ('SAND', 'Sand', 'رملي', 0),
    ('OLIVE', 'Olive', 'زيتوني', 1)
  ),
  s(size, size_sort) as (values ('XS', 0), ('S', 1), ('M', 2), ('L', 3), ('XL', 4), ('XXL', 5))
insert into public.product_variants (
  product_id, sku, size, colour_code, colour_en, colour_ar, price_fils, stock_mode,
  preorder_ship_date, active, sort_order
)
select p.product_id,
       'VZ-' || p.style || '-' || c.colour_code || '-' || sz.size,
       sz.size, c.colour_code, c.colour_en, c.colour_ar, p.price_fils, p.stock_mode,
       p.ship_date, true, c.colour_sort * 10 + sz.size_sort
from p
cross join c
cross join lateral (
  select s.size, s.size_sort from s where p.garment
  union all
  select 'OS', 0 where not p.garment
) sz
on conflict (sku) do nothing;

-- Opening stock (warehouse) for stock-mode variants, via the ledger -------------------------
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source, note)
select v.id, 'warehouse', case when v.sku like 'VZ-LSC01-%' then 10 else 5 end,
       'initial_count', 'manual', 'seed: test opening stock'
from public.product_variants v
where v.stock_mode = 'stock'
  and not exists (select 1 from public.inventory_levels l where l.variant_id = v.id);

-- Drop 01 -----------------------------------------------------------------------------------
insert into public.drops (id, number, slug, title_en, title_ar, early_access_at, opens_at, closes_at, unit_cap, status)
values (
  '20000000-0000-4000-8000-000000000001', 1, 'drop-01', 'Drop 01', 'الإصدار 01',
  '2026-11-19 16:00:00+04', '2026-11-20 16:00:00+04', '2026-12-04 23:59:00+04', 60, 'scheduled'
) on conflict (id) do nothing;

insert into public.drop_items (drop_id, variant_id, sort_order)
select '20000000-0000-4000-8000-000000000001', v.id, v.sort_order
from public.product_variants v
on conflict do nothing;

commit;
