# Current implementation state and decision register

Status: **Derived reconciliation and later product amendment**

As of: **2026-08-07**

Code baseline: `7943d1c` ([PR #148](https://github.com/brollysolutions/client1/pull/148))

## 1. Purpose and authority

This document records the behavior already implemented in the repository and
the later direction to preserve that work. It is derived from current code,
tests, migrations, recent history, the supplied documents in this directory,
and the explicit 2026-08-06 decision to keep completed behavior unchanged.

The supplied SRS and feature list remain the original product baseline. This
register supersedes them only for the specific conflicts identified below. It
does not silently rewrite the supplied source documents. `SECURITY.md`, current
authorization/RLS enforcement, migrations, and later explicit user decisions
continue to govern implementation details.

This is not a claim that every SRS feature is complete. Section 4 separates
genuine open work from document items that the implementation has already
settled.

## 2. Accepted later decisions

### CS-001 — self-registered clients receive both business lines

Every ordinary self-registration creates one authentication user and two
client profiles: one for `loans` and one for `real_estate`. Registration has no
business-line picker, and a dual-line client receives `business_line=both` in
the access-token claims.

This supersedes the SRS and feature-list wording that says a customer selects
Loans, Real Estate, or Both during registration. Because both profiles exist at
account creation, the advisory question about adding a second line later is no
longer applicable to self-registered clients.

Evidence:

- [`apps/api/app/schemas/auth.py`](../../apps/api/app/schemas/auth.py)
- [`apps/api/app/services/auth_service.py`](../../apps/api/app/services/auth_service.py)
- [`apps/api/app/tests/auth/test_register.py`](../../apps/api/app/tests/auth/test_register.py)
- [`apps/web/lib/auth.ts`](../../apps/web/lib/auth.ts)

Compatibility requirement: client-owned RLS remains owner-scoped while every
business record retains one immutable line. Staff and Agent isolation must not
be weakened to implement the dual-line client experience.

### CS-002 — both lines use the established blue visual system

Loans and Real Estate use the same blue dashboard accent. The active line is
communicated by labels, routes, and content rather than by green/amber chrome.

This supersedes the SRS and advisory dashboard-design passages that require a
green Loans surface and amber Real Estate surface. It does not change
business-line authorization or record segregation.

Evidence:

- [`apps/web/app/globals.css`](../../apps/web/app/globals.css)
- [`apps/web/features/dashboard/line-switcher.tsx`](../../apps/web/features/dashboard/line-switcher.tsx)
- [`apps/web/features/dashboard/app-sidebar.tsx`](../../apps/web/features/dashboard/app-sidebar.tsx)
- commit `e2ebece` (`feat(web): blue-only dashboard accent + seamless header + Repeat2 line switch`)

### CS-003 — profile-based identity and scope model is canonical

The current schema does not store every role and line decision directly on a
single conceptual `users` row. It uses one authentication user plus
`client_profiles`, `staff_profiles`, and `agent_profiles`:

- self-registered clients normally hold one profile per line;
- Agents, Telecallers, and Employees are line-scoped;
- Sub Admin is platform-scoped, with artifacts carrying their own line;
- platform Admin authorization requires both the Admin role and platform scope;
- request dependencies install trusted profile and scope context for RLS.

Evidence:

- [`apps/api/app/models/profile.py`](../../apps/api/app/models/profile.py)
- [`apps/api/app/core/deps.py`](../../apps/api/app/core/deps.py)
- [`apps/api/app/services/auth_service.py`](../../apps/api/app/services/auth_service.py)
- [`apps/api/app/services/admin.py`](../../apps/api/app/services/admin.py)
- [`apps/api/alembic/versions/a0b1c2d3e4f5_rls_scope_platform_bypass_to_admin.py`](../../apps/api/alembic/versions/a0b1c2d3e4f5_rls_scope_platform_bypass_to_admin.py)

Conceptual unified-user tables in the supplied designs and ERD are advisory;
they must not drive an identity or RLS migration without a separate approved
design and security review.

### CS-004 — managed property media uses private review and Admin-only approval

Authenticated Clients/Leads, real-estate Agents, and Sub Admins may submit an
existing RERA-registered property with one to ten ordered JPEG, PNG, or WebP
images and up to two reviewer-only PDFs, each no larger than 5 MiB. Only an
active platform Admin may approve or reject; this supersedes the earlier
implementation that also allowed Sub Admin review.

Signed uploads use an owner-bound opaque staging namespace. Submission copies
verified objects into a disjoint server-only canonical private namespace and
verifies them again so a reusable signed upload cannot replace accepted content
or replay an older canonical key. Pending media and all
reviewer PDFs stay private. Approval promotes only verified images to opaque
public property keys; legacy `Property.image` rows remain compatible.

Unreferenced staging objects expire after one hour, rejected private media after
30 days, promoted private image sources after successful publication, and
public media when a listing becomes inactive. Account deletion rejects pending
submissions and deletes their private objects. Video, general Loans/Real Estate
galleries, feedback attachments, content moderation/malware providers, listing
editing, and resubmission remain outside this decision.

Evidence:

- [`apps/api/app/services/property_submissions.py`](../../apps/api/app/services/property_submissions.py)
- [`apps/api/app/models/property_media.py`](../../apps/api/app/models/property_media.py)
- [`apps/api/alembic/versions/f4a5b6c7d8e9_add_managed_property_media.py`](../../apps/api/alembic/versions/f4a5b6c7d8e9_add_managed_property_media.py)
- [`apps/api/app/tests/test_property_submissions_api.py`](../../apps/api/app/tests/test_property_submissions_api.py)
- [`apps/api/app/tests/test_property_media_rls.py`](../../apps/api/app/tests/test_property_media_rls.py)
- [`apps/web/features/real-estate/submit-property-form.tsx`](../../apps/web/features/real-estate/submit-property-form.tsx)

Compatibility requirement: the API owns media authorization and public URL
projection; storage keys never become access-control boundaries. RLS preserves
owner/platform-Admin private access and active-listing public access. Broader
FR-13 requirements remain partial, including malware scanning, image metadata
normalization, and an explicit approved-PDF retention policy.

### CS-005 — Client registration is mobile-first; identity profile details are optional

Ordinary Client account creation requires first and last name, an OTP-verified
mobile, password, and only an optional referral code. Email, gender, income,
occupation, and postal address are collected after account creation on a
skippable step and remain editable and clearable from Profile settings. No
Client capability or business line is gated on completion.

Optional identity-wide values live on `auth_users`; email remains unique when
supplied, and income is represented as a bounded integer-minor-unit source/
amount/period group. Staff provisioning and Agent applications continue to
require email and attach it when a role is added to a mobile-only Client
identity without replacing an address already on file. Registration and initial
reset never use a self-asserted email as proof of mobile control; only an
explicitly selected, previously verified email may receive a reset resend.
Public reset initiation, resend, and verification responses remain neutral for
unknown accounts and absent/unverified email. Email-verification OTPs are bound
to a keyed target fingerprint and a row-locked live address check. The new
fields remain under existing owner/platform-Admin RLS and are cleared during
immediate account deletion.

Evidence:

- [`apps/api/app/services/auth_service.py`](../../apps/api/app/services/auth_service.py)
- [`apps/api/app/models/user.py`](../../apps/api/app/models/user.py)
- [`apps/api/alembic/versions/a6b7c8d9e0f1_align_registration_profile.py`](../../apps/api/alembic/versions/a6b7c8d9e0f1_align_registration_profile.py)
- [`apps/api/app/tests/auth/test_register.py`](../../apps/api/app/tests/auth/test_register.py)
- [`apps/api/app/tests/auth/test_update_me.py`](../../apps/api/app/tests/auth/test_update_me.py)
- [`apps/web/app/(auth)/register/page.tsx`](../../apps/web/app/(auth)/register/page.tsx)
- [`apps/web/app/(app)/dashboard/settings/page.tsx`](../../apps/web/app/(app)/dashboard/settings/page.tsx)

This supersedes the former mandatory-email registration implementation and
settles FR-3.3/FR-17.2 without changing CS-001 dual-line enrollment or CS-003
profile/RLS scope.

## 3. Previously open items settled by current behavior

The following entries may still be labelled “open,” “assumed,” or “pending” in
the supplied designs. Preserve the implemented behavior unless a later decision
explicitly changes it.

| Topic | Current behavior | Evidence |
| --- | --- | --- |
| Telephony and number masking | Integrated telephony, recording, and masking are outside v1. Assigned Telecallers use the visible number and device dialer. | SRS v1.2 §5.2/§5.7 and feature-list v1.2 revision note |
| Loan-type custom fields | V1 uses the shared field set. `custom_fields` is reserved/read-only for a later builder. | [`schemas/loan_config.py`](../../apps/api/app/schemas/loan_config.py), migration `678f7a77e812` |
| Agent lead editing cutoff | The originating Agent may edit an unassigned lead; assignment to a Telecaller locks further Agent edits. | [`services/agent.py`](../../apps/api/app/services/agent.py), [`test_agent_api.py`](../../apps/api/app/tests/test_agent_api.py) |
| Telecaller field tasks | A Telecaller may raise an unassigned `document_collection` task for an assigned lead; Admin assigns it to an Employee. | [`api/v1/telecaller.py`](../../apps/api/app/api/v1/telecaller.py), [`services/telecaller.py`](../../apps/api/app/services/telecaller.py), [`test_telecaller_api.py`](../../apps/api/app/tests/test_telecaller_api.py) |
| Document verification owner | A platform Admin verifies task and loan documents. The collecting Employee cannot self-verify. | [`api/v1/document_verification.py`](../../apps/api/app/api/v1/document_verification.py), [`models/task.py`](../../apps/api/app/models/task.py) |
| Background-check representation | A task has one outcome: `clear`, `flagged`, or `inconclusive`; structured sub-checks are not part of the current model. | [`models/task.py`](../../apps/api/app/models/task.py), [`schemas/employee.py`](../../apps/api/app/schemas/employee.py) |
| Website content approval | Sub Admin content blocks publish directly; there is no Admin approval gate. | [`api/v1/content.py`](../../apps/api/app/api/v1/content.py), [`test_content_blocks_api.py`](../../apps/api/app/tests/test_content_blocks_api.py) |
| Banner precedence | Public banners sort by highest `priority`, then oldest `created_at`, then stable ID. | [`services/public_catalog.py`](../../apps/api/app/services/public_catalog.py), [`test_public_banners.py`](../../apps/api/app/tests/test_public_banners.py) |
| Client status reasons | The API exposes `status_reason`, and the client loan UI renders it verbatim when present. | [`schemas/loans.py`](../../apps/api/app/schemas/loans.py), [`apps/web/lib/loans.ts`](../../apps/web/lib/loans.ts), [`loans-applications.tsx`](../../apps/web/features/dashboard/loans-applications.tsx) |
| Referral payout execution | Sub Admin manages bonus configuration; creating the actual referral payout is restricted to platform Admin. | [`api/v1/referral_bonus.py`](../../apps/api/app/api/v1/referral_bonus.py), [`api/v1/referrals.py`](../../apps/api/app/api/v1/referrals.py) |
| Agent lead expiry | Agent attribution has a fixed 30-day first-attribution deadline with converted/closed exclusions, idempotent scheduled release, audit, notifications, RLS denial, and Agent history/countdown. | [PR #144](https://github.com/brollysolutions/client1/pull/144), [`services/lead_expiry.py`](../../apps/api/app/services/lead_expiry.py) |
| Client registration and optional profile | Client registration is mobile-first; email and demographic/income/address details are optional, skippable, editable, clearable, and never gate account use. | CS-005, [PR #148](https://github.com/brollysolutions/client1/pull/148) |

## 4. Genuine open decisions and implementation gaps

These items are not resolved merely because related scaffolding exists. They
need a separate product decision and implementation task.

### OI-003 — vehicle arrangements

The advisory client/employee designs describe vehicle-arrangement behavior, but
there is no corresponding current model or workflow. Decide whether it is its
own entity or an Employee task type before implementation.

### OI-004 — analytics caching

No product decision is needed until measurement shows a performance problem.
Keep direct indexed queries and defer caching to load-test evidence.

## 5. Legacy documentation references in code

Some implementation comments refer to legacy local design notes under
`docs/specs/` or `docs/ai/`, including `docs/ai/feature-status.md`. Those
original documents are not present and must not be treated as available
authority. A new derived living ledger now exists at
[`feature-status.md`](feature-status.md); it was independently reconstructed
from checked-in evidence and is not a transcription of the unseen legacy file.

Use this mapping when encountering those references:

| Legacy reference | Current source of truth |
| --- | --- |
| `docs/specs/dual-line-clients.md` | CS-001, current auth code, registration tests, and RLS migrations |
| `docs/ai/feature-status.md` | [`feature-status.md`](feature-status.md), current code/tests, and Sections 3–4 of this register |
| Feature-specific `docs/specs/*.md` | Relevant SRS/feature-list requirement, current route/service/model/migration/tests, and `SECURITY.md` |
| `docs/ai/plans/*` | Historical implementation provenance only; never product authority |

Future changes should cite checked-in documents or concrete requirement IDs.
Do not recreate missing design notes from code comments or assume their unseen
contents.

## 6. Change rules

- Do not rewrite the supplied originals to make them look current; amend the
  index and this derived register.
- Do not change accepted current behavior from a stale advisory passage alone.
- A change to CS-001 or CS-003 requires an authorization/RLS and migration review.
- Uploads, authentication, PII/KYC, payouts, and business-line scope require the
  repository security-review workflow before shipping.
- When an open item is decided, record the decision here with date, evidence,
  rollout implications, and any superseded requirement text.
