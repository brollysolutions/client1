# Loans & Real Estate Platform

A production full-stack monorepo for a web-only Loans & Real Estate platform. It supports two segregated business lines (Loans, Real Estate) in one ecosystem, utilizing a single Postgres DB with Row-Level Security.

## Stack
- **Backend:** Python, FastAPI, SQLAlchemy 2, PostgreSQL
- **Frontend:** Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS

## AI-assisted development

Codex and Claude use the same repository instructions, skills, safety hooks, branch-per-change policy, and automatic pull-request workflow. Start with [docs/ai-workflow.md](docs/ai-workflow.md), then run the setup script for your shell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-agent-workflow.ps1
```

```bash
./scripts/setup-agent-workflow.sh
```
