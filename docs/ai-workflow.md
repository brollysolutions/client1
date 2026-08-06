# Codex and Claude workflow

Codex and Claude use one behavioral contract (`AGENTS.md`), identical project skills, the same lifecycle policy script, the same Git hooks, and the same PR checks. Their native configuration filenames and invocation syntax differ.

| Capability | Codex | Claude Code |
| --- | --- | --- |
| Always-on instructions | `AGENTS.md` | `CLAUDE.md` imports `AGENTS.md` |
| Project skills | `.agents/skills/<name>` | `.claude/skills/<name>` |
| Invoke a skill | `$brainstorm` | `/brainstorm` |
| Lifecycle hooks | `.codex/hooks.json` | `.claude/settings.json` |
| MCP config | `.codex/config.toml` | `.mcp.json` |
| Security context | `SECURITY.md` | `SECURITY.md` via shared instructions |

## Lifecycle

1. A prompt submitted from `main` or `prod` creates a unique `codex/...` or `claude/...` branch when the worktree is clean.
2. The agent studies the closest instructions, current implementation, tests, history, security context, and indexed reference documents.
3. The agent brainstorms or grills unresolved requirements, plans, implements narrowly, tests, and reviews its diff.
4. The stop hook continues the turn when changed work is dirty, ahead of its remote, or lacks a recorded PR.
5. `$ship` or `/ship` runs the deterministic helper, which commits, pushes to `origin`, and creates or updates a PR against `upstream/main`.
6. CI validates code, contracts, security scans, branch naming, PR title, and required PR description sections. Humans review and merge.

No hook auto-merges. Network writes still honor the active agent's permission and sandbox controls.

## One-time setup

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-agent-workflow.ps1
```

or:

```bash
./scripts/setup-agent-workflow.sh
```

The setup enables the checked-in Git hooks and reports optional tool/plugin prerequisites. Trust the project only after reviewing `AGENTS.md`, `.codex/hooks.json`, `.claude/settings.json`, `.codex/config.toml`, `.mcp.json`, and `scripts/agent_workflow.py`.

Recommended plugins:

- Codex: `superpowers@openai-curated` and `codex-security@openai-curated` (installed on this workstation; the setup output lists the commands for other developers).
- Claude Code: `superpowers@claude-plugins-official` and `security-guidance@claude-plugins-official` (enabled in project settings; Claude prompts each developer to review/install them after repository trust).

The repository skills remain authoritative when a plugin suggests a conflicting process. Claude's TypeScript and Pyright LSP plugins are useful only after their language-server binaries are installed; they are intentionally not forced by project config.

The only project MCP is the official Microsoft `@playwright/mcp`, pinned to a reviewed version, isolated, restricted to local web/API origins, and configured to require approval for writes. Arbitrary page-code evaluation is disabled, and file tools are screened for sensitive paths. It exists for local UI inspection. GitHub operations use the existing `gh` CLI instead of a second token-bearing MCP, and no database MCP is configured because this repository handles sensitive financial/PII data.

## Future reference documents

Place supplied product, policy, SRS, design, or architecture documents under `docs/agent-context/` through `$ingest-context` or `/ingest-context`. Update `INDEX.md` with provenance, date, authority, scope, and known conflicts. Explicit user instructions and current code/tests take priority over stale examples; legal/policy requirements marked authoritative must be escalated when they conflict with implementation.

## GitHub limitation

The upstream repository is private and its current GitHub plan does not expose branch rulesets/protection. Agent hooks, Git hooks, and PR CI enforce the available local/team workflow, but an administrator can still bypass them. If the repository moves to a plan with private-repository rulesets, require PRs and the passing `CI / verify`, `Security / secret-scan`, `Security / dependency-audit`, and `Agent workflow policy / policy` checks on `main`; block force pushes/deletion and dismiss stale approvals.

## Design references

- Codex: [AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance), [project skills](https://learn.chatgpt.com/docs/customization/overview#skills), [hooks](https://learn.chatgpt.com/docs/hooks), [project configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#project-config-files-codexconfigtoml), and [MCP](https://learn.chatgpt.com/docs/extend/mcp#connect-codex-to-an-mcp-server).
- Claude Code: [memory/imports](https://code.claude.com/docs/en/memory), [skills](https://code.claude.com/docs/en/slash-commands), [hooks](https://code.claude.com/docs/en/hooks), [permissions](https://code.claude.com/docs/en/permissions), [MCP](https://code.claude.com/docs/en/mcp), and [official plugins](https://code.claude.com/docs/en/discover-plugins).
- Delivery and supply chain: [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates), and [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp).
