-- Migration: variant_availability
-- The storefront needs "can I buy this size?" per variant, but inventory_levels is staff-only
-- (exact stock is business data). This function exposes a single boolean per variant and
-- nothing else. SECURITY DEFINER so anon can call it without reading inventory_levels.
--   stock    -> true when warehouse on_hand - reserved > 0
--   preorder -> true (made against paid orders; capped by the drop, enforced at checkout in B2)
--   mto      -> true (made to order)
-- Only active variants of active products are returned, mirroring the catalogue RLS policies.
--
-- Rollback notes:
--   drop function if exists public.variant_availability(uuid);

create or replace function public.variant_availability(p_product_id uuid)
returns table (variant_id uuid, available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id,
         case v.stock_mode
           when 'stock' then coalesce((
             select sum(l.available) from public.inventory_levels l
              where l.variant_id = v.id and l.location = 'warehouse'
           ), 0) > 0
           else true
         end
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where v.product_id = p_product_id
     and v.active
     and p.status = 'active';
$$;

revoke execute on function public.variant_availability(uuid) from public;
grant execute on function public.variant_availability(uuid) to anon, authenticated, service_role;
