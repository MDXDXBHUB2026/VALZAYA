#!/usr/bin/env bash
# Runs every database test on a throwaway Postgres 16 with pgTAP: rebuilds a scratch database
# from the Supabase stub + all migrations + seed.sql, then runs the pgTAP suites and the
# concurrency race. Used by CI; also works on any machine with Postgres 16 + pgTAP.
#
# Usage: supabase/tests/run-db-tests.sh            (psql must connect as a superuser)
#        PSQL="psql -h localhost -U postgres" DB=vz_test supabase/tests/run-db-tests.sh
# The SQL Editor copy (npm run db:test:editor) remains the way to run rls.test.sql on dev.
set -euo pipefail

PSQL=${PSQL:-psql}
DB=${DB:-vz_test}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

if [ "$($PSQL -X -At -d postgres -c "select count(*) from pg_roles where rolname = 'supabase_admin'")" != "0" ]; then
  echo "refusing to run: this looks like a real Supabase database" >&2
  exit 2
fi

$PSQL -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
apply() { $PSQL -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null || { echo "failed: $1" >&2; exit 1; }; }
apply "$ROOT/supabase/tests/ci/supabase-stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do apply "$f"; done
apply "$ROOT/supabase/seed.sql"
echo "built $DB: stub + $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations + seed"

fail=0
for t in "$ROOT"/supabase/tests/database/*.test.sql; do
  out=$($PSQL -X -q -At -d "$DB" -f "$t" 2>&1 | grep -v '^NOTICE\|^{' || true)
  echo "$out" | grep -E '^(not ok|#)' || true
  if echo "$out" | grep -qE '^not ok|Looks like|ERROR'; then
    echo "FAIL $(basename "$t")"; echo "$out" | grep ERROR || true; fail=1
  else
    echo "PASS $(basename "$t") ($(echo "$out" | grep -c '^ok') assertions)"
  fi
done

PSQL="$PSQL -d $DB" "$ROOT/supabase/tests/concurrency/reserve_race.sh" || fail=1
exit $fail
