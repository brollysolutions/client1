# Employee Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on the Auth subsystem (signed off), the Client dashboard, and the Agent dashboard (single-DB + `business_line` discriminator + RLS segregation model).

---

## 1. Scope

This document specifies the **Employee** dashboard: the authenticated surface a `role = employee` account sees. Employees perform **field and background work on assigned tasks** — in-person property visits, physical document collection, and background checks (FR-2.6, FR-7.4) — and nothing else. They create no leads, run no workflows, and **cannot alter records owned or submitted by another user** (FR-2.6).

It treats `users`, `leads`, `loan_applications`, `property_inquiries`, and `property_visits` as **referenced externals** (defined in Auth/Client docs), and introduces the **task assignment spine** that the Employee surface runs on.

Two carried-forward facts shape the design:

- **Provisioned, no OTP** — Employee accounts are Admin-created (Auth §6.2); no self-registration, no SMS.
- **Least privilege, write-locked to own work** — an employee's only writes are to their own task records (status, collected documents, check outcomes). The underlying lead/loan/property data is **read-only** to them.

---

## 2. Dashboard model — single-line adaptive shell `[line-scoping: ASSUMED — flag to change]`

Consistent with the other operational roles (Agent, Telecaller), the Employee shell is single-line:

| Account line | Surface | Accent | Task types seen |
|---|---|---|---|
| `loans` | Loans field work | **Green** | document collection, background check |
| `real_estate` | Real-estate field work | **Amber** | property visit, document collection, background check |

Property visits are **real-estate-only** (FR-7.4); a loans employee never sees them. Document collection and background checks occur in both lines (salary-slip/KYC collection and applicant checks on the loans side; ownership-document collection and seller/buyer checks on the RE side).

> **Open against Auth Item A.** This assumes employees are line-scoped like everyone else. The alternative — a single field-ops pool working across both lines — would make Employee the lone cross-line role, dropping the `business_line` filter from its RLS and weakening segregation. Flagged for the client's ops-structure call; flip here if a shared team is wanted.

**Shell composition:** today's tasks → counts by type/status → overdue flag → notifications preview. No banners, no referral, no commission, no earnings — none apply to this role.

---

## 3. Screens / routes

```
/dashboard            home — today's tasks, counts by type/status, overdue flag, notif preview

TASKS (both lines)
  /tasks              my assigned tasks — list, filter by type/status, due dates
  /tasks/{id}         task detail; actions depend on task_type:
                        • property_visit       → mark visited / no_show, record outcome
                        • document_collection  → upload collected docs, mark collected
                        • background_check     → record outcome (clear/flagged/inconclusive) + notes

ACCOUNT (both lines)
  /profile            profile, history, account management, logout
  /notifications      list, mark-read, deep-link redirect (FR-11.2)
  /support            raise ticket (forgot-pwd / OTP / lost-mobile / general)
```

Property-visit task rows simply don't exist for a loans employee, so `/tasks` needs no line branching beyond the RLS filter; `/tasks/{id}` renders the action panel for the row's `task_type`.

---

## 4. Status models

### 4.1 Task lifecycle (`tasks.status`)

```
assigned → in_progress → completed
branches: cancelled · blocked (awaiting info / access)
```

### 4.2 Task-type-specific completion state

| `task_type` | Completion is recorded as |
|---|---|
| `property_visit` | the linked `property_visits.status` → `completed` / `no_show`; visit notes on the task |
| `document_collection` | one `task_documents` row per collected file; task `completed` when the required set is in |
| `background_check` | `tasks.outcome` ∈ `clear` / `flagged` / `inconclusive`, plus notes |

The employee sets these **outcome** fields only. Verification/acceptance of what was collected (e.g., confirming a salary slip is valid) is an **Admin/Telecaller** step downstream — the employee collects, they do not adjudicate (FR-2.6). `task_documents.verified` is written by the downstream role, not the employee.

---

## 5. Data model

Conventions inherited from Auth/Client: child FK columns named **`user_uuid`** where they point at `users.id`; every business-scoped table carries `business_line` for RLS.

**Referenced externals (not redefined):** `users` (Auth §7.1), `leads`, `loan_applications`, `property_inquiries`, `property_visits` (Client §5).

New enums: `task_type` (`property_visit` / `document_collection` / `background_check`), `task_status`, `bg_check_outcome`.

### 5.1 `tasks` — assignment spine (FR-2.6, FR-7.4)

One row per unit of field/background work assigned to an employee. This is the **authority for who is assigned to what** — superseding the standalone `property_visits.employee_uuid` (see §5.3 reconciliation note).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `assigned_employee_uuid` | UUID NOT NULL FK → users.id | the employee doing the work |
| `assigned_by_uuid` | UUID NOT NULL FK → users.id | Admin who created the task (Open Item A below) |
| `business_line` | business_line NOT NULL | immutable; RLS anchor |
| `task_type` | task_type NOT NULL | `property_visit` / `document_collection` / `background_check` |
| `lead_uuid` | UUID NULL FK → leads.id | the subject lead (usual context) |
| `loan_application_uuid` | UUID NULL FK → loan_applications.id | set for loans-line context |
| `property_inquiry_uuid` | UUID NULL FK → property_inquiries.id | set for RE-line context |
| `property_visit_uuid` | UUID NULL FK → property_visits.id | set 1:1 for `property_visit` tasks |
| `status` | task_status NOT NULL | §4.1 |
| `outcome` | bg_check_outcome NULL | `clear` / `flagged` / `inconclusive` — `background_check` only |
| `notes` | TEXT NULL | employee-entered |
| `due_at` | TIMESTAMPTZ NULL | |
| `completed_at` | TIMESTAMPTZ NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

*Constraint:* `task_type = 'property_visit'` ⇒ `property_visit_uuid IS NOT NULL`; `task_type = 'background_check'` may set `outcome` only when `status = 'completed'`.

### 5.2 `task_documents` — collected physical documents

One row per file collected during a `document_collection` task (Spaces presigned upload, per the storage stack).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `task_uuid` | UUID NOT NULL FK → tasks.id | owning task |
| `doc_type` | TEXT | e.g. `salary_slip`, `aadhaar`, `sale_deed` |
| `object_key` | TEXT | DigitalOcean Spaces key |
| `verified` | BOOLEAN DEFAULT false | set by Admin/Telecaller downstream, **not** the employee |
| `uploaded_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### 5.3 `property_visits` — reconciliation note (touches the Client doc)

The Client doc defined `property_visits.employee_uuid` as the visit's assigned employee. With the task spine, **assignment authority moves to `tasks`**: a `property_visit` task links 1:1 to its `property_visits` row via `property_visit_uuid`, and `property_visits` keeps only visit **detail** (`scheduled_at`, `visited_at`, `status`). `employee_uuid` becomes a denormalized convenience mirror of `tasks.assigned_employee_uuid` (or is dropped). Net: no double source of truth for "who is assigned." Flagged as a Client-doc edit, not a silent change.

> **Vehicle arrangements** (`vehicle_arrangements.arranged_by_uuid`, Client §5.5a) can also be Employee-fulfilled. To keep the task spine tight to the three named work types, vehicle fulfilment is **left on its existing `arranged_by_uuid` mechanism** for now, not folded into `tasks`. Open Item C.

---

## 6. Key flows

1. **Home load** — resolve `business_line` from JWT → today's tasks (`due_at` ≤ today, non-terminal) → counts by `task_type`/`status` → overdue flag → 5 latest notifications.
2. **Property visit** (`property_visit` task) — employee opens the task → sees the `property_inquiries` context (read-only) and any `vehicle_arrangements` detail → conducts the visit → marks the linked `property_visits.status` `completed`/`no_show`, adds notes → task `completed`.
3. **Document collection** (`document_collection` task) — employee collects physical docs in the field → uploads each via presigned Spaces URL → one `task_documents` row per file → marks the task `completed`. Downstream role verifies (`verified = true`); the employee cannot.
4. **Background check** (`background_check` task) — employee performs the check → records `outcome` (`clear`/`flagged`/`inconclusive`) + notes → task `completed`. The employee sees only the fields needed for the check, not the lead's full record.
5. **Notifications / Support** — standard; login/OTP/lost-mobile tickets auto-route to Admin (FR-14.2).

All writes are confined to the employee's own `tasks` / `task_documents` rows. Any attempt to write a lead, loan, property, or another user's record is blocked at the app layer **and** by RLS (§7).

---

## 7. RLS handoff

Session context set from JWT claims after token validation (Auth §13):

```sql
SET LOCAL app.user_uuid     = '<uuid>';
SET LOCAL app.role          = '<role>';
SET LOCAL app.business_line = '<loans|real_estate>';
```

```sql
-- tasks: own assignments + line
USING (
  assigned_employee_uuid = current_setting('app.user_uuid')::uuid
  AND business_line       = current_setting('app.business_line')::business_line
)

-- task_documents: reachable only via the owning task
USING (EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.id = task_uuid
    AND t.assigned_employee_uuid = current_setting('app.user_uuid')::uuid
    AND t.business_line           = current_setting('app.business_line')::business_line
))
```

Read access to context rows (`leads`, `loan_applications`, `property_inquiries`, `property_visits`) is granted **only through a task the employee owns** — a SELECT policy gated on an `EXISTS` join to `tasks`. No task → no visibility. **Write** policies on those tables exclude `role = 'employee'` entirely, enforcing FR-2.6 at the database layer rather than the app alone.

---

## 8. Redis usage

**Nothing new.** No employee flow needs caching or rate-limiting beyond the locked Auth scope (OTP rate-limit + JWT blacklist). Task counts are cheap indexed aggregates. Consistent with cost-discipline.

---

## 9. Decisions log & open items

### Locked (carried from Auth / Client / Agent)
1. **Provisioned, no OTP** — Admin-created Employee accounts (Auth §6.2); forced password reset on first login.
2. **Least privilege, write-locked to own work** — employee writes only their own `tasks` / `task_documents`; lead/loan/property data read-only (FR-2.6), enforced in RLS.
3. **No banners / referral / commission / earnings** — none apply to this role.

### Assumed this round (flag to change — cheap to flip)
4. **Line-scoped employee** (§2) — single-line shell, not a shared cross-line ops pool. *Most worth confirming* (Auth Open Item A). Flipping changes only the RLS line filter + shell.
5. **`tasks` is the assignment spine** (§5.1) and supersedes `property_visits.employee_uuid` (§5.3) — a small Client-doc reconciliation.
6. **Three task types** (`property_visit` / `document_collection` / `background_check`); property visits reuse the existing `property_visits` detail row.

### Still open
A. **Who assigns tasks** — Admin only (current assumption), or may a Telecaller raise a field task when working a lead? Affects `assigned_by_uuid` permission scope.
B. **Document verification owner** — employee collects, but who flips `task_documents.verified`: Admin, or the Telecaller working the lead?
C. **Vehicle arrangement** — keep on `arranged_by_uuid`, or promote to a fourth `task_type`? (§5.3)
D. **Background-check depth** — single `outcome` verdict (current), or structured sub-checks (identity / income / property-title) each with their own state?
