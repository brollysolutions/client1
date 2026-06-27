# Loans & Real Estate Platform

Web-only platform with two segregated business lines (Loans, Real Estate) and six roles
(Admin, Sub Admin, Agent, Telecaller, Employee, Client).

**Stack:** FastAPI · Next.js (App Router) · shadcn/ui · Tailwind · PostgreSQL (RLS) · Redis ·
Docker · APScheduler.

## Layout

- `apps/web` — Next.js frontend · `apps/api` — FastAPI backend
- `packages/contracts` — OpenAPI + generated TS client · `packages/ui` — shared UI
- `docs/specs` — SRS + feature list · `docs/architecture` — ERD + per-role designs · `docs/adr` — decisions
- `docs/design` — design system · `docs/ai` — repo map, rules, prompts, progress · `docs/runbooks` — ops
- `scripts/` — verification + contract generation · `.claude/` — Claude Code operating system
- `.github/` — CI / PR review / security · `infra/` — docker / nginx / IaC

## Getting started

```bash
./scripts/init-dev.sh        # wire git hooks, bring up postgres+redis, install deps when apps exist
./scripts/verify.sh          # full verification (skips apps that aren't initialized yet)
```

The apps are not implemented yet — this repo currently holds the **operating system** (CLAUDE.md
layers, rules, skills, agents, hooks, verify harness, Docker, CI, design + architecture docs) per
the Gold Standard Claude Code workflow. See `CLAUDE.md` and `AGENTS.md` to begin.

## Status & decisions

Greenfield scaffold. Architecture decisions: `docs/adr/`. Product truth: `docs/specs/`,
`docs/architecture/`.
