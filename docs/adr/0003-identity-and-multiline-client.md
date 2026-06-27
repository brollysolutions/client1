# ADR-0003: Identity scheme, one-number-one-account, and multi-line clients

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Project Lead, Development Team
- **Source:** Auth system design §5, §7.5; SRS §5.8 (D-3), §5.9

## Context

A person may hold multiple relationships with the platform (client, agent). The SRS requires a
unique customer ID per mobile and strict team segregation, while letting a client hold both a loan
and a property journey.

## Decision

- **Identity:** `users.mobile` is UNIQUE → **one mobile = one account**. Public `user_id`
  (`{ROLE_PREFIX}{4 base32}{first_name}`, e.g. `CL7K9FJOHN`) is display/search only and **never a
  foreign key**; all FKs use the UUID `id`.
- **Multi-line client:** a client account may be `loans`, `real_estate`, or `both`, chosen at
  registration. Per-record `business_line` stays single + immutable; a `both` client just holds two
  isolated journeys under one login.
- **Staff/Agents single-line:** Telecaller, Employee, Agent each have one immutable line.
- **Client → Agent:** single-line client applying in the **same** line is upgraded in place (role
  flips, new `AG…` id, old `CL…` kept in `previous_user_id`, UUID unchanged). A `both` client, or a
  cross-line application, requires a **separate agent account on a different mobile**. Agents are
  never `both`. No `user_roles` table.
- **Agent-introduced lead claim:** lead created with `user_uuid` NULL; an invite link (stateless
  signed token) is onboarding/attribution only — the **OTP to the lead's own number** is the gate
  that binds the lead to the new account.

## Consequences

- No normalized multi-role table; the single-row-per-account model holds.
- A leaked/forwarded invite link cannot claim a lead (OTP goes to the number).
- Adds a single `previous_user_id` column for role-upgrade traceability.

## Alternatives considered

- **Normalized `user_roles` (many roles per person)** — flexible but heavier; unnecessary given
  one-mobile-one-account + separate-mobile-for-agent. Rejected.
- **Second mobile required for a second client line** — earlier rule; replaced by `both`.
