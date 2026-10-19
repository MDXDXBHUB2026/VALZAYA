-- Migration: fix apply_inventory_movement for decreases and reserve-only movements
-- Bug: the trigger applied each movement with INSERT ... ON CONFLICT DO UPDATE. Postgres checks
-- CHECK constraints on the proposed INSERT row before it detects the conflict, so any movement
-- whose deltas alone are not a valid row was rejected even when the existing row could take it:
--   delta_on_hand < 0               (manual decrease, shipment)   -> on_hand >= 0 fails
--   delta_reserved < 0              (release a hold)              -> reserved >= 0 fails
--   delta_reserved > delta_on_hand  (reserve without new stock)   -> reserved <= on_hand fails
-- Fix: update the existing row; insert only when there is none (retrying if another
-- transaction inserts it first). The CHECKs on inventory_levels still reject negative stock
-- and over-reservation, so a movement that would oversell still fails.
--
-- Rollback notes:
--   re-create public.apply_inventory_movement() from 20261019123556_inventory_movements.sql
--   (that version has the bug above).

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  loop
    update public.inventory_levels l
       set on_hand      = l.on_hand + new.delta_on_hand,
           reserved     = l.reserved + new.delta_reserved,
           updated_from = new.source
     where l.variant_id = new.variant_id and l.location = new.location;
    if found then
      return new;
    end if;
    begin
      insert into public.inventory_levels (variant_id, location, on_hand, reserved, updated_from)
      values (new.variant_id, new.location, new.delta_on_hand, new.delta_reserved, new.source);
      return new;
    exception when unique_violation then
      -- Another transaction created the row first; loop and update it.
    end;
  end loop;
end;
$$;

revoke execute on function public.apply_inventory_movement() from public, anon, authenticated;
