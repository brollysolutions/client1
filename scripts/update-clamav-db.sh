#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "usage: $0 --compose-file /absolute/path/docker-compose.prod.yml" >&2
  exit 2
}

if [[ $# -ne 2 || $1 != "--compose-file" ]]; then
  usage
fi

compose_file=$2
if [[ $compose_file != /* || ! -f $compose_file ]]; then
  echo "compose file must be an existing absolute path" >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 2
}
command -v flock >/dev/null 2>&1 || {
  echo "flock is required" >&2
  exit 2
}

project_dir=$(dirname -- "$compose_file")
compose=(docker compose --project-directory "$project_dir" -f "$compose_file")

# Never overlap two database maintenance windows. This lock contains no secret
# and disappears on reboot.
exec 9>/run/lock/dhanadhara-clamav-update.lock
if ! flock -n 9; then
  echo "another ClamAV update is already running" >&2
  exit 1
fi

scanner_stopped=false
restart_scanner_on_exit() {
  status=$?
  trap - EXIT
  if [[ $scanner_stopped == true ]]; then
    if ! "${compose[@]}" up -d clamav; then
      echo "failed to restart ClamAV after database maintenance" >&2
      exit 1
    fi
  fi
  exit "$status"
}
trap restart_scanner_on_exit EXIT

# Running freshclam beside the live engine duplicates its large signature
# working set. Stop clamd first, retain TestDatabases=yes, update the persistent
# signature volume once, then restart. Upload scans fail closed while clamd is
# unavailable; existing application traffic remains online.
scanner_stopped=true
"${compose[@]}" stop -t 30 clamav
"${compose[@]}" run --rm --no-deps \
  -e CLAMAV_NO_CLAMD=true \
  -e CLAMAV_NO_FRESHCLAMD=true \
  clamav freshclam --stdout --user=clamav
"${compose[@]}" up -d clamav
scanner_stopped=false

deadline=$((SECONDS + 300))
until "${compose[@]}" exec -T clamav clamdscan --ping 10 >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "ClamAV did not become healthy within 300 seconds" >&2
    exit 1
  fi
  sleep 5
done

echo "ClamAV signatures updated and scanner is healthy"
