# Client Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on the Auth subsystem (signed off) and the single-DB + `business_line` discriminator + RLS segregation model.

---

## 1. Scope

This document specifies the **Client** dashboard: the authenticated surface a `role = client` account sees. It covers the line-scoped surfaces (loans, real estate, or both), the screens/routes, the loan and property status models, every client-owned table, the key flows, and how client queries wire into Row-Level Security.

It does **not** redesign auth (covered separately) and treats tables owned by other modules — `properties`, `banks`, `loan_types`, `banners` — as **referenced externals** (stubbed in the ER diagram), to be fully specified by their owning dashboards.

---

## 2. Dashboard model — line-scoped surfaces, one account

A client account holds one or more business lines, chosen at registration (FR-4.3): **Loans**, **Real Estate**, or **both**. The line is *not* a cage around the account — it is a fact about each record. Every lead, application, inquiry, and transaction is tagged to exactly one immutable line, so a "both" client simply holds separate, isolated journeys under one login. The dashboard is therefore composed of **line-scoped surfaces that light up for the line(s) the client holds**:

| Line held | Surface | Accent (locked palette) |
|---|---|---|
| `loans` | Loan journey screens | **Green** |
| `real_estate` | Property screens | **Amber** |
| `both` | Both surfaces, as separate areas | Green in the loans area, amber in the real-estate area |

Green and amber never co-occur on a single working screen (locked rule) — a "both" client switches between a green loans area and an amber real-estate area; the accents are never mixed on one screen. There is **no longer a requirement to register a second account on a second mobile** to hold both products; one account suffices. RLS filters every client query to the account's own `user_uuid` (own records), so a client sees their own data across whichever line(s) they hold and cannot reach any other client's data or any record they do not own. Internal staff and Agents remain single-line; only the *client* surface is multi-line.

**Shell composition (per line surface):** layered banner stack (default / personalized / action, FR-12) → line-appropriate status summary → notifications preview → referral CTA. For a "both" client, the shared/neutral elements (transactions, referrals, profile, notifications) appear once; the line-specific status summaries appear in their respective areas.

---

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

SHARED (both lines)
  /transactions            cashback + referral payout ledger (read-only)
  /referrals               my referral code, share (wa.me), conversion tracking
  /notifications           list, mark-read, deep-link redirect
  /profile                 profile, history, account management, delete-account, logout
  /support                 raise ticket (forgot-pwd / OTP / lost-mobile / general)
```

The line-specific routes are gated by the line(s) the client holds (carried in the JWT). A loans-only client hitting a real-estate route 404s before any query runs, and vice versa; a **`both` client reaches both groups**. The shared routes are always available. (The JWT carries the held line(s); for a `both` client the gate admits both the loan and the real-estate route groups.)

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

Conventions inherited from Auth: child FK columns are named **`user_uuid`** (UUID → `users.id`); every business-scoped table carries `business_line` for RLS; the public `user_id` string is display-only and never a FK.

New enums introduced here: `lead_status`, `lead_origin`, `loan_status`, `fee_outcome`, `property_inquiry_status`, `visit_status`, `vehicle_status`, `txn_type`, `txn_method`, `txn_status`, `support_category`, `support_status`.

### 5.1 `leads` — pipeline spine (FR-4.x)

One per requirement-selection. Exists **before** an account when an agent introduces it (`user_uuid` NULL until the person registers/converts).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_uuid` | UUID NULL FK → users.id | NULL for agent-introduced pre-account leads |
| `business_line` | business_line NOT NULL | immutable |
| `origin` | lead_origin NOT NULL | `direct` \| `agent` |
| `origin_agent_uuid` | UUID NULL FK → users.id | set when `origin=agent`; **never transferred** (FR-4.6) |
| `assigned_telecaller_uuid` | UUID NULL FK → users.id | |
| `name` | TEXT | captured at creation (agent-supplied or from `users`) |
| `mobile` | TEXT NOT NULL | E.164; dedupe key (FR-4.5) |
| `requirement` | JSONB | captured requirement detail |
| `status` | lead_status NOT NULL | `new`/`assigned`/`working`/`converted`/`expired`/`closed` |
| `expiry_at` | TIMESTAMPTZ NULL | open-pool timer for agent leads (FR-4.6) |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

*Constraint:* partial UNIQUE on `mobile` WHERE `status NOT IN ('expired','closed')` — enforces FR-4.5 "already registered" without blocking re-entry of a long-dead lead.

### 5.2 `loan_applications` — loan journey (loans line)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_uuid` | UUID NOT NULL FK → leads.id | |
| `user_uuid` | UUID NOT NULL FK → users.id | denormalized for RLS |
| `business_line` | business_line NOT NULL | constant `loans` (RLS uniformity) |
| `loan_type_id` | UUID FK → loan_types.id | config-driven (FR-6.4) |
| `bank_id` | UUID NULL FK → banks.id | per-bank availability (FR-6.3) |
| `amount_requested` | NUMERIC | |
| `amount_sanctioned` | NUMERIC NULL | |
| `interest_rate` | NUMERIC NULL | |
| `processing_fee` | NUMERIC NULL | |
| `fee_outcome` | fee_outcome NULL | `waived` \| `cashback` \| `none` (FR-6.6) |
| `status` | loan_status NOT NULL | full pipeline (§4.1) |
| `status_reason` | TEXT NULL | shown to client for `on_hold`/`rejected` |
| `opened_at`/`closed_at` | TIMESTAMPTZ | |

*Constraint:* partial UNIQUE on `user_uuid` WHERE `status NOT IN ('closed','rejected')` — **one active loan journey at a time**; closed/rejected ones retained as history.

### 5.3 `loan_txn_history` (FR-6.5)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `loan_application_uuid` | UUID FK → loan_applications.id | |
| `bank_name` | TEXT | |
| `amount` | NUMERIC | |
| `interest_rate` | NUMERIC | |
| `txn_date` | DATE | |
| `entered_by_uuid` | UUID FK → users.id | telecaller (manual entry) |
| `created_at` | TIMESTAMPTZ | |

### 5.4 `property_inquiries` (real-estate line) — multiple concurrent allowed

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_uuid` | UUID FK → leads.id | |
| `user_uuid` | UUID FK → users.id | |
| `business_line` | business_line NOT NULL | constant `real_estate` |
| `property_uuid` | UUID FK → properties.id | external (RE module) |
| `status` | property_inquiry_status NOT NULL | §4.2 |
| `notes` | TEXT NULL | client-supplied |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

### 5.5 `property_visits`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `inquiry_uuid` | UUID FK → property_inquiries.id | |
| `scheduled_at` | TIMESTAMPTZ | |
| `visited_at` | TIMESTAMPTZ NULL | |
| `status` | visit_status NOT NULL | `scheduled`/`completed`/`cancelled`/`no_show` |
| `employee_uuid` | UUID NULL FK → users.id | conducts visit (FR-7.4) |
| `created_at` | TIMESTAMPTZ | |

Vehicle arrangement is **not** a column here — it is a distinct fulfilment workflow (§5.5a) with its own lifecycle, kept separate so the company-managed logistics fields don't mix with the visit record.

### 5.5a `vehicle_arrangements` — mediator-provided site-visit transport (FR-7.1)

One arrangement per visit (1:1). The **existence** of a row means the client requested a pickup; the company then fulfils it. Reachable only via the visit → inquiry chain, so it inherits ownership and line from `property_inquiries`.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `visit_uuid` | UUID **UNIQUE** FK → property_visits.id | 1:1 with the visit |
| `pickup_location` | TEXT NULL | **client-set** at request |
| `pickup_time` | TIMESTAMPTZ NULL | **client-set** at request |
| `status` | vehicle_status NOT NULL | `requested`→`arranged`→`assigned`→`completed` (+`cancelled`) — **company-managed** |
| `vehicle_info` | TEXT NULL | make / model / plate — company-set, client-read |
| `driver_name` | TEXT NULL | company-set, client-read |
| `driver_mobile` | TEXT NULL | company's driver contact for pickup coordination (not a lead number — no masking) |
| `arranged_by_uuid` | UUID NULL FK → users.id | Employee/Admin who arranged it |
| `created_at`/`updated_at` | TIMESTAMPTZ | |

**Write split:** the client sets only `pickup_location`/`pickup_time` (the request); everything else is written by the company (Employee/Admin) and is **read-only to the client**.

### 5.6 `transactions` — unified ledger (cashback + referral + commission payout)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_uuid` | UUID NULL FK → users.id | **SET NULL on de-linked retention** (see §5.10) |
| `retained_ref` | TEXT NULL | internal reference kept after PII purge |
| `business_line` | business_line NOT NULL | |
| `type` | txn_type NOT NULL | `cashback` \| `referral_payout` \| `commission_payout` (commission added by Agent §5.3) |
| `amount` | NUMERIC NOT NULL | INR |
| `method` | txn_method NOT NULL | `razorpay` \| `cheque` |
| `status` | txn_status NOT NULL | `initiated`/`processing`/`paid`/`failed` |
| `payment_ref` | TEXT NULL | Razorpay payment id **or** cheque number (generic — renamed from `razorpay_payment_id`) |
| `paid_at` | TIMESTAMPTZ NULL | real-world settlement date (distinct from `created_at`) |
| `loan_application_uuid` | UUID NULL FK | source for cashback (cashback has no intermediate record, so the link sits here) |
| `created_at` | TIMESTAMPTZ | |

> **Payout-link convention.** A payout transaction is linked from its **source record** where one exists — `referrals.reward_txn_uuid` (referral payout) and `commissions.payout_txn_uuid` (commission payout). There is no two-way FK. **Cashback** has no intermediate record, so its single link lives here as `loan_application_uuid`. The earlier `referral_uuid` column was dropped as redundant with `referrals.reward_txn_uuid`. Each source→payout relationship is 1:0..1.

### 5.7 `referral_codes` — one per client (FR-9.2)

| Column | Type | Notes |
|---|---|---|
| `user_uuid` | UUID PK FK → users.id | |
| `code` | TEXT UNIQUE NOT NULL | generated short code; client mobile usable as alias |
| `created_at` | TIMESTAMPTZ | |

### 5.8 `referrals` — conversion-gated (FR-9.3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `referrer_user_uuid` | UUID FK → users.id | |
| `referred_mobile` | TEXT | |
| `referred_lead_uuid` | UUID NULL FK → leads.id | set when the referred person becomes a lead |
| `conversion_status` | enum | `pending`/`converted`/`not_converted` |
| `reward_txn_uuid` | UUID NULL FK → transactions.id | set only on conversion → payout |
| `created_at` | TIMESTAMPTZ | |

Reward is written **only** when `conversion_status = converted` — refer ten, one converts, one payout (FR-9.3).

### 5.9 `notifications` & `support_tickets`

`notifications`: `id` · `user_uuid` FK · `business_line` · `type` · `title` · `body` · `deep_link` (redirect target, FR-11.2) · `read_at` NULL · `created_at`. Delivery via VAPID web push (stack).

`support_tickets`: `id` · `user_uuid` NULL FK · `category` (`forgot_password`/`otp_issue`/`lost_mobile`/`general`) · `subject` · `body` · `status` (`open`/`in_progress`/`resolved`) · `handled_by_uuid` NULL FK · `created_at`/`updated_at`. **Login/OTP/lost-mobile tickets routed exclusively to Admin** (FR-14.2); lost-mobile is the auth §6.5 number-change path.

### 5.10 Soft-delete & de-linked retention (SRS 5.1)

On account deletion: personal fields on `users` are erased and `status → soft_deleted`; **financial rows in `transactions` survive**, with `user_uuid` set NULL and `retained_ref` carrying an internal reference only (no PII). Retained ~7 years (CA-confirmed per record type), then purged. Same path for admin-removed suspicious accounts.

---

## 6. Key flows

1. **Home load** — resolve the client's line(s) from JWT → fetch active banner per layer (default/personalized/action) matched on user_type/interest/location → status summary for each line held (active loan application and/or open inquiries) → 5 latest notifications → referral CTA. A single-line client sees one status summary; a `both` client sees a loans summary and a real-estate summary in their respective areas.
2. **Loan status** — render `loan_applications.status` as a full timeline (§4.1); `on_hold`/`rejected` show `status_reason`; transaction history (5.3) listed read-only.
3. **Property inquiry → visit → vehicle** — raise inquiry on an approved listing → request a visit, optionally requesting a pickup (sets `pickup_location`/`pickup_time`, creating a `vehicle_arrangements` row at `requested`) → Employee/Admin schedules the visit and, if requested, arranges transport (`status` → `arranged`/`assigned`, driver + vehicle filled in) → client sees the arrangement read-only.
4. **Referral** — view code, share via `wa.me` deep link, track referrals; cashback lands in `transactions` only on conversion.
5. **Transactions** — unified read-only ledger filtered to own `user_uuid`.
6. **Notifications** — list, mark-read (`read_at`), deep-link redirect (FR-11.2).
7. **Support** — raise ticket; lost-mobile/OTP/forgot-password categories auto-route to Admin.

---

## 7. Redis usage

**Nothing new.** The locked Redis scope (atomic OTP rate-limiting + JWT blacklist) is unchanged. Unread-notification count is a cheap indexed `COUNT(*) WHERE read_at IS NULL` — it does not justify a cache. Consistent with the cost-discipline principle.

---

## 8. RLS handoff

After token validation the FastAPI dependency sets the session context (from Auth §13):

```sql
SET LOCAL app.user_uuid     = '<uuid>';
SET LOCAL app.role          = '<role>';
SET LOCAL app.business_line = '<loans|real_estate|both>';
```

Client-owned tables filter on **own-records only** — `user_uuid` is the client's own UUID:

```sql
-- e.g. on transactions, loan_applications, property_inquiries, notifications…
USING (
  user_uuid = current_setting('app.user_uuid')::uuid
)
```

The line predicate is **deliberately dropped on client-owned policies**. A client may hold `both` lines, and no business *record* is ever tagged `both` (records are always single-line), so a `business_line = app.business_line` check would match nothing for a `both` client. Because each record the client owns is already individually line-tagged and reachable only through their own `user_uuid`, own-records scoping is sufficient: a client sees exactly their own loan and/or property data and nothing else. Segregation between *teams and lines* is unaffected — it is enforced on the staff/agent policies, which **keep** their single-line predicate.

> Staff and Agent policies are unchanged and still carry `AND business_line = current_setting('app.business_line')::business_line`. Only the *client* own-data policies drop the line predicate. This is the one place the multi-line-client change touches RLS.

Because `user_uuid` is the client's own, a client physically cannot read another client's data — enforced at the database layer, not just the app. (A "both" client correctly sees their own records across both lines; the UI still presents them as separate green/amber areas.)

`property_visits` and `vehicle_arrangements` carry no `user_uuid` of their own; their RLS policy filters via an `EXISTS` join to the owning `property_inquiries` row, inheriting the same own-records guarantee.

---

## 9. Decisions log & open items

### Locked
1. **Line-scoped surfaces, one account** — a client holds loans, real estate, or both; the line is a per-record fact, not a cage on the account. Loan surface is green, real-estate surface is amber, never mixed on one working screen. A `both` client switches between the two areas under a single login (no second account / second mobile). *(Revises the earlier "single-line adaptive shell"; Auth decisions 6/8/9 updated accordingly.)*
2. **One active loan journey** — partial UNIQUE on `loan_applications.user_uuid` for non-terminal status; history retained.
3. **Full internal pipeline shown** — client sees journey status verbatim (§4); internal actor identity + notes stay role-gated.
4. **Multiple concurrent property inquiries** — no single-active constraint on the RE side.
5. **Unified `transactions` ledger** — one table, `type` discriminator (`cashback`/`referral_payout`/`commission_payout`); generic `payment_ref` + `paid_at`; payout links live on the source record (see §5.6).
6. **Referral identifier** — generated short `code` (one per client), client mobile usable as alias.
7. **Vehicle arrangement** — dedicated `vehicle_arrangements` table (1:1 with a visit), not columns on `property_visits`. Client sets only the pickup request; the company fulfils it and the client sees it read-only.
8. **Client RLS is own-records only** (§8) — the line predicate is dropped on client-owned policies (no record is ever tagged `both`); staff/agent policies keep their single-line predicate.

### Open
A. **Lead-expiry duration (FR-4.6)** — the `expiry_at` window for agent leads is an operational number to confirm with the client.
B. **`status_reason` visibility for `rejected`** — confirm whether the bank's rejection reason is surfaced to the client verbatim or softened (compliance/UX call).
C. **Banner match precedence** — when a user qualifies for multiple personalized banners, confirm the tie-break (most-recent vs priority field). Owned by the Banner module but consumed here.
D. **When is "both" chosen** — confirm whether a client picks loans / real estate / both only at registration (line set then fixed), or may start single-line and *add* the other line later from their dashboard. The latter is friendlier but makes a client's line set one-directionally mutable (single → both), which affects the "immutable" wording elsewhere. Recommendation: allow add-later, since it rides on the same own-records RLS and only requires issuing the second journey.
