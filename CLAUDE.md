@AGENTS.md

# Claude Code mapping

- Project skills live in `.claude/skills` and are invoked as `/brainstorm`, `/grillme`, `/work-feature`, `/systematic-debug`, `/security-review`, `/review-pr`, `/ship`, and `/ingest-context`.
- Project hooks and deny rules live in `.claude/settings.json`. Do not disable or bypass them to finish a task.
- Project MCP configuration lives in `.mcp.json`; approve it only after reviewing the pinned package and scope.
- When a Claude-specific instruction conflicts with `AGENTS.md`, the shared repository contract wins unless the user explicitly overrides it.
