#!/usr/bin/env bash
set -euo pipefail

# Dev-only: clear the Redis OTP/login throttle keys so local testing isn't blocked
# by the daily OTP cap (5/day per mobile), the resend limit, or a login lockout.
# These counters live only in Redis (see apps/api/app/cache/redis_keys.py) and are
# NOT touched by a database reset. Never run this against a shared/prod Redis.

PATTERNS=(
  "otp_rate:*"      # daily OTP cap (5/day)
  "otp_resend:*"    # resend window counter (3/window)
  "otp_lock:*"      # resend lock
  "login_fail:*"    # login failure counter
  "login_lock:*"    # login lockout
)

if ! docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep -q "^redis running"; then
  echo "==> redis container not running — start it with: docker compose up -d redis"
  exit 1
fi

echo "==> Clearing OTP + login throttle keys in dev Redis"
total=0
for p in "${PATTERNS[@]}"; do
  keys=$(docker compose exec -T redis redis-cli --scan --pattern "$p")
  if [[ -n "$keys" ]]; then
    n=$(echo "$keys" | wc -l | tr -d ' ')
    echo "$keys" | xargs docker compose exec -T redis redis-cli DEL >/dev/null
    echo "   $p -> deleted $n"
    total=$((total + n))
  else
    echo "   $p -> none"
  fi
done

echo "==> Done. Cleared $total key(s). OTP limits reset."
