#!/usr/bin/env bash
# Stop hook. Runs changed-scope verification before Claude finishes a turn, so
# "done" is backed by green checks. Non-zero exit asks Claude to keep working.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip cleanly until the verify harness is wired to real apps (greenfield scaffold).
if [[ ! -x ./scripts/verify.sh ]]; then
  echo "verify-before-finish: scripts/verify.sh not executable yet — skipping." >&2
  exit 0
fi

./scripts/verify.sh --changed
