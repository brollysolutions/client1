# Admin Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — the cross-line super-role; builds on Auth, Client, Agent, Employee, Telecaller, Sub Admin (single-DB + `business_line` discriminator + RLS model).

---

## 1. Scope

This document specifies the **Admin** dashboard: the owner-level surface a `role = admin` account sees, with **full visibility and control across both business lines** (FR-2.2). Admin is the approval authority, the configuration owner, and the only handler of login/OTP support (FR-14.2) and suspicious-account removal (FR-17.4).

Admin **touches every table** in the platform. To stay readable, this doc fully specifies only the **Admin-owned tables** (config, audit, media, banks/loan-types) and treats the rest as referenced externals it acts on. It also **consolidates the recurring staff-`business_line` decision** (Auth Open Item A) into one proposed resolution (§2.1).

---

## 2. Dashboard model — cross-line super-role

Admin is not a single-line shell. It maps to **both lines** and its chrome is neutral; each record shows its own line accent (green loans / amber real-estate). Admin RLS **bypasses the line filter** (§7).

### 2.1 Consolidated staff-`business_line` resolution `[PROPOSED — needs sign-off]`

This resolves Auth Open Item A across every role in one place. Admin sets `business_line` at provisioning (`/users` create form).

| Role | `business_line` | Set how | Rationale |
|---|---|---|---|
| **Admin** | `both` (RLS bypass) | fixed at deploy | full cross-line authority (FR-2.2) |
| **Sub Admin** | `both` (cross-line) | fixed at provisioning | content/marketing spans lines; artifacts line-tagged |
| **Telecaller** | single (per line) | chosen at provisioning | tied to one line's lead pipeline + loan-txn entry |
| **Employee** | single (per line) | chosen at provisioning | tied to one line's field work |
| **Agent** | single (immutable) | at application/approval | **locked** (Auth decision 8) |
| **Client** | single **or `both`** | chosen at registration | a client may hold loan + property journeys under one account; per-record line stays single + immutable (Auth decision 6, revised) |

Implementation: an explicit `both` enum value is used (so the `NOT NULL` CHECK applies to every role), with `both` permitted for **Admin, Sub Admin, and Client**, and a **required single line** for Telecaller, Employee, and Agent. The provisioning form offers a line selector that is **disabled and forced to `both`** for Admin/Sub Admin and **required single** for Telecaller/Employee; the public client registration form lets the customer choose loans, real estate, or both. A client being `both` does not weaken segregation — every business *record* still carries a single immutable `business_line`, and client RLS is by `user_uuid` (own records), so a client sees only their own data across whichever line(s) they hold. Once this is signed off, RLS can be finalised for all roles.

**Shell composition:** cross-line KPI strip → pending-approvals queue (agents, listings, banners) → alerts (suspicious accounts, failed payouts, overdue tasks) → recent audit activity.

---

## 3. Screens / routes

```
/dashboard               overview — cross-line KPIs, approvals queue, alerts, audit feed

PEOPLE
  /users                 provision Sub Admin / Telecaller / Employee; set business_line; deactivate
  /agents                agent approval queue (agent_applications) — approve/reject, issue AG code
  /accounts/suspicious   flag & remove suspicious accounts → soft-delete + de-linked retention (SRS 5.1)

PIPELINE
  /leads                 full lead oversight (both lines, full detail); edit agent/client fields (FR-2.8);
                         NO reassignment of agent-owned leads (FR-4.6)
  /commissions           per-agent / per-deal commission entry (manual, FR-8.2) + payout
  /referrals             referral oversight + payout execution

CONFIG
  /loan-types            add / edit / disable loan types (config-driven, FR-6.4)
  /banks                 bank/product management + per-bank loan-type availability (FR-6.3)
  /banners/approvals     approve/reject Sub Admin banner submissions (FR-12.3)
  /properties/approvals  approve/reject property submissions; verify RERA number (SRS 5.6)

OPERATIONS
  /analytics             weekly/monthly reports, per-agent/team, CSV/Excel export (FR-16)
  /support               support tickets — login/OTP/lost-mobile handled exclusively here (FR-14.2)
  /notifications         admin notifications (per major action, FR-11.3) + broadcast
  /media                 media galleries — separate Loans / Real-Estate (FR-13.1)
```

---

## 4. Status models (Admin-driven transitions)

Admin drives the terminal/approval transitions of flows owned elsewhere:

| Flow | Admin transition |
|---|---|
| `agent_applications.status` | `pending → approved` (issues AG code) / `rejected` |
| `property_submissions.status` | `pending → approved` (creates `properties`, verifies RERA) / `rejected` + reason |
| `banners.status` | `pending_approval → approved → live` / `rejected` |
| `commissions.status` | `pending → approved → paid` |
| `support_tickets.status` | `open → in_progress → resolved` |
| `users.status` | `active → suspended / soft_deleted` (suspicious removal) |

---

## 5. Data model

New enums: `field_target_role` (`agent`/`telecaller`/`employee`), `media_type` (`image`/`video`/`pdf`), `gallery` (`loans`/`real_estate`), `audit_action`.

### 5.1 `banks` (loans line)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | |
| `logo_key` | TEXT NULL | Spaces |
| `active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### 5.2 `loan_types` (config-driven, FR-6.4)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT UNIQUE | |
| `label` | TEXT | display |
| `active` | BOOLEAN | enable/disable without delete |
| `custom_fields` | JSONB NULL | **Open Item A** — null = shared fields; populated = per-type field builder |
| `created_at` | TIMESTAMPTZ | |

### 5.3 `bank_loan_type_availability` (FR-6.3)

| Column | Type | Notes |
|---|---|---|
| `bank_id` | UUID FK → banks.id | |
| `loan_type_id` | UUID FK → loan_types.id | |
| `available` | BOOLEAN | e.g. HDFC → personal only |
| PK | (`bank_id`, `loan_type_id`) | composite |

### 5.4 `field_visibility_config` (FR-2.9, FR-15.1)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `target_role` | field_target_role | agent / telecaller / employee |
| `entity` | TEXT | e.g. `lead` |
| `field_key` | TEXT | e.g. `mobile`, `income` |
| `visible` | BOOLEAN | |
| `updated_by_uuid` | UUID FK → users.id | |
| `updated_at` | TIMESTAMPTZ | |

> The historical **masking** toggle was one row of this matrix (`target_role=telecaller`, `field_key=mobile`). With telephony removed, masking is moot (Telecaller doc §1.1) — the matrix still governs other fields.

> **No Admin surface as of 2026-08-28.** The `/dashboard/access-control` page and
> the `GET`/`PUT /api/v1/admin/field-visibility` routes were withdrawn at the
> user's request. The table, service, migration, audit action, and every runtime
> consumer (`agent`, `telecaller`, `employee`, contact share-links) are unchanged
> and still project through this policy — it is simply frozen at the server-owned
> defaults until a write surface is reinstated. Tracked as an explicit gap in
> `app/core/admin_operational_coverage.py`.

### 5.5 `media_assets` — separate galleries (FR-13.1)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `business_line` | business_line NOT NULL | |
| `gallery` | gallery NOT NULL | loans / real_estate — kept separate (FR-13.1) |
| `media_type` | media_type NOT NULL | image / video / pdf (FR-13.3) |
| `object_key` | TEXT | Spaces; size limits enforced (FR-13.4) |
| `title` | TEXT NULL | |
| `uploaded_by_uuid` | UUID FK → users.id | |
| `created_at` | TIMESTAMPTZ | |

### 5.6 `audit_log` — activity monitoring (FR-11.3, NFR-2.3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `actor_uuid` | UUID FK → users.id | who acted |
| `action` | audit_action | e.g. `agent_approved`, `commission_entered`, `account_removed` |
| `entity_type` / `entity_uuid` | TEXT / UUID | target record |
| `business_line` | business_line NULL | line context where applicable |
| `detail` | JSONB | before/after, reason |
| `created_at` | TIMESTAMPTZ | |

> Distinct from `auth_events` (Auth §7.3, authentication events) — `audit_log` covers business actions. A major action also raises an Admin `notification` (FR-11.3).

### 5.7 Referenced externals Admin acts on

`users`, `agent_applications`, `leads`, `loan_applications`, `property_inquiries`, `property_submissions`, `commissions`, `transactions`, `banners`, `offers`, `content_blocks`, `referral_bonus_config`, `referrals`, `referral_codes`, `support_tickets`, `notifications`, `lead_activities`, `tasks`, `loan_txn_history`.

---

## 6. Key flows

1. **Provision staff** (`/users`) — create Sub Admin/Telecaller/Employee → set `business_line` per §2.1 → temp credentials shown once (Auth §6.2) → forced reset on first login.
2. **Approve an agent** (`/agents`) — review `agent_applications` (KYC + RERA) → approve (issue AG code; if the applicant is an existing single-line client in the same line, upgrade in place; if a `both` client or a cross-line applicant, a separate agent account is created on a different mobile — Auth §7.5) / reject → `audit_log` + applicant notification.
3. **Approve a property** (`/properties/approvals`) — verify RERA number → approve (create/link `properties`) / reject + reason (SRS 5.6).
4. **Enter commission** (`/commissions`) — per agent, per deal, manual amount (FR-8.2) → on payout, write `transactions` (`commission_payout`) + link → `audit_log` (entry restricted + logged, SRS 5.5).
5. **Configure** — loan-types (FR-6.4), bank availability (FR-6.3), field-visibility (FR-2.9) — all config-driven, no developer (FR-6.4).
6. **Remove suspicious account** (`/accounts/suspicious`) — confirm → erase PII, set `soft_deleted`, de-link financial rows to `retained_ref` (SRS 5.1) → `audit_log`.
7. **Support** — handle login/OTP/lost-mobile tickets; lost-mobile → change registered number (Auth §6.5).
8. **Analytics** (`/analytics`) — weekly/monthly, per-agent/team, isolate agent/segment, export CSV/Excel (FR-16).
9. **Media** (`/media`) — manage separate Loans/RE galleries (FR-13.1).

---

## 7. RLS handoff — Admin bypass

Admin sees both lines. The pattern is an **Admin-bypass policy** present on every business table, OR'd with each role's own policy:

```sql
-- on every business-scoped table, in addition to role-specific policies:
CREATE POLICY admin_all ON <table>
  USING      ( current_setting('app.role') = 'admin' )
  WITH CHECK ( current_setting('app.role') = 'admin' );
```

For Admin, `app.business_line` is set to `both` (or the policy simply omits the line predicate), so no row is filtered by line. Every other role keeps its restrictive policy from its own dashboard doc. The two constraints Admin still honours are **app-level, not RLS**: no reassignment of agent-owned leads (FR-4.6) and no editing of records the SRS reserves to their owner beyond Admin's explicit FR-2.8 edit right.

---

## 8. Redis usage

**Nothing new is locked.** Analytics aggregates run directly against indexed columns for Year-1 volume. If load testing (k6/Locust) shows report queries are hot, a short-TTL cache for dashboard counters fits the *selective config cache* already permitted in the locked Redis scope — deferred until measured, per cost-discipline.

---

## 9. Decisions log & open items

### Locked (carried)
1. **Full cross-line authority** (FR-2.2); Admin-bypass RLS (§7).
2. **No reassignment of agent-owned leads** (FR-4.6); manual commission entry (FR-8.2).
3. **Login/OTP/lost-mobile support exclusive to Admin** (FR-14.2).
4. **Soft-delete + de-linked retention** for removals (SRS 5.1).
5. **Config-driven loan-types / bank availability** — no developer (FR-6.4).

### Proposed this round (needs sign-off)
6. **Staff-`business_line` resolution** (§2.1) — resolves Auth Open Item A for all roles; unblocks final RLS. *Single most useful decision to confirm.*
7. **`audit_log` vs `auth_events` split** (§5.6) — business actions vs auth events kept separate.

### Still open
A. **Loan-type custom fields** (FR-5.3) — shared field set (simplest) vs a per-type custom-field builder (larger effort); `loan_types.custom_fields` reserves the slot.
B. **Analytics caching** — deferred to load testing.
C. **Media gallery limits** (FR-13.4) — per-asset size ceilings to confirm.
D. **Telephony references in SRS/feature-list** — §5.7, FR-15 masking, Appendix A `†` need batch correction to the no-telephony reality (also flagged in Telecaller doc §1.1).
