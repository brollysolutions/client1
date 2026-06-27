#!/usr/bin/env bash
set -euo pipefail

echo "==> Docker service health"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found"; exit 0
fi

docker compose ps
echo
echo "==> Waiting for postgres + redis to report healthy"
for svc in postgres redis; do
  cid="$(docker compose ps -q "$svc" 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then echo "  $svc: not running"; continue; fi
  status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo unknown)"
  echo "  $svc: $status"
done
