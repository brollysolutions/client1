# Agent Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on the Auth subsystem (signed off) and the Client dashboard (single-DB + `business_line` discriminator + RLS segregation model).

---

## 1. Scope

This document specifies the **Agent** dashboard: the authenticated surface a `role = agent` account sees. It covers the single-line adaptive shell, screens/routes, the agent's view of the lead pipeline, property submission and approval, the commission ledger, and how agent queries wire into Row-Level Security.

It does **not** redesign auth (the agent application + approval + client→agent upgrade flow is fully specified in Auth §6.3 and §7.5) and treats tables owned by other modules — `properties`, `banks`, `loan_types` — as **referenced externals** (stubbed in the ER diagram).

Two carried-forward facts shape everything below:

- **One immutable `business_line` per agent** (Auth decisions 6/8/9). A *loans* agent and a *real-estate* agent are different accounts on different mobiles. The dashboard is therefore a **single-line adaptive shell**. (Note: the *client* dashboard is now **multi-line** — a client may hold loans, real estate, or both under one account — but **agents remain strictly single-line**; the two are no longer the same shape and should not be conflated.)
- **Agents are not clients.** Referrals are clients-only (FR-9.1) — the agent has **no referral surface**; the equivalent slot is **earnings/commission**.

---

## 2. Dashboard model — single-line adaptive shell

| Account line | Surface | Accent (locked palette) | Property upload? |
|---|---|---|---|
| `loans` | Loan-lead workspace | **Green** | No |
| `real_estate` | Property-lead workspace + listing submission | **Amber** | **Yes** (FR-7.3) |

Green and amber never co-occur on a working screen (locked rule). Property submission is a **real-estate-agent-only** screen — a loans agent never sees it. RLS filters every query to the agent's `business_line`, so cross-line data is structurally unreachable.

**Shell composition (every line):** layered banner stack (default / personalized / **agent-incentive**, FR-12.2) → lead funnel summary → commission summary → notifications preview.

> Note: the agent's personalized banner shows *their own benefits and incentives* (FR-12.2), not customer offers.

---

## 3. Screens / routes

```
/dashboard                  home (banners + lead funnel + commission summary + notif preview)

LEADS (both lines)
  /leads                    my introduced leads — list, status, expiry countdown
  /leads/new                introduce a lead → creates lead, auto-assigns a telecaller (FR-4.2)
  /leads/{id}               lead detail + update own-supplied fields; unmasked number (FR-5.4);
                            coarse journey milestones (read-only)

REAL-ESTATE line only
  /listings/upload          submit a property listing for Admin approval (FR-7.3)
  /listings                 my submissions + approval status (pending / approved / rejected + reason)

EARNINGS (both lines)
  /earnings                 commission ledger — per-deal rows + payout status, with totals

ACCOUNT (both lines)
  /registration             my agent application + RERA/KYC status (read-only post-approval)
  /profile                  profile, history, account management, logout
  /notifications            list, mark-read, deep-link redirect (FR-11.2)
  /support                  raise ticket (forgot-pwd / OTP / lost-mobile / general)
```

Line-specific routes are gated by the `business_line` JWT claim; a loans agent hitting `/listings/upload` 404s before any query runs.

---

## 4. What the agent sees of a lead

Two status axes, deliberately separated:

- **Lead-ownership axis** (`leads.status`) — `new / assigned / working / converted / expired / closed`, plus the FR-4.6 `expiry_at` timer. **Shown to the agent** (they own the lead and need the countdown).
- **Journey axis** (`loan_applications.status` / `property_inquiries.status`) — the internal work pipeline. **Shown to the agent as coarse milestones only**, *not* the verbatim internal pipeline the client sees.

### 4.1 Coarse milestone mapping `[ASSUMED — flag to change]`

The agent does **not** need internal operational states (`docs_collected`, `submitted_to_bank`, etc.). The full pipeline is collapsed:

| Loans (`loan_applications.status`) | Agent milestone |
|---|---|
| `new`, `assigned`, `contacted` | **In progress** |
| `docs_collected`, `submitted_to_bank` | **Under review** |
| `sanctioned`, `disbursed` | **Sanctioned** |
| `closed` | **Converted** |
| `rejected`, `on_hold` | **Closed (not converted)** / **On hold** |

| Real estate (`property_inquiries.status`) | Agent milestone |
|---|---|
| `inquiry`, `visit_scheduled`, `visited` | **In progress** |
| `in_discussion` | **In discussion** |
| `closed_won` | **Converted** |
| `closed_lost`, `cancelled` | **Closed (not converted)** |

> If the client prefers the agent to see the **full verbatim pipeline** (parity with the client view) or **lead-status only**, this mapping is the single point to change — schema is unaffected either way (it's a presentation collapse over the same `status` columns).

### 4.2 Expiry countdown (FR-4.6) `[ASSUMED — flag to change]`

`/leads` surfaces a countdown derived from `leads.expiry_at` for agent-introduced leads in non-terminal status. On expiry the lead flips to `expired` and leaves the agent's active pool, but is **retained in the agent's history** (greyed, labelled "Expired — returned to pool"). The duration itself is the operational number still open from the Client doc (Open Item A).

---

## 5. Data model

Conventions inherited from Auth/Client: child FK columns are named **`user_uuid`** (UUID → `users.id`); every business-scoped table carries `business_line` for RLS; the public `user_id` string is display-only and never a FK.

**Referenced externals (not redefined here):** `users`, `agent_applications` (Auth §7.1/§7.4), `leads`, `loan_applications`, `property_inquiries` (Client §5), `properties` / `banks` / `loan_types` (owning modules), `transactions` (Client §5.6 — extended below).

New enums: `submission_status`, `commission_status`. Reused: `business_line`, `txn_method`.

### 5.1 `property_submissions` — agent-uploaded listings (FR-7.3)

The agent uploads a candidate listing; it becomes a live `properties` row **only after Admin approval** (the checkpoint that also confirms RERA registration, SRS 5.6). This table is the agent-owned submission/approval record; `properties` stays owned by the RE module.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `uploaded_by_uuid` | UUID NOT NULL FK → users.id | the submitting agent (or Sub Admin / client) |
| `business_line` | business_line NOT NULL | constant `real_estate` (RLS uniformity) |
| `property_uuid` | UUID NULL FK → properties.id | set on approval, links to the published listing |
| `title` | TEXT | |
| `details` | JSONB | listing payload (location, price, specs, media keys) |
| `rera_number` | TEXT NULL | captured at upload; verified at approval (SRS 5.6) |
| `status` | submission_status NOT NULL | `pending` → `approved` / `rejected` |
| `rejection_reason` | TEXT NULL | surfaced to the uploader on `rejected` |
| `reviewed_by_uuid` | UUID NULL FK → users.id | Admin who actioned it |
| `reviewed_at` | TIMESTAMPTZ NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

> Upload is permitted to Sub Admin, Agents, and Clients (FR-7.3); `uploaded_by_uuid` + `role` distinguishes the source. The agent dashboard simply filters to its own rows.

### 5.2 `commissions` — per-deal ledger (FR-8.x) `[earnings detail: ASSUMED — flag to change]`

No fixed rate; the negotiated amount is **entered manually by Admin** per agent, per deal (FR-8.1/8.2). One row per converted deal that earns the agent commission.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `agent_user_uuid` | UUID NOT NULL FK → users.id | the earning agent |
| `business_line` | business_line NOT NULL | |
| `lead_uuid` | UUID NOT NULL FK → leads.id | the converted lead |
| `loan_application_uuid` | UUID NULL FK → loan_applications.id | source deal (loans line) |
| `property_inquiry_uuid` | UUID NULL FK → property_inquiries.id | source deal (RE line) |
| `agreed_amount` | NUMERIC NOT NULL | INR; manually entered |
| `status` | commission_status NOT NULL | `pending` → `approved` → `paid` (+ `cancelled`) |
| `method` | txn_method NULL | `razorpay` \| `cheque` (FR-8.3); set at payout |
| `payout_txn_uuid` | UUID NULL FK → transactions.id | links to the disbursement row when paid |
| `entered_by_uuid` | UUID NOT NULL FK → users.id | Admin (entry restricted + logged, SRS 5.5) |
| `notes` | TEXT NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

*Constraint:* exactly one of `loan_application_uuid` / `property_inquiry_uuid` is non-null, and it must match `business_line`
(`CHECK ((loan_application_uuid IS NOT NULL) <> (property_inquiry_uuid IS NOT NULL))`).

**Agent-visible** on `/earnings`: the per-deal rows (deal reference, `agreed_amount`, `status`, `method`) plus running totals (earned / pending / paid). Tax handling (GST/TDS) is out of functional scope (SRS 5.5, CA sign-off).

### 5.3 `transactions` — extension (cross-module note)

The unified ledger (Client §5.6) gains a third `txn_type` value: **`commission_payout`** (alongside `cashback`, `referral_payout`). A paid commission writes one `transactions` row (`type = commission_payout`, `user_uuid = agent`) and back-links via `commissions.payout_txn_uuid` — mirroring how `referrals.reward_txn_uuid` works. **No change to client RLS**: clients still read only their own rows; agents read only theirs.

---

## 6. Key flows

1. **Home load** — resolve `business_line` from JWT → banner stack (default / personalized-incentive / action) → lead funnel counts (`new / working / converted / expired`) → commission summary (earned / pending / paid) → 5 latest notifications.
2. **Introduce a lead** (`/leads/new`) — agent submits name + mobile + requirement → dedupe check (FR-4.5: `mobile` already on a live lead → "already registered", not assignable) → INSERT `leads` (`origin = agent`, `origin_agent_uuid = self`, `status = new`, `expiry_at` set) → auto-assign a telecaller (FR-4.2).
3. **Track / update a lead** (`/leads/{id}`) — agent sees the unmasked number (FR-5.4), edits only fields they supplied (FR-2.8), and views the coarse milestone (§4.1) + expiry countdown (§4.2). Telecaller/Employee-owned updates are read-only to the agent.
4. **Submit a listing** (`/listings/upload`, RE only) — INSERT `property_submissions` (`status = pending`) → appears in `/listings` as pending → Admin approves (creates/links `properties`, sets `property_uuid`) or rejects (with `rejection_reason`).
5. **Earnings** (`/earnings`) — read-only ledger of own `commissions` rows + totals; `paid` rows deep-link to the `transactions` payout.
6. **Registration status** (`/registration`) — read-only view of the agent's `agent_applications` row (KYC + RERA code + approval state).
7. **Notifications / Support** — standard; login/OTP/lost-mobile tickets auto-route to Admin (FR-14.2).

---

## 7. Redis usage

**Nothing new.** No agent flow needs caching or rate-limiting beyond what Auth already locked (OTP rate-limit + JWT blacklist). Lead-funnel and commission summaries are cheap indexed aggregates, consistent with the cost-discipline principle.

---

## 8. RLS handoff

After token validation the FastAPI dependency sets the session context (Auth §13):

```sql
SET LOCAL app.user_uuid     = '<uuid>';
SET LOCAL app.role          = '<role>';
SET LOCAL app.business_line = '<loans|real_estate>';
```

Agent RLS differs from the client's in one key way: an agent's reach is **`origin_agent_uuid`**, not `user_uuid` (the lead's `user_uuid` is the *borrower/buyer*, not the agent).

```sql
-- leads: agent reads leads they introduced, in their line
USING (
  origin_agent_uuid = current_setting('app.user_uuid')::uuid
  AND business_line  = current_setting('app.business_line')::business_line
)

-- loan_applications / property_inquiries: reachable via the owning lead
USING (EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = lead_uuid
    AND l.origin_agent_uuid = current_setting('app.user_uuid')::uuid
    AND l.business_line      = current_setting('app.business_line')::business_line
))

-- commissions: own rows + line
USING (
  agent_user_uuid = current_setting('app.user_uuid')::uuid
  AND business_line = current_setting('app.business_line')::business_line
)

-- property_submissions: own uploads + line
USING (
  uploaded_by_uuid = current_setting('app.user_uuid')::uuid
  AND business_line = current_setting('app.business_line')::business_line
)
```

Because `business_line` is immutable and the agent's reach is their own `origin_agent_uuid` / `agent_user_uuid`, an agent physically cannot read another agent's leads, commissions, or any cross-line data — enforced at the database layer.

> Loan/property journey rows are exposed to the agent **read-only and collapsed** (§4.1): RLS grants row visibility; the API projects only the milestone, never the internal `status_reason` / actor / notes.

---

## 9. Decisions log & open items

### Locked (carried from Auth / Client)
1. **Single-line adaptive shell** — one immutable `business_line` per agent; loans (green) or real-estate (amber), never both; cross-line agency = separate account/mobile (Auth 8/9).
2. **No referral surface for agents** (FR-9.1) — earnings/commission occupies that slot.
3. **Agent reach = `origin_agent_uuid`**, never transferred (FR-4.6); leads expire to an open pool, not reassigned.
4. **KYC/RERA captured at application** (`agent_applications`) — dashboard shows it read-only post-approval.
5. **Unified ledger** — commission payouts reuse `transactions` via a new `commission_payout` type; no separate payout table.

### Assumed this round (flag to change — cheap to flip)
6. **Lead progress → coarse milestones** (§4.1), not the client's verbatim pipeline. *Most worth confirming.* Presentation-only; schema unaffected.
7. **Earnings → per-deal ledger + payout status** (§5.2), not totals-only.
8. **Expiry → countdown shown, expired kept in history** (§4.2).

### Still open
A. **Lead-expiry duration (FR-4.6)** — same operational number open in the Client doc; drives the §4.2 countdown.
B. **Can an agent edit a lead's *requirement* after a telecaller starts working it,** or only before assignment? (FR-2.8 says agent edits own-supplied fields; the cutoff vs. telecaller ownership needs a rule.)
C. **`property_submissions` media limits** — reuse the FR-13 upload caps; confirm per-listing image/video ceilings.
D. **Sub Admin / Client uploads** share `property_submissions` — confirm whether their approval flow is identical to the agent's or needs role-specific routing.
