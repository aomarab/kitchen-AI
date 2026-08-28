#!/usr/bin/env bash
# Post-deploy smoke test: confirms a live deployment is actually wired end to end,
# not just process-up. Non-invasive — it creates no data.
#
#   ./deploy/smoke.sh https://api.example.com
#   BASE_URL=https://api.example.com ./deploy/smoke.sh
#
# Checks:
#   1. GET  /health         -> 200 with status ok + database true (DB reachable)
#   2. POST /auth/register {} -> 400 VALIDATION_FAILED (routing + zod + error
#      envelope all work, without creating a user)
#
# Exits non-zero on the first failure so it is usable as a deploy gate.
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:3333}}"
BASE_URL="${BASE_URL%/}"
fail=0

check() {
  local name="$1" method="$2" path="$3" expect_status="$4" expect_body="$5" data="${6:-}"
  local body status
  body="$(mktemp)"
  if [[ "$method" == GET ]]; then
    status="$(curl -sS -o "$body" -w '%{http_code}' "${BASE_URL}${path}" || echo 000)"
  else
    status="$(curl -sS -o "$body" -w '%{http_code}' -X "$method" \
      -H 'content-type: application/json' -d "$data" "${BASE_URL}${path}" || echo 000)"
  fi
  if [[ "$status" != "$expect_status" ]]; then
    printf '  FAIL %-28s expected HTTP %s, got %s\n' "$name" "$expect_status" "$status"
    fail=1
  elif ! grep -q "$expect_body" "$body"; then
    printf '  FAIL %-28s HTTP %s but body missing %q\n' "$name" "$status" "$expect_body"
    fail=1
  else
    printf '  ok   %-28s HTTP %s\n' "$name" "$status"
  fi
  rm -f "$body"
}

echo "Smoke test against ${BASE_URL}"
check "health (db reachable)"    GET  /health         200 '"database":true'
check "health (status ok)"       GET  /health         200 '"status":"ok"'
check "register validation"      POST /auth/register  400 '"code":"VALIDATION_FAILED"' '{}'

if [[ "$fail" -ne 0 ]]; then
  echo "SMOKE FAILED"
  exit 1
fi
echo "SMOKE PASSED"
