#!/usr/bin/env bash
# Concurrency test for reserve_cart(): many buyers, released at the same instant, race for
# the last units. pgTAP runs in one session, so it cannot show this; parallel sessions can.
#
# Usage: PSQL="psql -d <db>" supabase/tests/concurrency/reserve_race.sh
# Only for a throwaway Postgres with the migrations applied (local or CI). It commits test
# rows, so it refuses to run against a real Supabase project.
#
# Scenarios (each buyer is its own cart and its own connection):
#   stock     20 buyers x 1 unit, 3 in the warehouse        -> exactly 3 holds, reserved = 3
#   drop cap  20 buyers x 1 pre-order unit, drop cap 5       -> exactly 5 holds
#   deadlock  20 buyers x 2 variants, added in both orders   -> no deadlock errors
set -euo pipefail

PSQL=${PSQL:-psql}
BUYERS=${BUYERS:-20}
q() { $PSQL -X -q -At -v ON_ERROR_STOP=1 "$@"; }

if [ "$(q -c "select count(*) from pg_roles where rolname = 'supabase_admin'")" != "0" ]; then
  echo "refusing to run: this looks like a real Supabase database" >&2
  exit 2
fi

RUN=$(date +%s%N | cut -c6-17)
STYLE="R$RUN"
id() { echo "md5('race-$RUN-$1')::uuid"; }

q <<SQL
insert into public.products (id, slug, style_code, gender, name_en, name_ar, description_en, description_ar,
                             fabric, care_en, care_ar, origin_country, status)
values ($(id product), 'race-$RUN', '$STYLE', 'unisex', 'Race', 'س', 'd', 'د', '100% linen', 'c', 'ع', 'AE', 'active');
insert into public.product_variants (id, product_id, sku, size, colour_code, colour_en, colour_ar, price_fils,
                                     stock_mode, preorder_ship_date, active) values
  ($(id stock), $(id product), 'VZ-$STYLE-SAND-M', 'M', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true),
  ($(id pre),   $(id product), 'VZ-$STYLE-SAND-L', 'L', 'SAND', 'Sand', 'رملي', 10000, 'preorder', '2026-12-15', true),
  ($(id big),   $(id product), 'VZ-$STYLE-SAND-S', 'S', 'SAND', 'Sand', 'رملي', 10000, 'stock', null, true);
insert into public.inventory_movements (variant_id, location, delta_on_hand, reason, source) values
  ($(id stock), 'warehouse', 3, 'initial_count', 'manual'),
  ($(id big),   'warehouse', 1000, 'initial_count', 'manual');
insert into public.drops (id, number, slug, title_en, title_ar, opens_at, unit_cap, status)
values ($(id drop), (select coalesce(max(number), 0) + 1 from public.drops), 'race-$RUN', 'Race', 'س',
        now() - interval '1 day', 5, 'open');
insert into public.drop_items (drop_id, variant_id) values ($(id drop), $(id pre));
SQL

# Each buyer i gets a cart per scenario: stock-i, pre-i, mix-i.
q <<SQL
insert into public.carts (id, guest_token_hash)
select md5('race-$RUN-' || s || '-' || i)::uuid, encode(sha256(convert_to('race-$RUN-' || s || '-' || i, 'UTF8')), 'hex')
  from generate_series(1, $BUYERS) i, unnest(array['stock', 'pre', 'mix']) s;
insert into public.cart_items (cart_id, variant_id, quantity)
select md5('race-$RUN-stock-' || i)::uuid, $(id stock), 1 from generate_series(1, $BUYERS) i;
insert into public.cart_items (cart_id, variant_id, quantity)
select md5('race-$RUN-pre-' || i)::uuid, $(id pre), 1 from generate_series(1, $BUYERS) i;
-- Mixed carts hold two stock variants; odd buyers add them in the opposite order.
insert into public.cart_items (cart_id, variant_id, quantity, added_at)
select md5('race-$RUN-mix-' || i)::uuid, v, 1, now() + (case when (i % 2 = 0) = (v = $(id big)) then 0 else 1 end) * interval '1 second'
  from generate_series(1, $BUYERS) i, unnest(array[$(id big), $(id stock)]) v;
SQL

race() { # $1 = scenario; prints one line per buyer: t / f / ERROR
  local scenario=$1 out
  out=$(mktemp -d)
  # A held advisory lock is the starting gun: every buyer blocks on it, then all go at once.
  $PSQL -X -q -At -c "select pg_advisory_lock(4242); select pg_sleep(2); select pg_advisory_unlock(4242);" >/dev/null &
  local gun=$!
  sleep 0.5
  for i in $(seq 1 "$BUYERS"); do
    ( $PSQL -X -q -At -v ON_ERROR_STOP=1 \
        -c "select pg_advisory_lock_shared(4242); select pg_advisory_unlock_shared(4242);" \
        -c "select coalesce(bool_and(reserved), false) from public.reserve_cart(md5('race-$RUN-$scenario-$i')::uuid)" \
        >"$out/$i" 2>&1 || echo ERROR >>"$out/$i" ) &
  done
  wait
  wait $gun 2>/dev/null || true
  for i in $(seq 1 "$BUYERS"); do
    if grep -q ERROR "$out/$i"; then echo ERROR; cat "$out/$i" >&2; else tail -n1 "$out/$i"; fi
  done
  rm -rf "$out"
}

fail=0
check() { # $1 = label, $2 = actual, $3 = expected
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (got $2, want $3)"; fail=1; fi
}

stock=$(race stock)
check "stock: exactly 3 of $BUYERS buyers hold the 3 units" "$(grep -c '^t$' <<<"$stock" || true)" 3
check "stock: no buyer errored" "$(grep -c ERROR <<<"$stock" || true)" 0
check "stock: warehouse reserved = 3, never more" \
  "$(q -c "select reserved || '/' || on_hand from public.inventory_levels where variant_id = $(id stock)")" "3/3"

pre=$(race pre)
check "drop cap: exactly 5 of $BUYERS buyers hold a unit" "$(grep -c '^t$' <<<"$pre" || true)" 5
check "drop cap: no buyer errored" "$(grep -c ERROR <<<"$pre" || true)" 0
check "drop cap: drop_units_left = 0" "$(q -c "select public.drop_units_left($(id drop))")" 0

# Free the 3 stock units so mixed carts compete for them across two variants.
q -c "select sum(public.release_cart_reservations(md5('race-$RUN-stock-' || i)::uuid)) from generate_series(1, $BUYERS) i" >/dev/null
mix=$(race mix)
check "deadlock: no buyer errored (no deadlocks)" "$(grep -c ERROR <<<"$mix" || true)" 0
check "deadlock: exactly 3 mixed carts hold both variants" "$(grep -c '^t$' <<<"$mix" || true)" 3

exit $fail
