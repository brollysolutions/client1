# Authentication Subsystem — System Design

**Loans & Real Estate Platform**
Web-only · FastAPI + Next.js · PostgreSQL + Redis
Status: Design — signed off for MVP build, v1.4 profile-based line segregation

---

## 1. Scope

This document specifies the complete authentication and account-onboarding subsystem: how login identities are created, how line-specific client/staff/agent profiles are attached, the screens involved, identifier schemes, every auth flow, the data model, Redis usage, the API surface, session/JWT design, and the handoff into Row-Level Security.

Telephony removal does not affect this subsystem — OTP-over-SMS is independent of the call/recording stack that was cut.

---

## v1.4 Final Database Segregation Decision

The database no longer uses `business_line = both`. The final schema separates **login identity** from **business-line participation**:

- `auth_users` stores login identity only: mobile number, password hash, verification state, account status, and audit/security fields.
- `client_profiles` stores one row per client per business line. A person who uses Loans and Real Estate has two rows under the same `auth_user_uuid`: one `loans`, one `real_estate`.
- `agent_profiles` stores one row per approved agent per business line. Agent capability is line-specific and never `both`.
- `staff_profiles` stores Telecaller/Employee/Sub Admin/Admin capability and scope. Telecaller and Employee rows are single-line; Admin and Sub Admin are platform-scoped but do not use a `both` enum value.
- All business records keep a single immutable `business_line` value: `loans` or `real_estate` only.

This gives the client the required separation: Loans and Real Estate remain separately reportable, separately permissioned, and separately routed, while the user can still log in with one mobile number.

## 2. Account and profile creation models

There is one login identity model and multiple profile models:

| Model | Creates | OTP involved? |
|---|---|---|
| **Login identity** | `auth_users` row with mobile/password | Yes for public clients/agents; no for provisioned staff |
| **Client self-registration** | one or two `client_profiles` rows | Yes — phone verification |
| **Claim an agent-introduced lead** | missing `auth_users` + correct `client_profiles` row, then binds lead | Yes — OTP to the lead's own number |
| **Admin-provisioned staff** | `auth_users` + `staff_profiles` | No SMS OTP |
| **Agent application + approval** | `agent_applications` → `agent_profiles` | Yes at application; account/profile goes live only on Admin approval |

Consequence: **2Factor.in SMS spend is bounded to public registration/claim flows, password resets, and agent-application phone verification.** Internal staff accounts never trigger an SMS.
## 3. Roles → access path

| Role/capability | How it is created | Stored in | First credential |
|---|---|---|---|
| **Client** | Self-registers, or claims an agent-introduced lead | `auth_users` + `client_profiles` | Password they set themselves |
| **Admin** | Provisioned out-of-band at deployment | `auth_users` + platform `staff_profiles` | Pre-set, forced reset |
| **Sub Admin** | Admin creates → shares credentials | `auth_users` + platform `staff_profiles` | Temp password, forced reset |
| **Telecaller** | Admin creates → shares credentials | `auth_users` + line-specific `staff_profiles` | Temp password, forced reset |
| **Employee** | Admin creates → shares credentials | `auth_users` + line-specific `staff_profiles` | Temp password, forced reset |
| **Agent** | Public application → Admin approval | `auth_users` + line-specific `agent_profiles` | Temp password or password set after approval |

A single `auth_users` row can have multiple profile rows, but each profile row is line-specific except platform Admin/Sub Admin profiles.
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

## 5. Identifier scheme — login identity vs profile codes

The public identifier is no longer treated as one universal `users.user_id`. In v1.4, identifiers live at the correct level:

| Identifier | Table | Purpose | Line-specific? |
|---|---|---|---|
| `auth_users.id` | `auth_users` | internal login UUID | no |
| `client_profiles.customer_code` | `client_profiles` | customer-facing profile ID | yes |
| `agent_profiles.agent_code` | `agent_profiles` | agent-facing code | yes |
| `staff_profiles.staff_code` | `staff_profiles` | staff/admin display/search code | depends on scope |

### 5.1 Format

Recommended profile-code format:

```text
{PREFIX}{4-5 base32 chars}{FIRST_NAME}

Examples:
  CL-LN7K9FJOHN     Loan client profile
  CL-RE8Q2MJOHN     Real Estate client profile
  AG-LNX4MQRAVI     Loan agent profile
  AG-RE2W8RPRIYA    Real Estate agent profile
  TC-LNQ8RPPRIYA    Loan telecaller profile
```

The code is display/search only and is never used as a foreign key. All joins use UUID primary keys.

### 5.2 Encoding

The random middle portion uses Crockford base32, generated with `secrets.randbits`. Collision handling relies on a UNIQUE constraint on the code column; on insert collision, regenerate and retry.

### 5.3 Capacity

Use 5 base32 chars for client profile codes if a million-profile target is realistic. Staff and agent codes can remain 4 characters unless the client expects very large staff/agent counts.

### 5.4 When generated

| Event | Code issued |
|---|---|
| Client creates a Loan profile | `client_profiles.customer_code` with Loan prefix |
| Client creates a Real Estate profile | `client_profiles.customer_code` with Real Estate prefix |
| Admin creates staff | `staff_profiles.staff_code` |
| Agent application approved | `agent_profiles.agent_code` |

Codes are immutable once issued. A Client → Agent conversion does not rewrite the client profile; it creates an additional `agent_profiles` row.
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
  Input: first_name, last_name, mobile, selected_lines[]
         selected_lines ⊆ {loans, real_estate}; may contain one or both
  Server: normalize mobile → E.164
          check auth_users.mobile
            ├─ no auth user → generate OTP, store hash in Redis, send SMS
            └─ existing auth user → go to add-line flow after login/OTP verification

Step 2 — /register/verify-otp
  Input: otp
  Server: compare to Redis hash, decrement attempt counter
            ├─ valid   → issue registration_token claims:
            │            {first_name, last_name, mobile, selected_lines, purpose:register}
            └─ invalid → error; allow resend limits

Step 3 — /register/set-password
  Input: registration_token, password, confirm
  Server: INSERT auth_users row
          FOR EACH selected line:
             INSERT client_profiles(auth_user_uuid, business_line, customer_code)
             create line-specific lead/application/inquiry shell as required
          issue access + refresh JWTs → client dashboard
```

No row receives `business_line = both`. Selecting both creates two rows in `client_profiles` under one login identity.
### 6.1a Claim an agent-introduced lead (variant of self-registration)

An agent-introduced lead exists as a `leads` row with `client_profile_uuid = NULL`. The lead gains login access by registering with the lead's own mobile number. An agent may share an invite link, but OTP to the lead's own number is the authorization gate.

```
(Optional) Agent shares invite link
  signed token: {lead_uuid, origin_agent_profile_uuid, exp}
  no DB row required for the token

Lead opens link or registers normally with the same number
Step 1 — /register/details
  Server: find live lead by mobile + business_line
          generate OTP → send SMS

Step 2 — /register/verify-otp
  Server: OTP proves ownership of the lead's phone number
          issue registration_token with matched lead_uuid + business_line

Step 3 — /register/set-password
  Server: create auth_users if missing
          create/find client_profiles(auth_user_uuid, lead.business_line)
          UPDATE leads SET client_profile_uuid = <profile id>
          issue tokens → client dashboard
```

A leaked link cannot claim a lead because the OTP goes to the lead's real number. Registering normally with the same number performs the same bind.
### 6.2 Admin-provisioned accounts (Admin / Sub Admin / Telecaller / Employee)

No OTP, no SMS.

```
Admin → /admin/users/create
  Input: first_name, last_name, mobile, role, scope/business_line
  Server: create auth_users row if the mobile is new
          generate temp password
          INSERT staff_profiles:
             Admin/Sub Admin → platform scope
             Telecaller/Employee → single business_line only
          return temp credentials once on screen

First login → password verified → forced /change-password → dashboard
```

Telecaller and Employee profiles must be line-specific. Admin/Sub Admin are platform-scoped; this does not introduce a `both` business-line value.
### 6.3 Agent application + approval (hybrid)

```
Public → agent application form
  Input: first_name, last_name, mobile, business_line,
         Aadhaar, PAN, photo, address proof,
         RERA code if real_estate
  Server: OTP-verify mobile during application
          INSERT agent_applications(status=pending)

Admin → /admin/agents/{id}/approve
  Server: create/find auth_users by mobile
          create agent_profiles(auth_user_uuid, business_line, agent_code,
                                application_uuid, converted_from_client flag)
          do not rewrite existing client_profiles
          notify applicant

Agent first login → forced /change-password if provisioned → agent dashboard
```

An Agent profile is always line-specific. A person may have one Loan agent profile and/or one Real Estate agent profile only if the business approves that explicitly, but each is a separate row. There is no agent `both` value.
### 6.4 Login (unified, all roles)

```
/login
  Input: mobile, password
  Server:
    1. find auth_user by mobile
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

New/central enums: `business_line` (`loans`, `real_estate` only), `profile_scope` (`platform`, `line`), `staff_role`, `profile_status`.

### 7.1 `auth_users` — login identity only

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | internal identity UUID |
| `first_name` / `last_name` | TEXT | profile/account holder |
| `mobile` | TEXT UNIQUE NOT NULL | E.164; one login per mobile |
| `email` | TEXT NULL | optional |
| `password_hash` | TEXT | null only during registration window |
| `status` | status_enum | active / suspended / pending_password_reset / soft_deleted |
| `phone_verified_at` | TIMESTAMPTZ NULL | null for provisioned staff until first verification if required |
| `last_login_at` | TIMESTAMPTZ | |
| `created_by_uuid` | UUID NULL FK → auth_users.id | Admin provisioning |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

No `business_line` column exists here.

### 7.2 `client_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | line-specific customer profile |
| `auth_user_uuid` | UUID FK → auth_users.id | owner login identity |
| `business_line` | business_line NOT NULL | `loans` or `real_estate` only |
| `customer_code` | TEXT UNIQUE | customer-facing ID |
| `status` | profile_status | active/suspended/soft_deleted |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Constraint: `UNIQUE (auth_user_uuid, business_line)`.

### 7.3 `staff_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | staff/admin capability row |
| `auth_user_uuid` | UUID FK → auth_users.id | login identity |
| `role` | staff_role | admin/sub_admin/telecaller/employee |
| `scope` | profile_scope | platform for Admin/Sub Admin, line for Telecaller/Employee |
| `business_line` | business_line NULL | required when `scope = line`; null when platform scope |
| `staff_code` | TEXT UNIQUE | display/search code |
| `status` | profile_status | active/suspended |
| `created_by_uuid` | UUID FK → auth_users.id | Admin |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 7.4 `agent_applications`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `applicant_auth_user_uuid` | UUID NULL FK → auth_users.id | set when mobile already has login |
| `first_name` / `last_name` / `mobile` | TEXT | application snapshot |
| `business_line` | business_line NOT NULL | `loans` or `real_estate` only |
| `aadhaar_ref` / `pan_ref` / `photo_ref` / `address_proof_ref` | TEXT | KYC references |
| `rera_code` | TEXT NULL | required for real_estate |
| `status` | submission_status | pending/approved/rejected |
| `reviewed_by_profile_uuid` | UUID FK → staff_profiles.id | Admin profile |
| `reviewed_at` / `created_at` | TIMESTAMPTZ | |

### 7.5 `agent_profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | line-specific agent capability |
| `auth_user_uuid` | UUID FK → auth_users.id | login identity |
| `agent_code` | TEXT UNIQUE | AG display/search code |
| `business_line` | business_line NOT NULL | `loans` or `real_estate` only |
| `application_uuid` | UUID FK → agent_applications.id | approval source |
| `converted_from_client` | BOOLEAN | true when same login already had a client profile |
| `approved_by_profile_uuid` | UUID FK → staff_profiles.id | Admin profile |
| `kyc_status` | TEXT | pending/verified/rejected |
| `rera_code` | TEXT NULL | required for real_estate |
| `status` | profile_status | active/suspended |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### 7.6 `refresh_tokens`

References `auth_users.id` as `auth_user_uuid`. Refresh token rotation and revocation are unchanged.

### 7.7 `auth_events`

References `auth_users.id` when known; otherwise stores mobile/IP/user-agent for unresolved attempts.

### 7.8 Client multi-line and Client → Agent transition

- Multi-line client = multiple `client_profiles` rows under one `auth_user`.
- Client → Agent = add one `agent_profiles` row; never rewrite or delete the client profile.
- All business tables reference the correct profile UUID (`client_profile_uuid`, `agent_profile_uuid`, or `staff_profile_uuid`) plus a single `business_line`.
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

Recommended claims:

```json
{
  "sub": "auth_user_uuid",
  "roles": ["client", "agent", "telecaller"],
  "client_profile_ids": ["..."],
  "agent_profile_ids": ["..."],
  "staff_profile_ids": ["..."],
  "jti": "...",
  "exp": "..."
}
```

The active profile and line are chosen per request or route guard, not permanently stored as `both` in the token.

**Refresh token** — long-lived (30 days), stored as `httpOnly` + `Secure` + `SameSite=Strict` cookie. Hash persisted in `refresh_tokens`. Rotated on every use.

**Logout** — add `jti` to `jwt_blacklist` in Redis for the access token's remaining life; revoke the refresh token row.
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

1. **Login model** — password-primary. OTP is used for registration, lead claim, agent application verification, and password reset only.
2. **Identity/profile split** — `auth_users` stores mobile/password login only; line-specific access lives in `client_profiles`, `agent_profiles`, and `staff_profiles`.
3. **No `business_line = both`** — business-line enum contains only `loans` and `real_estate`.
4. **Multi-line clients** — one `auth_user`, two `client_profiles` rows.
5. **Client → Agent** — keep client profile immutable; create `agent_profiles` row linked to the same `auth_user`.
6. **Agent-introduced lead claim** — lead binds to the correct `client_profile_uuid` by OTP-verified mobile.
7. **Agent-owned lead expiry removed** — no automatic open-pool release; Admin manual release only under exception.
8. **Staff profile scoping** — Telecaller and Employee are line-specific; Admin/Sub Admin are platform-scoped.
9. **Referral payout execution** — Admin executes payout; Sub Admin manages content/rules only.
10. **Employee task creation** — Admin creates Employee tasks for MVP.
11. **Document verification** — Employee collects; Admin verifies completeness; bank verifies final loan acceptance/sanction.
12. **Refresh-token lifetime** — 30 days, rotated on every use.
13. **OTP resend** — 2 resends max, then 15-minute lock.

### Still open

A. **Rejected-status reason wording** — confirm whether bank rejection reasons are shown verbatim or softened.
B. **Banner precedence** — confirm priority rule when multiple personalized banners match.
## 13. RLS handoff (wiring into data segregation)

After token validation, a FastAPI dependency sets identity context and the active profile context for the current request:

```sql
SET LOCAL app.auth_user_uuid      = '<uuid>';
SET LOCAL app.role                = '<role>';
SET LOCAL app.client_profile_uuid = '<uuid|null>';
SET LOCAL app.agent_profile_uuid  = '<uuid|null>';
SET LOCAL app.staff_profile_uuid  = '<uuid|null>';
SET LOCAL app.business_line       = '<loans|real_estate|null>';
SET LOCAL app.platform_scope      = '<true|false>';
```

Policies:

- Client tables filter by `client_profile_uuid` and `business_line`.
- Agent tables filter by `agent_profile_uuid` and `business_line`.
- Telecaller/Employee tables filter by `staff_profile_uuid` and `business_line`.
- Admin/Sub Admin platform-scope policies use `platform_scope = true`; Admin may bypass line filters, while Sub Admin still acts only on allowed content/marketing tables.

This is the final v1.4 segregation model: one login identity, separate line-specific profile rows, and no `both` database value.
