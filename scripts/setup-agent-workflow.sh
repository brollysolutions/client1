#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
uv --cache-dir "$REPO_ROOT/.uv-cache" run --no-project python \
  "$REPO_ROOT/scripts/agent_workflow.py" setup
uv --cache-dir "$REPO_ROOT/.uv-cache" run --no-project python \
  "$REPO_ROOT/scripts/agent_workflow.py" validate

cat <<'EOF'

Optional vetted plugins:
  codex plugin add superpowers@openai-curated
  codex plugin add codex-security@openai-curated
  claude plugin install superpowers@claude-plugins-official
  claude plugin install security-guidance@claude-plugins-official

Review and trust the checked-in hooks/MCP configuration, then start a new agent session.
EOF
