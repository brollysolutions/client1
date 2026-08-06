$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw "Not inside a Git repository."
}

$cache = Join-Path $repoRoot ".uv-cache"
$workflow = Join-Path $repoRoot "scripts/agent_workflow.py"

& uv --cache-dir $cache run --no-project python $workflow setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& uv --cache-dir $cache run --no-project python $workflow validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Optional vetted plugins:"
Write-Host "  codex plugin add superpowers@openai-curated"
Write-Host "  codex plugin add codex-security@openai-curated"
Write-Host "  claude plugin install superpowers@claude-plugins-official"
Write-Host "  claude plugin install security-guidance@claude-plugins-official"
Write-Host ""
Write-Host "Review and trust the checked-in hooks/MCP configuration, then start a new agent session."
