# Repo Map

Monorepo for the Loans & Real Estate Platform.

```
apps/
  web/      Next.js App Router frontend (six role dashboards + public site)
  api/      FastAPI backend (app/: api, core, db, models, schemas, services, jobs, cache, scheduler, tests)
packages/
  contracts/  OpenAPI JSON (source of truth) + generated TS client
  ui/         shared UI primitives + design tokens
infra/        docker, nginx, optional IaC
docs/
  specs/        SRS + feature list (product source of truth)
  architecture/ master ERD + per-role system designs + system-overview
  design/       brand, ui-principles, page/component patterns, a11y, review checklist
  adr/          architecture decision records
  ai/           repo-map, engineering-rules, prompts, progress
  runbooks/     operational procedures
scripts/      verify.sh + per-app verify + contract generation + init-dev
.claude/      settings, rules (glob-scoped), skills, agents, hooks
.github/      CI, Claude PR review, security workflows
.githooks/    pre-commit / pre-push (enable via scripts/init-dev.sh)
```

## Where things live
- **Schema truth:** `docs/architecture/master_erd.mermaid`
- **Auth/OTP/JWT/RLS handoff:** `docs/architecture/Auth_System_Design.md`
- **Per-role surfaces:** `docs/architecture/{Admin,Client,Agent,SubAdmin,Telecaller,Employee}_Dashboard_System_Design.md`
- **Requirements:** `docs/specs/Loans_RealEstate_SRS_v1_2.md`, `Loans_RealEstate_Feature_List_v1_2.md`

## Status
Greenfield scaffold. `apps/web` and `apps/api` hold the directory skeleton only — no application
code yet. Verify scripts skip cleanly until each app is initialized.
