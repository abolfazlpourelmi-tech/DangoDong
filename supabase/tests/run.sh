#!/usr/bin/env bash
# Applies every migration to a throwaway database and checks that the access
# rules still hold. Nothing here touches the hosted Supabase project.
#
#   supabase/tests/run.sh
#
# By default it starts its own temporary PostgreSQL, which needs initdb, pg_ctl
# and psql on PATH — `brew install postgresql@16` on macOS, `apt install
# postgresql` on Debian/Ubuntu.
#
# Set PGTEST_URL to reuse a server that is already running (how CI does it,
# against a postgres service container):
#
#   PGTEST_URL=postgres://postgres:postgres@localhost:5432/postgres \
#     supabase/tests/run.sh
#
# Either way the test database is created fresh and dropped afterwards.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$here/../migrations"
test_db="dongodong_migration_test"

command -v psql >/dev/null || { echo "missing psql — install PostgreSQL first"; exit 1; }

work_dir="$(mktemp -d)"

if [[ -n "${PGTEST_URL:-}" ]]; then
  # --- reuse a running server -------------------------------------------
  admin_url="$PGTEST_URL"
  cleanup() {
    psql "$admin_url" -q -c "drop database if exists $test_db;" >/dev/null 2>&1 || true
    rm -rf "$work_dir"
  }
  trap cleanup EXIT
  echo "==> using the PostgreSQL server given in PGTEST_URL"
  psql "$admin_url" -v ON_ERROR_STOP=1 -q -c "drop database if exists $test_db;"
  psql "$admin_url" -v ON_ERROR_STOP=1 -q -c "create database $test_db;"
  # Swap the database name in the connection string.
  test_url="${admin_url%/*}/$test_db"
  run() { psql "$test_url" -v ON_ERROR_STOP=1 -q "$@"; }
  run_raw() { psql "$test_url" -v ON_ERROR_STOP=1 -tA "$@"; }
else
  # --- start a temporary server -----------------------------------------
  for tool in initdb pg_ctl; do
    command -v "$tool" >/dev/null || { echo "missing $tool — install PostgreSQL first"; exit 1; }
  done
  # initdb refuses to start under some locales in Homebrew builds.
  export LC_ALL=C LANG=C
  data_dir="$work_dir/data"
  # The socket lives in its own short path: PostgreSQL caps socket paths at 103
  # bytes, and a mktemp path plus the socket name can exceed that.
  sock_dir="$(mktemp -d -t dongpg)"
  port="${PGTESTPORT:-5433}"
  cleanup() {
    pg_ctl -D "$data_dir" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$work_dir" "$sock_dir"
  }
  trap cleanup EXIT
  echo "==> starting a temporary PostgreSQL on port $port"
  initdb -D "$data_dir" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$data_dir" -o "-k $sock_dir -h '' -p $port" -w -l "$data_dir/server.log" start >/dev/null
  psql -h "$sock_dir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -c "create database $test_db;"
  run() { psql -h "$sock_dir" -p "$port" -U postgres -d "$test_db" -v ON_ERROR_STOP=1 -q "$@"; }
  run_raw() { psql -h "$sock_dir" -p "$port" -U postgres -d "$test_db" -v ON_ERROR_STOP=1 -tA "$@"; }
fi

run -f "$here/schema-stub.sql"

echo "==> applying migrations"
for migration in "$migrations_dir"/*.sql; do
  echo "    $(basename "$migration")"
  run -f "$migration"
done

echo "==> re-applying them — migrations must be safe to run twice"
for migration in "$migrations_dir"/*.sql; do
  run -f "$migration" >/dev/null
done

echo "==> checking the access rules"
log="$work_dir/tests.log"
# Assertions raise on failure, so ON_ERROR_STOP decides the exit status.
if ! run_raw -f "$here/migrations.test.sql" > "$log" 2>&1; then
  grep -E 'PASS|FAIL|ERROR' "$log" || cat "$log"
  echo "==> FAILED"
  exit 1
fi

grep -E 'PASS' "$log" | sed 's/^NOTICE:  /    /'
echo "==> all checks passed"
