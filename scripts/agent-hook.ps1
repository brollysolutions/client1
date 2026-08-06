param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("codex", "claude")]
    [string]$AgentName
)

$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw "Not inside a Git repository."
}

& uv --cache-dir (Join-Path $repoRoot ".uv-cache") run --no-project python `
    (Join-Path $repoRoot "scripts/agent_workflow.py") hook --agent $AgentName
exit $LASTEXITCODE
