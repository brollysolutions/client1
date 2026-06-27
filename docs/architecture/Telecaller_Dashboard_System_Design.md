# Telecaller Dashboard — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — builds on Auth (signed off), Client, Agent, Employee (single-DB + `business_line` discriminator + RLS model).

---

## 1. Scope

This document specifies the **Telecaller** dashboard: the authenticated surface a `role = telecaller` account sees. Telecallers **follow up on leads assigned to them** — call the lead, update requirement / interest / call status, and enter loan transaction history (FR-2.5, FR-6.5). They **create no leads** (FR-4.4), run no background checks, and cannot alter contact details supplied by a lead or agent (FR-5.4).

`users`, `leads`, `loan_applications`, `property_inquiries`, `loan_txn_history` are **referenced externals** (Auth/Client). The Telecaller surface introduces one table: the manual call-activity log.

### 1.1 Telephony removed — current reality `[reflects web-only scope]`

The SRS (§5.7, FR-14/15, Appendix A masking row) describes **integrated cloud telephony** — server-side click-to-call, a bridged virtual number, automatic call logs via webhook, call recording, and number masking. **All of that is out of the current web-only scope.** Consequences for this design:

- **Telecallers dial the lead directly** on their own device — the lead's number is **shown unmasked** in the portal (you cannot call a number you cannot see, and there is no bridge to mask it).
- **No automatic call logs** (no webhook) — call outcomes are **logged manually** by the telecaller (§5.1).
- **No call recording**, no auto-disclosure consent prompt, no DLT/bridge dependency.
- The **number-masking toggle** (FR-15.1 / Appendix A `†`) is **moot** — it depended on the telephony bridge.

> These are pending **SRS/feature-list batch corrections**. This doc designs to the current reality, not the stale telephony text. WhatsApp follow-up still works via a `wa.me` deep link (existing stack), as a non-telephony channel.

---

## 2. Dashboard model — single-line adaptive shell `[line-scoping: ASSUMED — see Admin doc §2.1]`

| Account line | Surface | Accent | Loan-txn entry? |
|---|---|---|---|
| `loans` | Loan-lead follow-up | **Green** | **Yes** (FR-6.5) |
| `real_estate` | Property-lead follow-up | **Amber** | No |

Loan transaction history is loans-only; a real-estate telecaller never sees it. **Shell composition:** follow-ups due today → assigned-lead counts by status → notifications preview. No banners, referral, or commission apply.

---

## 3. Screens / routes

```
/dashboard          home — follow-ups due today, assigned-lead counts, notif preview

LEADS (both lines)
  /leads            my assigned leads — list, status, next-follow-up, last disposition
  /leads/{id}       lead detail:
                      • lead number shown (tap-to-dial on device) + wa.me link
                      • update requirement / interest / call (pick) status
                      • log a call disposition (+ optional follow-up time)
                      • [loans only] enter loan transaction history (FR-6.5)

ACCOUNT (both lines)
  /profile          profile, history, account management, logout
  /notifications    list, mark-read, deep-link redirect
```

No `/support` route — per Appendix A, the Telecaller does not raise support tickets (support is for clients, employees, agents; FR-14.1). Internal escalation is out-of-band to Admin.

---

## 4. Status models

The telecaller touches two things on a lead: its **pipeline status** and a per-attempt **call disposition**.

### 4.1 Lead pipeline (`leads.status`) — telecaller-driven portion

```
assigned → working → converted
branches: expired (FR-4.6 timer, system) · closed
```

The telecaller moves an `assigned` lead to `working` on first contact and toward `converted`. They do **not** own the FR-4.6 expiry timer (system-driven) and cannot reassign.

### 4.2 Call disposition (`lead_activities.disposition`) — per attempt

```
connected · no_answer · busy · switched_off · wrong_number
callback_requested · not_interested
```

Plus an `interest_level` (`hot` / `warm` / `cold`) captured when `connected`. Each call attempt is one `lead_activities` row — this is the manual replacement for the removed webhook call log.

---

## 5. Data model

### 5.1 `lead_activities` — manual call log (replaces telephony webhook)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `lead_uuid` | UUID NOT NULL FK → leads.id | |
| `telecaller_uuid` | UUID NOT NULL FK → users.id | the caller |
| `business_line` | business_line NOT NULL | RLS anchor |
| `disposition` | call_disposition NOT NULL | §4.2 |
| `interest_level` | interest_level NULL | set when `connected` |
| `notes` | TEXT NULL | |
| `follow_up_at` | TIMESTAMPTZ NULL | drives the "follow-ups due" list |
| `created_at` | TIMESTAMPTZ | attempt timestamp |

New enums: `call_disposition`, `interest_level`.

### 5.2 Referenced externals (telecaller's reach)

- **`leads`** — read/update where `assigned_telecaller_uuid = self`. Editable: `requirement`, `status` (within §4.1). **Not** editable: lead/agent-supplied contact (FR-5.4).
- **`loan_txn_history`** (Client §5.3) — telecaller writes rows (`entered_by_uuid = self`); loans line only (FR-6.5).
- **`loan_applications` / `property_inquiries`** — read-only context for an assigned lead.

---

## 6. Key flows

1. **Home load** — resolve `business_line` → follow-ups due (`lead_activities.follow_up_at ≤ now`, lead non-terminal) → assigned-lead counts by status → notifications.
2. **Work a lead** (`/leads/{id}`) — telecaller sees the number, taps to dial on their device → after the call, logs a `lead_activities` row (disposition + interest + optional `follow_up_at`) → updates `leads.requirement` / `status` as warranted.
3. **Enter loan transaction** (loans only) — on a progressing loan lead, telecaller adds a `loan_txn_history` row (bank, amount, rate, date) — manual entry (FR-6.5).
4. **Notifications** — list, mark-read, deep-link.

All writes are confined to the telecaller's assigned leads, their own `lead_activities`, and `loan_txn_history` they enter. Contact fields and another user's records are blocked (FR-5.4, FR-2.6 analogue) at app + RLS layers.

---

## 7. RLS handoff

```sql
-- leads: assigned to me + line
USING (
  assigned_telecaller_uuid = current_setting('app.user_uuid')::uuid
  AND business_line         = current_setting('app.business_line')::business_line
)

-- lead_activities: own + line
USING (
  telecaller_uuid = current_setting('app.user_uuid')::uuid
  AND business_line = current_setting('app.business_line')::business_line
)

-- loan_applications / property_inquiries / loan_txn_history: reachable via an assigned lead
USING (EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = lead_uuid
    AND l.assigned_telecaller_uuid = current_setting('app.user_uuid')::uuid
    AND l.business_line             = current_setting('app.business_line')::business_line
))
```

A column-level grant (or app-layer projection) makes lead/agent contact fields **read-only** to telecallers (FR-5.4); the number is visible (to dial) but not editable.

---

## 8. Redis usage

**Nothing new.** Follow-up and count queries are cheap indexed aggregates. Locked Auth Redis scope unchanged.

---

## 9. Decisions log & open items

### Locked (carried)
1. **Provisioned, no OTP** — Admin-created telecaller accounts (Auth §6.2).
2. **No lead creation** (FR-4.4); telecaller only updates assigned leads.
3. **Contact fields read-only** to telecaller (FR-5.4).

### Assumed this round (flag to change)
4. **Telephony removed** (§1.1) — number shown unmasked for manual dialling; manual `lead_activities` log replaces webhook call logs; no recording/masking. SRS §5.7 + masking text pending batch correction.
5. **Line-scoped telecaller** (§2) — single-line shell; loans telecaller also enters loan-txn history. (Staff-line question — consolidated in the Admin doc §2.1.)

### Still open
A. **Whether a telecaller may raise a field task** (e.g. request a document-collection visit) — if yes, `tasks.assigned_by_uuid` must include `telecaller`; if no, only Admin assigns (Employee doc Open Item A).
B. **Re-introducing masking** would require reinstating cloud telephony — out of current scope; note as a future option, not a base-scope item.
