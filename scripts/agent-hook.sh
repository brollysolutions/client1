#!/usr/bin/env bash
set -euo pipefail

AGENT_NAME="${1:?usage: agent-hook.sh <codex|claude>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

exec uv --cache-dir "$REPO_ROOT/.uv-cache" run --no-project python \
  "$REPO_ROOT/scripts/agent_workflow.py" hook --agent "$AGENT_NAME"
