# System Overview

Web-only Loans & Real Estate Platform. FastAPI + Next.js · PostgreSQL (RLS) + Redis · Docker ·
APScheduler. Two segregated business lines, six roles.

## Components

- **Public web + six role dashboards** (Next.js App Router): Admin, Sub Admin, Agent, Telecaller,
  Employee, Client. Route groups gated by role + held line(s) from the JWT.
- **API** (FastAPI): routers → services → schemas/models; sets RLS session context per request.
- **PostgreSQL**: single DB, `business_line` discriminator, Row-Level Security (see ADR-0001).
- **Redis**: OTP store/rate-limit, login throttle, JWT blacklist (locked scope).
- **Scheduler** (APScheduler, dedicated service): 7-year retention purge of de-linked records (SRS 5.1).
- **External**: 2Factor.in (OTP SMS, Fast2SMS failover); Razorpay/UPI/RuPay + cheque (payouts only);
  DigitalOcean Spaces (media/KYC objects).

## Authoritative documents

| Concern | Document |
|---|---|
| Data model (truth) | `master_erd.mermaid` |
| Auth, OTP, JWT, identity, RLS handoff | `Auth_System_Design.md` |
| Admin (cross-line super-role, config, approvals) | `Admin_Dashboard_System_Design.md` |
| Client (multi-line surfaces, journeys) | `Client_Dashboard_System_Design.md` |
| Agent (single-line, leads, commission) | `Agent_Dashboard_System_Design.md` |
| Sub Admin (content/marketing) | `SubAdmin_Dashboard_System_Design.md` |
| Telecaller (assigned-lead follow-up) | `Telecaller_Dashboard_System_Design.md` |
| Employee (field/task spine) | `Employee_Dashboard_System_Design.md` |
| Requirements | `Loans_RealEstate_SRS_v1_4.md`, `Loans_RealEstate_Feature_List_v1_4.md` |
| Decisions | `Implementation_Decision_Register_v1_4.md` |

## Cross-cutting invariants

See `CLAUDE.md` (root) and `docs/adr/`: line segregation + RLS (0001), web-only/no-telephony
(0002), identity + multi-line client (0003).

## Key Implementation Decisions (v1.4)

See `Implementation_Decision_Register_v1_4.md` for finalized MVP decisions, including:
- Single login identity with separate line-specific profile rows (no `both` business_line).
- Agent-introduced leads do not auto-expire to an open pool.
- Admin creates Employee tasks; Admin verifies completeness.
- Referral payouts are executed by Admin.
