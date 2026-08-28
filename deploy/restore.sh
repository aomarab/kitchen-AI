#!/usr/bin/env bash
# Restores a Kitchen AI PostgreSQL dump produced by deploy/backup.sh into the
# running database. DESTRUCTIVE: the dump is taken with --clean, so it drops and
# recreates every object it contains. Requires an explicit confirmation.
#
#   ./deploy/restore.sh backups/kitchen-20260829-001500.sql.gz
#   ./deploy/restore.sh --yes backups/kitchen-20260829-001500.sql.gz   # no prompt
#
# Configuration (env or repo-root .env):
#   PG_CONTAINER    container to restore into  (default: kitchen-postgres)
#   POSTGRES_USER   role to connect as         (default: kitchen)
#   POSTGRES_DB     database to restore into    (default: kitchen)
set -euo pipefail

cd "$(dirname "$0")/.."

# Read a single-line KEY=value from .env without sourcing the whole file (the
# production .env may hold a multi-line APPLE_PRIVATE_KEY PEM). Explicit
# environment wins over .env.
env_val() {
  local line
  [[ -f .env ]] || return 0
  line="$(grep -E "^[[:space:]]*$1=" .env | tail -n1)" || return 0
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

PG_CONTAINER="${PG_CONTAINER:-kitchen-postgres}"
POSTGRES_USER="${POSTGRES_USER:-$(env_val POSTGRES_USER)}"; : "${POSTGRES_USER:=kitchen}"
POSTGRES_DB="${POSTGRES_DB:-$(env_val POSTGRES_DB)}"; : "${POSTGRES_DB:=kitchen}"

assume_yes=false
dump=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) assume_yes=true ;;
    *) dump="$arg" ;;
  esac
done

if [[ -z "$dump" ]]; then
  echo "Usage: $0 [--yes] <dump.sql.gz>" >&2
  exit 1
fi
if [[ ! -f "$dump" ]]; then
  echo "ERROR: dump file not found: $dump" >&2
  exit 1
fi
if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$PG_CONTAINER' is not running." >&2
  exit 1
fi

if [[ "$assume_yes" != true ]]; then
  echo "This will OVERWRITE database '${POSTGRES_DB}' in '${PG_CONTAINER}' from:"
  echo "  $dump"
  read -r -p "Type 'restore' to proceed: " reply
  [[ "$reply" == "restore" ]] || { echo "Aborted."; exit 1; }
fi

echo "Restoring ${dump} -> ${POSTGRES_DB} ..."
# ON_ERROR_STOP makes a broken dump fail loudly instead of half-applying.
gunzip -c "$dump" | docker exec -i "$PG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restore complete."
