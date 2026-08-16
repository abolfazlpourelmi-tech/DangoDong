#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and checks that the access
# rules still hold. Nothing here touches the hosted database.
#
#   supabase/tests/run.sh
#
# Needs a local PostgreSQL (initdb, pg_ctl, psql) on PATH — `brew install
# postgresql@16` on macOS, `apt install postgresql` on Debian/Ubuntu.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$here/../migrations"

for tool in initdb pg_ctl psql; do
  command -v "$tool" >/dev/null || { echo "missing $tool — install PostgreSQL first"; exit 1; }
done

# initdb refuses to start under some locales in Homebrew builds.
export LC_ALL=C LANG=C

work_dir="$(mktemp -d)"
data_dir="$work_dir/data"
# The socket lives in its own short path: Postgres caps socket paths at 103
# bytes, and a mktemp path plus the socket name can exceed that.
sock_dir="$(mktemp -d -t dongpg)"
port="${PGTESTPORT:-5433}"

cleanup() {
  pg_ctl -D "$data_dir" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$work_dir" "$sock_dir"
}
trap cleanup EXIT

run() { psql -h "$sock_dir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> starting a temporary PostgreSQL on port $port"
initdb -D "$data_dir" -U postgres --auth=trust >/dev/null
pg_ctl -D "$data_dir" -o "-k $sock_dir -h '' -p $port" -w -l "$data_dir/server.log" start >/dev/null

run -c "create database dongtest;" >/dev/null
run -d dongtest -f "$here/schema-stub.sql"

echo "==> applying migrations"
for migration in "$migrations_dir"/*.sql; do
  echo "    $(basename "$migration")"
  run -d dongtest -f "$migration"
done

echo "==> re-applying them — migrations must be safe to run twice"
for migration in "$migrations_dir"/*.sql; do
  run -d dongtest -f "$migration" >/dev/null
done

echo "==> checking the access rules"
log="$work_dir/tests.log"
# Assertions raise on failure, so ON_ERROR_STOP decides the exit status.
if ! psql -h "$sock_dir" -p "$port" -U postgres -d dongtest -v ON_ERROR_STOP=1 -tA \
       -f "$here/migrations.test.sql" > "$log" 2>&1; then
  grep -E 'PASS|FAIL|ERROR' "$log" || cat "$log"
  echo "==> FAILED"
  exit 1
fi

grep -E 'PASS' "$log" | sed 's/^NOTICE:  /    /'
echo "==> all checks passed"
