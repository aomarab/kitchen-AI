#!/usr/bin/env bash
# Backs up the Kitchen AI PostgreSQL database from the running compose stack to a
# timestamped, compressed dump — and, optionally, copies it off-box to an
# S3-compatible bucket (Cloudflare R2) so a lost VM does not lose data.
#
#   ./deploy/backup.sh
#
# Designed to be run by cron or the systemd timer in deploy/systemd/. Idempotent
# and safe to run while the API is serving (pg_dump takes a consistent snapshot).
#
# Configuration (env or repo-root .env, which is sourced if present):
#   PG_CONTAINER      container to dump from        (default: kitchen-postgres)
#   POSTGRES_USER     role to connect as            (default: kitchen)
#   POSTGRES_DB       database to dump              (default: kitchen)
#   BACKUP_DIR        where dumps are written        (default: ./backups)
#   RETENTION_DAYS    prune local dumps older than N (default: 7; 0 disables)
#   BACKUP_S3_BUCKET  if set, also upload to this S3/R2 bucket (off-box copy)
#   S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY  used for the optional upload
set -euo pipefail

cd "$(dirname "$0")/.."

# Read a single-line KEY=value from .env without sourcing the whole file — the
# production .env can hold a multi-line APPLE_PRIVATE_KEY PEM that `. ./.env`
# would choke on. Explicit environment (systemd/cron) wins over .env.
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
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-$(env_val BACKUP_S3_BUCKET)}"
S3_ENDPOINT="${S3_ENDPOINT:-$(env_val S3_ENDPOINT)}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-$(env_val S3_ACCESS_KEY)}"
S3_SECRET_KEY="${S3_SECRET_KEY:-$(env_val S3_SECRET_KEY)}"
S3_REGION="${S3_REGION:-$(env_val S3_REGION)}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  log "ERROR: container '$PG_CONTAINER' is not running. Start the stack first." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
file="${POSTGRES_DB}-${stamp}.sql.gz"
dest="${BACKUP_DIR}/${file}"
tmp="${dest}.partial"

log "Dumping ${POSTGRES_DB} from ${PG_CONTAINER} -> ${dest}"
# --clean --if-exists makes the dump self-restoring onto an existing database.
# Local socket connection uses trust auth, so no password is needed.
if docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges | gzip -c >"$tmp"; then
  mv "$tmp" "$dest"
else
  rm -f "$tmp"
  log "ERROR: pg_dump failed; no backup written." >&2
  exit 1
fi
size="$(du -h "$dest" | cut -f1)"
log "Wrote ${dest} (${size})"

# Optional off-box copy to S3/R2. Only runs when a bucket is configured; a
# failure here does not discard the good local dump.
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  if [[ -z "${S3_ENDPOINT:-}" || -z "${S3_ACCESS_KEY:-}" || -z "${S3_SECRET_KEY:-}" ]]; then
    log "WARN: BACKUP_S3_BUCKET set but S3_ENDPOINT/keys are missing; skipping upload." >&2
  else
    log "Uploading ${file} to s3://${BACKUP_S3_BUCKET}/backups/${file}"
    if docker run --rm \
      -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
      -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
      -e AWS_DEFAULT_REGION="${S3_REGION:-auto}" \
      -v "$(cd "$BACKUP_DIR" && pwd)":/backups:ro \
      amazon/aws-cli --endpoint-url "$S3_ENDPOINT" \
      s3 cp "/backups/${file}" "s3://${BACKUP_S3_BUCKET}/backups/${file}"; then
      log "Uploaded to ${BACKUP_S3_BUCKET}"
    else
      log "WARN: off-box upload failed; local dump is still safe at ${dest}." >&2
    fi
  fi
fi

# Prune old local dumps.
if [[ "$RETENTION_DAYS" -gt 0 ]]; then
  pruned="$(find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
  log "Pruned ${pruned} local dump(s) older than ${RETENTION_DAYS} day(s)"
fi

log "Backup complete."
