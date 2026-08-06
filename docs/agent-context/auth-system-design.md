# Authentication Subsystem — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — pending sign-off on open items (Section 12)

---

## 1. Scope

This document specifies the complete authentication and account-onboarding subsystem: how each of the six roles gains access, the screens involved, the user identifier scheme, every auth flow, the data model, Redis usage, the API surface, session/JWT design, and the handoff into Row-Level Security.

Telephony removal does not affect this subsystem — OTP-over-SMS is independent of the call/recording stack that was cut.

---

## 2. Two access models

There are exactly **two ways** an account comes into existence:

| Model | Roles | OTP involved? |
|---|---|---|
| **Self-registration** (public) | Client | Yes — phone verification |
| **Claim an agent-introduced lead** (variant of self-registration) | Client | Yes — OTP to the lead's own number binds the existing lead to the new account (§6.1a) |
| **Admin-provisioned** | Sub Admin, Telecaller, Employee, Admin | No |
| **Application + approval** (hybrid) | Agent | Yes at application; account goes live only on Admin approval |

Consequence: **2Factor.in SMS spend is bounded to client registration (including lead claims), client password resets, and agent-application phone verification.** Internal staff accounts never trigger an SMS.

---

## 3. Roles → access path

| Role | How the account is created | First credential |
|---|---|---|
| **Client** | Self-registers via `/register/*`, **or** claims an agent-introduced lead by registering with that number (§6.1a) | Password they set themselves |
| **Admin** | Provisioned out-of-band at deployment | Pre-set, forced reset on first login |
| **Sub Admin** | Admin creates → shares credentials | Temp password, forced reset |
| **Telecaller** | Admin creates → shares credentials | Temp password, forced reset |
| **Employee** | Admin creates → shares credentials | Temp password, forced reset |
| **Agent** | Public application → Admin approval → credentials issued | Temp password, forced reset |

---

## 4. Screens / routes

Four unique screens. The OTP and set-password steps are shared components driven by a `purpose` param (`register` | `reset`), not duplicated.

```
PUBLIC
  /register/details        first name, last name, mobile
  /register/verify-otp     6-digit OTP entry (+ resend)
  /register/set-password   password + confirm
  /login                   single login for ALL six roles
  /forgot-password         mobile → OTP → reset (clients/agents only)

AUTHENTICATED (gate)
  /change-password         forced on first login for provisioned accounts
```

`/login` resolves the role from the credentials and redirects to the correct dashboard. **No role selector on the UI** — cleaner UX, less enumeration surface.

---

## 5. User identifier — "Customer ID" / User ID

### 5.1 Format

```
{ROLE_PREFIX}{4 base32 chars}{FIRST_NAME}

Examples:  CL7K9FJOHN   AGX4MQRAVI   TCQ8RPPRIYA
           └┘└──┘└──────┘
          prefix code  name
            2    4    rest

Parsing is position-based and unambiguous: chars 0–1 = role prefix,
chars 2–5 = base32 code, chars 6+ = first-name hint.
```

| Role | Prefix |
|---|---|
| Admin | `AD` |
| Sub Admin | `SA` |
| Agent | `AG` |
| Telecaller | `TC` |
| Employee | `EM` |
| Client | `CL` |

### 5.2 Encoding (YouTube-style, opaque)

The 4 middle characters are a **random 20-bit integer encoded in Crockford base32** — this is the only part that carries uniqueness. The trailing first-name is a **cosmetic readability hint**, not part of the uniqueness guarantee (two users named John get different base32 codes). The base32 portion is deliberately opaque: sequential IDs are guessable and leak user counts; encoded random IDs are not.

```python
import secrets, re

# Crockford base32: 32 symbols, excludes I L O U (avoids 0/O, 1/I/L confusion)
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

ROLE_PREFIX = {
    "admin": "AD", "sub_admin": "SA", "agent": "AG",
    "telecaller": "TC", "employee": "EM", "client": "CL",
}

def _encode(n: int, length: int = 4) -> str:
    out = []
    for _ in range(length):
        out.append(CROCKFORD[n & 0b11111])  # low 5 bits
        n >>= 5
    return "".join(reversed(out))

def _clean_name(name: str, cap: int = 10) -> str:
    # uppercase, strip non-alpha (handles "R. Suresh", "Abdul-Karim", spaces)
    return re.sub(r"[^A-Z]", "", name.upper())[:cap]

def generate_user_id(role: str, first_name: str) -> str:
    prefix = ROLE_PREFIX[role]
    n = secrets.randbits(20)            # 2^20 == 32^4
    return prefix + _encode(n) + _clean_name(first_name)
```

> The name hint is capped (default 10 chars) so a long name like
> "Venkataramanasubramanian" doesn't produce an unwieldy ID. The cap is
> cosmetic only — drop or raise it freely. Edge cases: a name that cleans to
> empty (all non-alpha) yields just `{prefix}{code}`, still unique.

**Collision handling:** rely on the `UNIQUE` constraint on `user_id`. On insert, catch the integrity error and regenerate — no pre-check `SELECT` (avoids a TOCTOU race).

### 5.3 Capacity at scale

```
32^4 = 1,048,576  (~1.05 million) per role prefix
```

| Client count (`CL`) | Avg. picks per insert |
|---|---|
| 10,000 | ~1.01 (≈1% retry) |
| 100,000 | ~1.10 (≈10% retry) |
| 500,000 | ~1.9 (≈48% retry) |
| ~1,000,000 | space ~95% full — impractical |

**Staff prefixes** (`AG`, `TC`, `EM`, `SA`, `AD`) will never approach this ceiling — 4 chars is ample.

**Client prefix (`CL`) caveat:** the ~1.05M ceiling sits exactly at the stated million-client target. Insert-retry climbs steeply past ~300K and saturates near 1M. If the client base is realistically in the tens of thousands, 4 chars is fine. If a million clients is a firm target, give `CL` a 5th char (32⁵ = 33.5M, ~3% retry at 1M) while keeping staff at 4 — the prefix already separates the namespaces, so per-role length costs nothing. (Decide the 5th char only if a firm million-client `CL` target is confirmed; staff prefixes never need it.)

### 5.4 When generated

| Event | Code issued |
|---|---|
| Client completes `/register/set-password` | At `users` row creation |
| Admin creates Sub Admin / Telecaller / Employee | At row creation |
| Agent application **approved** | At approval (not at application submission) |

The public `user_id` is **immutable** after creation. It is display/search only and is never used as a foreign key — all FK joins use the UUID primary key `id`. (See the naming note in Section 7 on the `user_id` name being reused for FK columns.)

---

## 6. Flows

### 6.1 Client self-registration

```
Step 1 — /register/details
  Input: first_name, last_name, mobile, line  (line ∈ loans | real_estate | both)
  Server: normalize mobile → E.164
          check users.mobile uniqueness
            ├─ taken  → "already registered"
            └─ free   → generate OTP, store HASH in Redis (TTL 5 min)
                        send via 2Factor.in → go to Step 2

Step 2 — /register/verify-otp
  Input: otp
  Server: compare to Redis hash, decrement attempt counter (max 5)
            ├─ valid   → issue registration_token (JWT, 10 min)
            │            claims: {first_name, last_name, mobile, line, purpose:register}
            │            → go to Step 3
            └─ invalid → error; allow resend (max 2, then 15-min lock)

Step 3 — /register/set-password
  Input: registration_token, password, confirm
  Server: validate token → generate user_id (CL……)
          INSERT users row (status=active, phone_verified_at=now,
                            business_line = line from token)   -- loans | real_estate | both
          issue access + refresh JWTs → client dashboard
```

The `line` choice is the client's requirement selection (FR-4.3) and sets `users.business_line`. A client may pick **both** — the account then carries `business_line = both` and can hold a loan journey and a property journey at once (records stay single-line; see §7.5). The `registration_token` is a **signed JWT, not a Redis session** — keeps Redis scope unchanged. It is mandatory: without it, a caller could POST straight to `set-password` and skip OTP entirely.

### 6.1a Claim an agent-introduced lead (variant of self-registration)

An agent-introduced lead exists as a `leads` row with `user_uuid = NULL` (no account yet). The lead gains login access — and binds to that pre-existing lead — by registering with **their own** mobile number. An agent may share an **invite link** to start the flow, but the link is onboarding + attribution only; the **OTP to the lead's own number is the gate** that authorizes the bind.

```
(Optional) Agent shares invite link
  link carries a stateless signed token: {lead_uuid, origin_agent_uuid, exp}
  NO DB row is created for the token.

Lead opens the link  (or simply goes to /register with their number)
Step 1 — /register/details (pre-filled from the token if present)
  Input: first_name, last_name, mobile   (line is ADOPTED from the lead — no picker)
  Server: normalize mobile → E.164
          look up live lead by mobile
            └─ generate OTP → send via 2Factor.in → go to Step 2

Step 2 — /register/verify-otp
  Input: otp                              ← proves the registrant owns the number
  Server: verify → issue registration_token (claims include matched lead_uuid)

Step 3 — /register/set-password
  Input: registration_token, password, confirm
  Server: generate user_id (CL……)
          INSERT users row (status=active, phone_verified_at=now,
                            business_line = lead.business_line)   -- adopted from the lead
          UPDATE leads SET user_uuid = <new uuid> WHERE id = <matched lead>   -- the bind
          issue access + refresh JWTs → client dashboard (status now visible)
```

Why this is safe: the bind keys off the **OTP-verified mobile**, not the token. A forwarded or leaked link cannot claim the lead, because the OTP is delivered to the lead's actual number, not to whoever holds the link. Registering normally with the same number performs the identical bind, so the link is an **accelerant, not load-bearing** — if it never arrives, the lead can still self-register and be bound. The partial-UNIQUE on `leads.mobile` (one live lead per number, Client §5.1) means the registration path must **find and bind** the existing lead rather than insert a duplicate. No new schema; the token is a signed JWT in the same family as `registration_token` / `reset_token`.

> If invite sends/opens ever need tracking (agent analytics, debugging "why didn't my lead link"), a small `lead_invites` table can be added later — not required for v1, consistent with the locked Redis/cost discipline.

### 6.2 Admin-provisioned accounts (Sub Admin / Telecaller / Employee)

No OTP, no SMS.

```
Admin → /admin/users/create
  Input: first_name, last_name, mobile, role, business_line
  Server: generate user_id ({PREFIX}……)
          generate temp password
          INSERT users row (status=pending_password_reset,
                            phone_verified_at=null, created_by=<admin uuid>)
          return temp credentials ONCE on screen
Admin shares credentials via WhatsApp/call (out-of-band)

First login → password verified → status forces /change-password
            → user sets own password → status=active → dashboard
```

### 6.3 Agent application + approval (hybrid)

```
Public → agent application form
  Input: first_name, last_name, mobile, business_line,
         Aadhaar, PAN, photo, address proof
         (+ RERA code if real_estate)
  (mobile OTP-verified during application)
  Mobile check at submission:
    • already an agent on this number                 → reject ("already an agent")
    • single-line client, SAME line as application    → allowed (in-place upgrade on approval)
    • single-line client, DIFFERENT line              → reject ("this number is a {line} client; an
                                                          agent in another line needs a different number")
    • 'both' client on this number                    → reject ("this number holds a multi-line client
                                                          account; use a different number for the agent
                                                          account")
    • new number                                      → allowed
  Server: INSERT agent_applications (status=pending)

Admin → /admin/agents/{id}/approve
  Resolve applicant by mobile:
    • mobile is NEW                                   → INSERT users (role=agent,
                                                          business_line = application line,
                                                          status=pending_password_reset)
    • mobile EXISTS, single-line client, SAME line    → in-place upgrade to agent (§7.5)
    • mobile EXISTS, 'both' client OR different line   → REJECT — agent identity must be a SEPARATE
                                                          account on a different mobile (§7.5, FR-3.5)
  generate user_id (AG…); notify applicant (SMS/WhatsApp)

Agent first login → forced /change-password → dashboard
```

Note: an Agent is always **single-line** (never `both`). A `both` client cannot be upgraded in place — flipping the row to one line would strand their other-line journey — so they obtain a separate, single-line agent account on a different mobile, leaving the client account intact (§7.5).

### 6.4 Login (unified, all roles)

```
/login
  Input: mobile, password
  Server:
    1. find user by mobile
    2. check status:
         soft_deleted | suspended         → reject
         pending_password_reset           → verify pwd, then force /change-password
         active                           → continue
    3. verify password_hash (argon2id / bcrypt)
         fail → INCR login_fail; 5 fails → login_lock 15 min (see 6.6)
    4. issue access + refresh JWTs
    5. resolve dashboard from role claim → redirect
```

### 6.5 Password reset (all roles — OTP-gated)

```
/forgot-password
  mobile → OTP via 2Factor.in (otp:reset:{mobile})
  verify OTP → reset_token (JWT, 10 min, purpose:reset)
  /reset-password → new password → status=active
```

Password reset is OTP-based for **every role** — the OTP goes to the account's registered mobile. (For provisioned staff the mobile was admin-entered and unverified at creation; the first OTP reset effectively verifies it.) The **support-ticket path is reserved only for the lost-mobile case** (FR-3.4 / FR-14.3): a user who can no longer receive OTPs on their registered number raises a ticket, and Admin changes the number (login support handled exclusively by Admin, FR-14.2).

### 6.6 Password policy & login validation

**Policy (enforced server-side at `set-password`, `change-password`, `reset`):**

- **Length:** 8–128 characters. (A maximum guards against denial-of-service via very long hash inputs.)
- **Composition:** must contain at least one letter and one digit; special characters allowed and encouraged. Length is weighted over complexity (NIST-aligned) — passphrases are welcome.
- **Reject:** the user's own mobile number, trivial sequences/repeats (`123456`, `aaaaaa`), and a blocklist of common passwords (`password`, `qwerty`, etc.).
- **No forced periodic rotation** — rotation is required only on suspected compromise (NIST guidance).
- **Hashing:** **argon2id** preferred (no length limit). If bcrypt is used instead, note its 72-byte effective ceiling — pre-hash with SHA-256 before bcrypt, or cap length, so long passphrases aren't silently truncated.

**Login-time validation (`POST /auth/login`):**

1. Look up user by mobile; if `login_lock:{mobile}` exists → reject with retry-after.
2. Verify the submitted password against `password_hash` using the hashing library's constant-time verify (never a manual string compare).
3. On failure → `INCR login_fail:{mobile}`; at **5** failures set `login_lock:{mobile}` (15 min). Log a `login_fail` event.
4. On success → clear `login_fail`, check `status`, issue tokens, set `last_login_at`.
5. **Generic error** on bad credentials — "invalid mobile number or password" — never reveal which field was wrong.

---

## 7. Data model

> **Naming note — `user_id` vs `user_uuid` (resolved).** In `users`, `user_id` is the **public display string** (`CL7K9FJOHN`). Foreign keys in child tables are named **`user_uuid`** and hold the UUID referencing `users.id` — this keeps the two clearly distinct. All FK joins use the UUID; the public `user_id` is never a foreign key.

### 7.1 `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | internal, FK target, never shown |
| `user_id` | TEXT **UNIQUE NOT NULL** | `CL7K9FJOHN` — display/search only |
| `previous_user_id` | TEXT NULL | prior public code retained on role upgrade (e.g. the `CL…` code kept when a client becomes an agent) — see §7.5 |
| `first_name` | TEXT NOT NULL | |
| `last_name` | TEXT NOT NULL | |
| `mobile` | TEXT **UNIQUE NOT NULL** | E.164 — enforces one-number-one-profile (FR-3.5) |
| `email` | TEXT NULL | optional (FR-3.3) |
| `password_hash` | TEXT NULL | null only during register window |
| `role` | role_enum NOT NULL | admin, sub_admin, agent, telecaller, employee, client |
| `business_line` | business_line_enum NOT NULL | `loans` / `real_estate` / `both`; `both` allowed for admin, sub_admin, and **client**; single line required for agent/telecaller/employee (CHECK). Per-record `business_line` on business tables is always single + immutable. |
| `status` | status_enum NOT NULL | active, suspended, pending_password_reset, soft_deleted |
| `phone_verified_at` | TIMESTAMPTZ NULL | null ⇒ provisioned (no OTP) |
| `last_login_at` | TIMESTAMPTZ NULL | |
| `created_by` | UUID NULL | admin who provisioned (FK → users.id) |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 7.2 `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_uuid` | UUID FK → users.id | renamed from `user_id` to avoid clash with the public `user_id` |
| `token_hash` | TEXT | store hash, never the raw token |
| `issued_at` / `expires_at` | TIMESTAMPTZ | |
| `revoked` | BOOLEAN | |
| `replaced_by` | UUID NULL | rotation lineage |
| `user_agent` / `ip` | TEXT | device binding |

### 7.3 `auth_events` (audit)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_uuid` | UUID NULL | FK → users.id; null if a failed login never resolved to a user |
| `event_type` | TEXT | register, login, login_fail, otp_send, otp_verify, reset, logout, force_reset |
| `mobile` / `ip` / `user_agent` | TEXT | |
| `success` | BOOLEAN | |
| `detail` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

### 7.4 `agent_applications`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `first_name` / `last_name` / `mobile` | | |
| `business_line` | enum | single line — never `both` (Agents are always single-line) |
| `aadhaar_ref` / `pan_ref` / `photo_ref` / `address_proof_ref` | TEXT | Spaces object keys |
| `rera_code` | TEXT NULL | required for real_estate |
| `status` | enum | pending, approved, rejected |
| `reviewed_by` / `reviewed_at` | | |
| `created_at` | TIMESTAMPTZ | |

> OTP is **never** persisted to Postgres — it lives only in Redis.

### 7.5 Client multi-line, Client → Agent transition & business-line separation

**Core principle (revised).** `mobile` is UNIQUE, so **one mobile = one account**. What that account's `business_line` may be depends on the role:

- **Clients** may be `loans`, `real_estate`, or **`both`**. A `both` client holds a loan journey *and* a property journey under one account. This does **not** weaken segregation: every *record* (lead, application, inquiry, transaction) is tagged to exactly one immutable line, and client RLS is by `user_uuid` (own records). Segregation is a guarantee about records and teams, not a cap on how many products one customer may hold.
- **Staff (Telecaller, Employee) and Agents** remain **single-line** — their `business_line` is one line and is what keeps the operational teams cleanly separated. Admin and Sub Admin are `both` (cross-line authority / content).

A client's `business_line` is set at registration (loans / real_estate / both). Whether a client may later *add* the second line from their dashboard is an open product question (Client doc Open Item D); if allowed, the only mutation permitted is single → `both` (never a switch between single lines).

**Client → Agent, same line — in-place upgrade.** A **single-line** client who becomes an agent in **that same line** is upgraded on the existing row:

| Field | Change on approval |
|---|---|
| `role` | `client` → `agent` |
| `user_id` | new `AG…` code becomes the current public id |
| `previous_user_id` | old `CL…` code retained for traceability |
| `business_line` | **unchanged** (already the account's single line) |
| `id` (UUID) | unchanged |

History never breaks — all FKs reference the immutable UUID. Schema impact: the single `previous_user_id` column.

**Client → Agent, `both` client or cross-line — separate account, different mobile.** An Agent is always single-line, so the in-place upgrade applies **only** to a single-line client matching the agent line. Two cases route to a separate account instead:

- A **`both`** client cannot be upgraded in place — flipping the row to one line would strand their other-line journey. They register a **separate, single-line agent account on a different mobile**; the existing `both` client account is left intact with both journeys.
- A **single-line** client applying as an agent in the **other** line likewise needs a separate account on a different mobile (an account's line is never switched).

This needs no new mechanism: `mobile` is UNIQUE (a second registration on the same number is rejected — "already registered, use a different number"), and an existing account's line is never flipped. The person ends up with two accounts (e.g. a `both` client on mobile A, a loans agent on mobile B), tracked independently.

**Dual identities, resolved.** Because each distinct identity uses its own mobile/account, a person can simultaneously be a client (possibly `both`) and a single-line agent — as separate accounts — with **no normalized `user_roles` table**. The single-row-per-account model holds.

**Constraints:**
- `role = 'agent'` ⇒ `business_line` is a single line, NOT NULL and never `both` (e.g. `CHECK (role <> 'agent' OR business_line IN ('loans','real_estate'))`); `business_line` is never updated after agent creation.
- Single line is likewise required for `telecaller` and `employee`; `both` is permitted only for `admin`, `sub_admin`, and `client`.

---

## 8. Redis keys

All within the previously locked Redis scope (atomic INCR+EXPIRE rate-limiting + JWT blacklist). Nothing added.

| Key | Purpose | TTL |
|---|---|---|
| `otp:register:{mobile}` | client registration OTP (hashed + verify-attempt count) | 5 min |
| `otp:reset:{mobile}` | client/agent reset OTP | 5 min |
| `otp_resend:{mobile}` | resend counter — **max 2 resends**, then lock | 15 min |
| `otp_lock:{mobile}` | OTP lockout after resend limit hit — blocks all sends | 15 min |
| `otp_rate:{mobile}` | daily OTP cap (e.g. 5/day) — INCR+EXPIRE, cost backstop | 24 h |
| `login_fail:{mobile}` | failed-login counter — **5 fails**, then lock | 15 min |
| `login_lock:{mobile}` | login lockout after fail limit hit | 15 min |
| `jwt_blacklist:{jti}` | logout revocation | = access-token remaining life |

Provisioned-account creation touches **zero** Redis keys.

### OTP resend throttle (2 resends → 15-min lock)

```python
RESEND_LIMIT = 2
LOCK_SECONDS = 15 * 60

def resend_otp(mobile, purpose):
    if redis.exists(f"otp_lock:{mobile}"):
        ttl = redis.ttl(f"otp_lock:{mobile}")
        raise TooManyRequests(f"Too many attempts. Try again in {ttl // 60} min.")

    count = redis.incr(f"otp_resend:{mobile}")
    if count == 1:
        redis.expire(f"otp_resend:{mobile}", LOCK_SECONDS)   # window starts
    if count > RESEND_LIMIT:
        redis.setex(f"otp_lock:{mobile}", LOCK_SECONDS, 1)   # lock 15 min
        redis.delete(f"otp_resend:{mobile}")
        raise TooManyRequests("Too many resends. Try again in 15 min.")

    send_otp(mobile, purpose)   # generate + store hash + dispatch via 2Factor.in
```

The initial OTP send is not a "resend" and does not count. After the initial send the user may resend twice; the third resend trips `otp_lock` and every OTP request for that mobile is refused for 15 minutes. Login lockout mirrors this: 5 failed password attempts set `login_lock` for 15 minutes.

---

## 9. API surface

```
# Client self-registration
POST /auth/register/initiate      {first_name, last_name, mobile, line}   → OTP sent
POST /auth/register/verify-otp    {mobile, otp}                     → registration_token
POST /auth/register/set-password  {registration_token, password}   → JWTs

# Unified login (all roles)
POST /auth/login                  {mobile, password}                → JWTs + role

# OTP utility
POST /auth/otp/resend             {mobile, purpose}                 → 202 (max 2 resends, then 15-min lock)

# Password reset (clients/agents — OTP gated)
POST /auth/forgot/initiate        {mobile}                          → OTP sent
POST /auth/forgot/verify          {mobile, otp}                     → reset_token
POST /auth/forgot/reset           {reset_token, new_password}       → 200

# Provisioned accounts
POST /admin/users/create          {first_name,last_name,mobile,role,business_line} → temp creds
POST /admin/agents/{id}/approve   → issues AG code + temp creds
POST /auth/change-password        {current_password, new_password}  → forced on first login

# Session
POST /auth/refresh                (refresh cookie)                  → new access JWT
POST /auth/logout                 (jti)                             → blacklist
```

---

## 10. JWT & session design

**Access token** — short-lived (15 min), sent as Bearer.
Claims: `sub` (UUID), `user_id`, `role`, `business_line`, `jti`, `exp`.

**Refresh token** — long-lived (30 days), stored as `httpOnly` + `Secure` + `SameSite=Strict` cookie. Hash persisted in `refresh_tokens`. **Rotated on every use** (old token marked revoked, `replaced_by` set). Reuse of a revoked refresh token ⇒ treat as compromise, revoke the whole chain.

**Logout** — add `jti` to `jwt_blacklist` in Redis for the access token's remaining life; revoke the refresh token row.

---

## 11. Security controls

- **OTP**: 6 digits, **hashed** in Redis (never plaintext), single-use, 5-attempt cap then invalidate.
- **Rate-limit the `initiate` endpoints** per mobile **and** per IP — this is both abuse protection and SMS-cost control.
- **Password hashing**: argon2id (preferred) or bcrypt.
- **Forced reset** on every provisioned account before dashboard access (`status=pending_password_reset`).
- **2Factor.in prerequisite**: DLT template + sender-ID registration must be completed before go-live (TRAI). Wire **Fast2SMS as failover** on send errors.
- **Enumeration tradeoff**: the SRS-mandated "already registered" message is a phone-enumeration vector that cannot be fully removed while honouring the requirement — mitigate by hard rate-limiting `initiate`.
- **Transport**: HTTPS only (Cloudflare + Nginx TLS); secure-cookie attributes as above.

---

## 12. Decisions log & remaining open items

### Resolved (locked for build)

1. **Login model** — password-primary. OTP is used for registration and password reset **only**, never at login.
2. **No OTP-login fallback.** Forgotten passwords are recovered via OTP-based reset (§6.5), not a passwordless login.
3. **Refresh-token lifetime** — 30 days (rotated on every use).
4. **User-id format** — `{prefix}{4 base32}{first_name}` (e.g. `CL7K9FJOHN`); 4 base32 chars (~1.05M per prefix) is sufficient for now; name capped at 10 chars, cosmetic.
5. **`user_id` naming** — public id stays `user_id`; child-table FK columns are named **`user_uuid`** (UUID → `users.id`). Applied throughout §7 and §13.
6. **Client → Agent** — branch on the client's lines (§7.5). A **single-line** client applying as an agent in the **same** line is upgraded **in place** (one account, `role` flips to agent, new `AG…` code, old `CL…` in `previous_user_id`, history preserved via the immutable UUID). A **`both`** client, or a single-line client applying in the **other** line, gets a **separate single-line agent account on a different mobile**, leaving the client account intact. Agents are never `both`. Schema impact: the single `previous_user_id` column.
7. **OTP resend** — 2 resends max, then 15-min lock (§8). **Login** — 5 failed attempts, then 15-min lock (§6.6).
8. **Staff/Agent business-line separation** — Telecallers, Employees, and Agents are **single-line**; their `business_line` is one immutable line. An Agent identity in a different line requires a separate account on a different mobile (§7.5). Enforced by existing `mobile` UNIQUE + single-line CHECK — **no new schema**. For `role = 'agent'`, `business_line` is a single line, NOT NULL and never `both`.
9. **Simultaneous identities** — a person can hold a client identity (possibly `both`) and a single-line agent identity at once by using **separate mobiles/accounts**. No normalized `user_roles` table is needed; the single-row-per-account model stands.
10. **Multi-line clients** — a client account may be `loans`, `real_estate`, or **`both`**, chosen at registration (§6.1, FR-4.3). Records stay single-line and immutable; client RLS is own-records only (line predicate dropped on client policies — Client doc §8). Replaces the earlier "client uses a second mobile for the second line" rule. Staff/agent segregation is unaffected.
11. **Agent-introduced lead claim** (§6.1a) — an agent shares an invite link (stateless signed token: lead + agent + expiry, no DB row); the lead registers with their own number and is bound to the pre-existing lead by **OTP to that number**. The link is onboarding + attribution only; the OTP is the security gate, so a leaked/forwarded link cannot claim the lead. Registering normally with the same number binds identically. No schema change.
12. **`business_line` enum** — explicit value set `{loans, real_estate, both}`, NOT NULL on `users` with a role CHECK: `both` for admin/sub_admin/client, single line for agent/telecaller/employee. This **closes former Open Item A** and unblocks final RLS (Admin doc §2.1).

### Still open

A. *(closed — see Resolved item 12.)* The `business_line` mapping for every role is settled: `{loans, real_estate, both}`, NOT NULL, `both` for admin/sub_admin/client and single line for agent/telecaller/employee. RLS context (`app.business_line`, §13) can now be finalised.
B. **When a client may choose `both`** — registration-only (line fixed thereafter) vs. allowing a single-line client to add the other line later from the dashboard (single → `both` only). Friendlier if add-later is allowed; affects "immutable" wording. Tracked in Client doc Open Item D.

---

## 13. RLS handoff (wiring into data segregation)

After token validation, a FastAPI dependency sets per-request Postgres session variables from the JWT claims, so Row-Level Security enforces business-line isolation at the database layer:

```sql
SET LOCAL app.user_uuid     = '<uuid>';
SET LOCAL app.role          = '<role>';
SET LOCAL app.business_line = '<loans|real_estate|both>';
```

RLS policies on business-scoped tables filter on `app.business_line` for **staff and agents** (single-line), while **client** policies filter on `app.user_uuid` (own records) and **drop the line predicate** — a `both` client owns records across both lines, and no record is ever tagged `both`, so own-records scoping is both correct and sufficient (Client doc §8). Admin policies bypass the line filter (Admin doc §7). The immutable per-record `business_line` discriminator (set at record creation) remains the segregation anchor. This is the point where auth connects to the broader single-DB + discriminator + RLS segregation design.
