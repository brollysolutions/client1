# System Overview

Web-only Loans & Real Estate Platform. FastAPI + Next.js · PostgreSQL (RLS) + Redis · Docker ·
APScheduler. Two segregated business lines, six roles.

## Components

- **Public web + six role dashboards** (Next.js App Router): Admin, Sub Admin, Agent, Telecaller,
  Employee, Client. Route groups gated by role + held line(s) from the JWT.
- **API** (FastAPI): routers → services → schemas/models; sets RLS session context per request.
- **PostgreSQL**: single DB, `business_line` discriminator, Row-Level Security (see ADR-0001).
- **Redis**: OTP store/rate-limit, login throttle, JWT blacklist (locked scope).
- **Scheduler** (APScheduler, dedicated service): lead-expiry → open pool (FR-4.6); 7-year
  retention purge of de-linked records (SRS 5.1).
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
| Requirements | `../specs/Loans_RealEstate_SRS_v1_2.md`, `../specs/Loans_RealEstate_Feature_List_v1_2.md` |

## Cross-cutting invariants

See `CLAUDE.md` (root) and `docs/adr/`: line segregation + RLS (0001), web-only/no-telephony
(0002), identity + multi-line client (0003).

## Open items to confirm with client

- Lead-expiry duration (FR-4.6).
- Whether a client may add the second line later (single → both) vs registration-only.
- Loan-type custom-field builder (deferred; `loan_types.custom_fields` slot reserved).
- `CL` user-id width if a firm 1M-client target is confirmed (5th base32 char).
- Who assigns field tasks (Admin-only vs Telecaller-raised) and who verifies collected documents.
