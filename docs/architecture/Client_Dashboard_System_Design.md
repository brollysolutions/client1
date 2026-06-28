# Client Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on the Auth subsystem (signed off) and the single-DB + line-specific client profiles + RLS segregation model.

---

## 1. Scope

This document specifies the **Client** dashboard: the authenticated surface a `role = client` account sees. It covers the line-scoped surfaces backed by one or two `client_profiles` rows, the screens/routes, the loan and property status models, every client-owned table, the key flows, and how client queries wire into Row-Level Security.

It does **not** redesign auth (covered separately) and treats tables owned by other modules — `properties`, `banks`, `loan_types`, `banners` — as **referenced externals** (stubbed in the ER diagram), to be fully specified by their owning dashboards.

---

## 2. Dashboard model — one login, separate line-specific client profiles

A customer has one login identity in `auth_users`, but each business line is represented by a separate row in `client_profiles`.

| Customer selection | Rows created | Surface shown |
|---|---|---|
| Loans only | one `client_profiles` row with `business_line = loans` | Loan journey screens |
| Real Estate only | one `client_profiles` row with `business_line = real_estate` | Property screens |
| Loans + Real Estate | two `client_profiles` rows under the same `auth_user_uuid` | separate Loan and Real Estate areas |

There is no `business_line = both`. A customer who uses both products is represented as **two separate customer/profile records** under one mobile login. This preserves the client's requirement that Loans and Real Estate remain completely separate for workflows, dashboards, reports, permissions, and analytics.

Green and amber never co-occur on a single working screen. A customer with two profiles switches between the green Loans area and the amber Real Estate area. Shared identity actions such as login, password reset, and mobile-number support belong to `auth_users`; line-specific status, transactions, referrals, support context, and workflows belong to `client_profiles`.

**Shell composition:** identity-level header → profile/line switcher → line-specific banner stack → line-specific status summary → notifications → referral CTA.
## 3. Screens / routes

```
/dashboard                 home (banner stack + status summary + notif preview + referral CTA)

LOANS line only
  /loan/status             full-pipeline loan journey (read-only timeline)

REAL-ESTATE line only
  /properties              browse approved listings (RERA status shown per listing)
  /properties/{id}         listing detail → raise inquiry
  /inquiries               my inquiries + their visits
  /inquiries/{id}/visit    request / view a scheduled visit (vehicle arrangement read-only)

SHARED (identity-level, with line/profile filters where needed)
  /transactions            cashback + referral payout ledger (read-only)
  /referrals               my referral code, share (wa.me), conversion tracking
  /notifications           list, mark-read, deep-link redirect
  /profile                 profile, history, account management, delete-account, logout
  /support                 raise ticket (forgot-pwd / OTP / lost-mobile / general)
```

The line-specific routes are gated by the active `client_profile_uuid`. A customer without a Loan profile cannot access Loan routes; a customer without a Real Estate profile cannot access Real Estate routes. A customer with both profiles can switch between them, but each query is scoped to one profile and one business line at a time.

---

## 4. Status models — full internal pipeline (client-visible)

Per the decision, the client sees the **internal journey status verbatim** — no collapsing. Two distinct status axes exist and must not be conflated:

- **Lead ownership axis** (`leads.status`) — who owns the lead and the FR-4.6 expiry timer. **Internal only**, never shown to the client.
- **Journey axis** (`loan_applications.status` / `property_inquiries.status`) — the work pipeline. **Shown to the client in full.**

### 4.1 Loan journey (`loan_applications.status`)

```
new → assigned → contacted → docs_collected → submitted_to_bank
    → sanctioned → disbursed → closed
branches: rejected · on_hold
```

`on_hold` and `rejected` carry a `status_reason` surfaced to the client (e.g. "awaiting salary slip"). Internal actor identity and internal notes are **not** part of this and are not shown.

### 4.2 Property journey (`property_inquiries.status`)

```
inquiry → visit_scheduled → visited → in_discussion → closed_won
branches: closed_lost · cancelled
```

Each inquiry may spawn one or more `property_visits` (`scheduled → completed`, or `cancelled` / `no_show`). Vehicle arrangement is shown to the client **read-only**.

---

## 5. Data model

Conventions inherited from Auth v1.4: `auth_users` is the login identity table. Client-owned business records point to `client_profiles.id`, not directly to `auth_users.id`, so Loans and Real Estate remain separately reportable even under one mobile number.

New enums introduced here: `lead_status`, `lead_origin`, `loan_status`, `fee_outcome`, `property_inquiry_status`, `visit_status`, `vehicle_status`, `txn_type`, `txn_method`, `txn_status`, `support_category`, `support_status`.

### 5.0 `client_profiles` — one row per customer per line

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | line-specific client/customer profile |
| `auth_user_uuid` | UUID FK → auth_users.id | login identity / mobile owner |
| `business_line` | business_line NOT NULL | `loans` or `real_estate` only |
| `customer_code` | TEXT UNIQUE | display/search ID; can include line prefix such as `CL-LN-...` / `CL-RE-...` |
| `status` | TEXT | active / suspended / soft_deleted |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

*Constraint:* `UNIQUE (auth_user_uuid, business_line)` — one active Loan profile and one active Real Estate profile per mobile login.

### 5.1 `leads` — pipeline spine (FR-4.x)

One per requirement-selection. An agent-introduced lead may exist before the customer creates a login/profile; it is later bound to the correct `client_profile_uuid` after OTP verification.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_profile_uuid` | UUID NULL FK → client_profiles.id | NULL until claim/registration |
| `business_line` | business_line NOT NULL | immutable; `loans` or `real_estate` only |
| `origin` | lead_origin NOT NULL | `direct` \| `agent` |
| `origin_agent_profile_uuid` | UUID NULL FK → agent_profiles.id | set when `origin=agent`; never transferred routinely |
| `assigned_telecaller_profile_uuid` | UUID NULL FK → staff_profiles.id | assigned line-specific telecaller |
| `name` | TEXT | captured at creation |
| `mobile` | TEXT NOT NULL | E.164; dedupe key within line |
| `requirement` | JSONB | captured requirement detail |
| `status` | lead_status NOT NULL | `new`/`assigned`/`working`/`converted`/`closed`/`released` |
| `released_at` | TIMESTAMPTZ NULL | Admin exception only |
| `release_reason` | TEXT NULL | Admin exception reason |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

*Constraint:* partial UNIQUE on `(mobile, business_line)` WHERE `status NOT IN ('closed','released')` — prevents duplicate active leads in the same line without blocking a separate Loan/Real Estate profile.

### 5.2 `loan_applications` — loan journey (loans line)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_uuid` | UUID NOT NULL FK → leads.id | |
| `client_profile_uuid` | UUID NOT NULL FK → client_profiles.id | line-specific owner |
| `business_line` | business_line NOT NULL | constant `loans` |
| `loan_type_id` | UUID FK → loan_types.id | config-driven |
| `bank_id` | UUID NULL FK → banks.id | per-bank availability |
| `amount_requested` / `amount_sanctioned` | NUMERIC | |
| `interest_rate` / `processing_fee` | NUMERIC NULL | |
| `fee_outcome` | fee_outcome NULL | `waived` \| `cashback` \| `none` |
| `status` | loan_status NOT NULL | full pipeline (§4.1) |
| `status_reason` | TEXT NULL | shown to client for `on_hold`/`rejected` |
| `opened_at`/`closed_at` | TIMESTAMPTZ | |

*Constraint:* partial UNIQUE on `client_profile_uuid` WHERE `status NOT IN ('closed','rejected')` — one active loan journey per Loan profile.

### 5.3 `loan_txn_history` (FR-6.5)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `loan_application_uuid` | UUID FK → loan_applications.id | |
| `bank_name` | TEXT | |
| `amount` | NUMERIC | |
| `interest_rate` | NUMERIC | |
| `txn_date` | DATE | |
| `entered_by_profile_uuid` | UUID FK → staff_profiles.id | loans telecaller |
| `created_at` | TIMESTAMPTZ | |

### 5.4 `property_inquiries` (real-estate line)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_uuid` | UUID FK → leads.id | |
| `client_profile_uuid` | UUID FK → client_profiles.id | line-specific owner |
| `business_line` | business_line NOT NULL | constant `real_estate` |
| `property_uuid` | UUID FK → properties.id | approved property |
| `status` | property_inquiry_status | full pipeline (§4.2) |
| `notes` | TEXT | internal/role-gated |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

Multiple concurrent property inquiries are allowed for one Real Estate profile.

### 5.5 `property_visits`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `inquiry_uuid` | UUID FK → property_inquiries.id | |
| `scheduled_at` / `visited_at` | TIMESTAMPTZ | |
| `status` | visit_status | scheduled/completed/cancelled/no_show |
| `created_at` | TIMESTAMPTZ | |

### 5.5a `vehicle_arrangements`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `visit_uuid` | UUID UNIQUE FK → property_visits.id | one arrangement per visit |
| `pickup_location` / `pickup_time` | TEXT / TIMESTAMPTZ | client requested |
| `status` | vehicle_status | requested/arranged/assigned/completed/cancelled |
| `vehicle_info` / `driver_name` / `driver_mobile` | TEXT | company-filled |
| `arranged_by_profile_uuid` | UUID FK → staff_profiles.id | Admin/Employee |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

### 5.6 `transactions` — line-specific ledger

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `client_profile_uuid` | UUID NULL FK → client_profiles.id | SET NULL on de-link |
| `retained_ref` | TEXT | internal ref after PII purge |
| `business_line` | business_line NOT NULL | `loans` or `real_estate` |
| `type` | txn_type | cashback/referral_payout/commission_payout |
| `amount` | NUMERIC | |
| `method` | txn_method | razorpay/cheque |
| `status` | txn_status | initiated/processing/paid/failed |
| `payment_ref` | TEXT | razorpay id or cheque no |
| `paid_at` | TIMESTAMPTZ | settlement date |
| `loan_application_uuid` | UUID NULL FK | cashback source |
| `created_at` | TIMESTAMPTZ | |

### 5.7 `referral_codes` — one per client profile or identity

For MVP, one referral code is generated per `auth_user` and may be filtered by line at conversion. If the business later wants separate Loan/Real Estate referral campaigns, this can be moved to one code per `client_profile_uuid`.

### 5.8 `referrals` — conversion-gated

Referrals store `referrer_auth_user_uuid`, `referred_mobile`, optional `referred_lead_uuid`, `business_line`, and `reward_txn_uuid`. Reward payout is executed by Admin.

### 5.9 `notifications` & `support_tickets`

Notifications may be identity-level (`auth_user_uuid`) or line-specific (`client_profile_uuid` + `business_line`). Support tickets use `auth_user_uuid` for login/mobile issues and `client_profile_uuid` when the issue relates to a Loan or Real Estate workflow.

### 5.10 Soft-delete & de-linked retention (SRS 5.1)

On account deletion, personal fields on `auth_users` and active profiles are erased/soft-deleted. Financial rows in `transactions` survive with `client_profile_uuid` set NULL and `retained_ref` carrying an internal reference only. Retained ~7 years, then purged.
## 6. Key flows

1. **Home load** — resolve `auth_user_uuid` from JWT → fetch the customer's available `client_profiles` → show profile/line switcher → load the selected profile's banner stack, status summary, notifications, and referral CTA.
2. **Add missing line** — an existing customer selects the other line → system creates the missing `client_profiles` row after validation → the UI now shows both line surfaces, still as separate profiles.
3. **Loan status** — render `loan_applications.status` for the active Loan profile as a full timeline; `on_hold`/`rejected` show `status_reason`; transaction history is read-only.
4. **Property inquiry → visit → vehicle** — raise inquiry on an approved listing through the Real Estate profile → request a visit and optional pickup → Employee/Admin schedules and fulfils the visit/vehicle arrangement → client sees the arrangement read-only.
5. **Referral** — view code, share via `wa.me` deep link, track referrals; payout lands in `transactions` only after conversion and Admin approval.
6. **Transactions** — read-only ledger filtered by active `client_profile_uuid` and `business_line`, with optional identity-level combined view.
7. **Notifications** — list, mark-read, deep-link redirect.
8. **Support** — raise ticket; lost-mobile/OTP/forgot-password categories use `auth_user_uuid` and route to Admin.
## 7. Redis usage

**Nothing new.** The locked Redis scope (atomic OTP rate-limiting + JWT blacklist) is unchanged. Unread-notification count is a cheap indexed `COUNT(*) WHERE read_at IS NULL` — it does not justify a cache. Consistent with the cost-discipline principle.

---

## 8. RLS handoff

After token validation the FastAPI dependency sets the identity context and, for line-specific screens, the active profile context:

```sql
SET LOCAL app.auth_user_uuid       = '<uuid>';
SET LOCAL app.role                 = '<role>';
SET LOCAL app.client_profile_uuid  = '<uuid|null>';
SET LOCAL app.business_line        = '<loans|real_estate|null>';
```

Client-owned business tables filter by `client_profile_uuid`, not merely by login identity:

```sql
USING (
  client_profile_uuid = current_setting('app.client_profile_uuid')::uuid
  AND business_line = current_setting('app.business_line')::business_line
)
```

This is stricter than the previous own-user policy. A customer with both Loan and Real Estate profiles can access both, but only one profile/line at a time. Admin reporting can count Loan customers from `client_profiles WHERE business_line = 'loans'` and Real Estate customers from `client_profiles WHERE business_line = 'real_estate'`.

`property_visits` and `vehicle_arrangements` inherit client visibility through joins to the owning `property_inquiries` row. Identity-level tables such as login events and password reset use `auth_user_uuid`; line-specific workflow tables use `client_profile_uuid`.
## 9. Decisions log & open items

### Locked
1. **No `business_line = both`** — customers with both products have two `client_profiles` rows under one login identity.
2. **One active loan journey per Loan profile** — partial UNIQUE on `loan_applications.client_profile_uuid` for non-terminal status.
3. **Full internal pipeline shown** — client sees journey status verbatim; internal actor identity and internal notes stay role-gated.
4. **Multiple concurrent property inquiries** — allowed under the Real Estate profile.
5. **Unified transactions ledger** — one table, but every row is line-tagged and optionally profile-linked.
6. **Referral payout execution** — Admin executes payout; Sub Admin may manage content/rules only.
7. **Vehicle arrangement** — dedicated table, not columns on `property_visits`.
8. **Client RLS is profile + line scoped** — business queries use `client_profile_uuid` and `business_line`.
9. **Agent-introduced leads do not auto-expire** — they remain attributed until fulfilled/closed/Admin manual release.

### Open
A. **`status_reason` visibility for `rejected`** — confirm whether the bank's rejection reason is surfaced verbatim or softened.
B. **Banner match precedence** — when a user qualifies for multiple personalized banners, confirm tie-break priority.
