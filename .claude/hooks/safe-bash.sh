#!/usr/bin/env bash
# PreToolUse(Bash) guard. Reads the tool-call JSON on stdin and blocks obviously
# destructive commands as a deterministic backstop to settings.json deny rules.
# Exit 0 = allow; exit 2 = block (stderr is shown to Claude).
set -euo pipefail

payload="$(cat)"
# Extract the command string (jq if available, else a crude grep fallback).
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')"
else
  cmd="$payload"
fi

block() { echo "BLOCKED by safe-bash.sh: $1" >&2; exit 2; }

case "$cmd" in
  *"rm -rf /"*)                 block "recursive root delete" ;;
  *"rm -rf ~"*)                 block "recursive home delete" ;;
  *"git push --force"*)         block "force push" ;;
  *"docker compose down -v"*)   block "compose down with volume wipe" ;;
  *"alembic downgrade"*)        block "alembic downgrade (needs explicit approval)" ;;
  *"DROP TABLE"*|*"DROP DATABASE"*|*"TRUNCATE"*) block "destructive SQL" ;;
  *"psql"*"prod"*)              block "psql against production" ;;
  *" | sh"*|*" | bash"*)        block "piping remote content to a shell" ;;
esac

exit 0
