# Sub Admin Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on Auth (signed off), Client, Agent, Employee, Telecaller (single-DB + `business_line` discriminator + RLS model).

---

## 1. Scope

This document specifies the **Sub Admin** dashboard: the authenticated surface a `role = sub_admin` account sees. The Sub Admin is a **content / marketing administrator** — banners (Admin-approved), offers / discounts / promotions, website content, and referral-bonus administration (FR-2.3, FR-9.5, FR-12.3) — and may upload property listings (FR-7.3, Admin-approved). The Sub Admin **cannot create or remove agents and cannot view full lead details** (FR-2.3).

`users`, `referrals`, `referral_codes`, `transactions`, `property_submissions` are **referenced externals**. The Sub Admin surface introduces the marketing-content tables.

---

## 2. Dashboard model — cross-line content admin `[line-scoping: ASSUMED — see Admin doc §2.1]`

Unlike the operational roles (Agent / Telecaller / Employee, each tied to one line), the Sub Admin is the first role where **cross-line is the natural fit**: a marketer manages loans banners *and* real-estate banners. So the recommended model is:

- **Sub Admin operates across both lines**, with a **line toggle/filter** in the chrome.
- **Every artifact is line-tagged** (`banners.business_line`, `offers.business_line`, …) so the customer-facing surface still respects strict segregation and the green/amber accent.
- The admin chrome itself is neutral; a banner/offer **preview** renders in its line's accent.

> If the client prefers a per-line Sub Admin (two accounts), flip to line-scoped — artifacts already carry `business_line`, so only the RLS line filter and the toggle change. (Staff-line question, consolidated in Admin doc §2.1.)

**Shell composition:** approvals pending at Admin → active offers/banners → content drafts → referral-payout activity.

---

## 3. Screens / routes

```
/dashboard          home — pending-approval queue, live banners/offers, content drafts, referral activity

CONTENT (cross-line, line-filtered)
  /banners          create/edit banners → submit for Admin approval; track status
  /offers           offers / discounts / promotions — CRUD, schedule
  /content          website content / CMS blocks (marketing pages, blog — NFR-1.1)

REFERRALS
  /referrals        referral-bonus administration — configure bonus rules, oversee payouts (FR-9.5)

LISTINGS (real-estate)
  /listings/upload  submit a property listing for Admin approval (FR-7.3)
  /listings         my submissions + approval status

ACCOUNT
  /profile          profile, history, account management, logout
  /notifications    list, mark-read, deep-link
```

No lead, loan, commission, or user-management surfaces — none are granted to this role.

---

## 4. Status models

### 4.1 Banner lifecycle (`banners.status`)

```
draft → pending_approval → approved → live → archived
branch: rejected (with reason, back to draft)
```

Sub Admin can take a banner only as far as `pending_approval`; **`approved`/`live` is Admin's transition** (FR-12.3). Same gate applies to property submissions (Agent doc §5.1).

### 4.2 Offer lifecycle (`offers.status`)

```
draft → scheduled → active → expired/archived
```

---

## 5. Data model

New enums: `banner_type` (`default`/`personalized`/`action`), `banner_status`, `offer_status`, `content_status`.

### 5.1 `banners` — layered banner system (FR-12)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `business_line` | business_line NOT NULL | line-tag for customer-facing filter |
| `banner_type` | banner_type NOT NULL | default / personalized / action (FR-12.1) |
| `title` | TEXT | |
| `image_key` | TEXT | Spaces object key |
| `deep_link` | TEXT NULL | redirect target on click (FR-11.2) |
| `audience_rules` | JSONB | user_type / location / business_status (FR-12.2, FR-12.4) |
| `priority` | INT | tie-break when multiple match (Client doc Open C) |
| `status` | banner_status NOT NULL | §4.1 |
| `created_by_uuid` | UUID FK → users.id | the Sub Admin |
| `approved_by_uuid` | UUID NULL FK → users.id | Admin |
| `starts_at` / `ends_at` | TIMESTAMPTZ NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 5.2 `offers`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `business_line` | business_line NOT NULL | |
| `title` / `description` | TEXT | |
| `discount_type` | TEXT | percentage / flat / cashback-tie |
| `discount_value` | NUMERIC | |
| `code` | TEXT NULL | optional promo code |
| `status` | offer_status NOT NULL | §4.2 |
| `created_by_uuid` | UUID FK → users.id | |
| `starts_at` / `ends_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### 5.3 `content_blocks` — website CMS

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `slug` | TEXT UNIQUE | page/section key |
| `section` | TEXT | |
| `title` | TEXT | |
| `body` | TEXT | rich content (marketing/blog) |
| `business_line` | business_line NULL | NULL = cross-line/global content |
| `status` | content_status NOT NULL | draft / published / archived |
| `created_by_uuid` | UUID FK → users.id | |
| `updated_at` | TIMESTAMPTZ | |

### 5.4 `referral_bonus_config` — referral-bonus administration (FR-9.5)

Sub Admin administers the **bonus rules**; the `referrals` / `referral_codes` tables (Client §5.7–5.8) and payout via `transactions` (`referral_payout`) are referenced. Conversion-gating (FR-9.3) stays in the referral engine; this table only sets the amounts/rules.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `business_line` | business_line NOT NULL | |
| `bonus_amount` | NUMERIC | |
| `rule` | JSONB | conditions / caps |
| `active` | BOOLEAN | |
| `created_by_uuid` | UUID FK → users.id | |
| `updated_at` | TIMESTAMPTZ | |

### 5.5 Referenced

`property_submissions` (Agent §5.1) — Sub Admin uploads with `uploaded_by_uuid = self`, `role = sub_admin`. `referrals` / `referral_codes` / `transactions` — read for oversight; payout execution is Admin's (boundary below).

---

## 6. Key flows

1. **Home load** — pending-approval queue (own banners/listings awaiting Admin) → live banners/offers → content drafts → recent referral payouts.
2. **Create a banner** — draft → set `audience_rules` + line → submit (`pending_approval`) → Admin approves (`approved` → `live`) or rejects (reason). Goes live to customers only after Admin approval (FR-12.3).
3. **Manage offers / content** — CRUD with schedule; content publishes directly (no Admin gate unless the client wants one — Open Item A).
4. **Referral-bonus admin** — set/adjust `referral_bonus_config`; view conversion-gated payouts in `transactions`. **Does not execute payouts** (Admin/finance boundary — Open Item B).
5. **Property upload** — same `property_submissions` + Admin-approval path as the agent.

---

## 7. RLS handoff

Sub Admin is **cross-line within the content domain only**:

```sql
-- banners / offers / content_blocks / referral_bonus_config:
--   full access for sub_admin across both lines (artifacts carry business_line themselves)
USING ( current_setting('app.role') = 'sub_admin' )
WITH CHECK ( current_setting('app.role') = 'sub_admin' )
```

There is **no policy granting Sub Admin access to `leads`, `loan_applications`, `property_inquiries`, `commissions`, or full client PII** — "cannot view full lead details" (FR-2.3) is enforced by the *absence* of a grant, not just UI hiding. `property_submissions` follows the own-rows pattern (`uploaded_by_uuid = self`).

> If line-scoped is chosen instead, add `AND business_line = current_setting('app.business_line')::business_line` to the policies above.

---

## 8. Redis usage

**Nothing new.** Banner/offer reads are low-volume admin queries. (Note: customer-facing *banner serving* may later justify the selective config cache already allowed in the locked Redis scope — not introduced here.)

---

## 9. Decisions log & open items

### Locked (carried)
1. **Provisioned, no OTP** — Admin-created Sub Admin accounts (Auth §6.2).
2. **No agent create/remove; no full lead details** (FR-2.3) — enforced by absent RLS grants.
3. **Banner go-live gated on Admin approval** (FR-12.3).

### Assumed this round (flag to change)
4. **Cross-line content admin** (§2) — Sub Admin spans both lines; artifacts line-tagged. (Staff-line question — Admin doc §2.1.)
5. **Referral-bonus admin = config only**; payout execution sits with Admin/finance (§6.4).

### Still open
A. **Does website content need an Admin approval gate** like banners, or publish directly? (Banners are gated; content currently is not.)
B. **Who executes referral payouts** — Sub Admin configures, but the `transactions` write (Razorpay/cheque) is assumed Admin/finance. Confirm.
C. **Banner match precedence** (Client doc Open C) — `priority` field is included; confirm tie-break = highest priority vs most-recent.
