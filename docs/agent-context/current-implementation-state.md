# Current implementation state and decision register

Status: **Derived reconciliation and later product amendment**

As of: **2026-08-21**

Code baseline: `14773ae` ([PR #151](https://github.com/brollysolutions/client1/pull/151))

## 1. Purpose and authority

This document records the behavior already implemented in the repository and
the later direction to preserve that work. It is derived from current code,
tests, migrations, recent history, the supplied documents in this directory,
and the explicit 2026-08-06 decision to keep completed behavior unchanged.

The supplied SRS and feature list remain the original historical product
baseline. This register supersedes them only for the specific conflicts
identified below. It does not silently rewrite the supplied source documents.
`SECURITY.md`, current authorization/RLS enforcement, migrations, and later
explicit user decisions continue to govern implementation details.

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
occupation, and location are collected after account creation on a skippable
step and remain editable and clearable from Profile settings. Income source is
recorded as `salaried` or `business_income`; the former `net_salary` value is
migrated to `salaried`. No Client capability or business line is gated on
completion.

Location is a labelled search-style field for a manually entered locality/city.
The web app does not request browser geolocation, call a reverse-geocoding
provider, or offer a current-location action. The bounded editable label is sent
to `PATCH /auth/me` only when the user saves the profile.

The shared property omnibox on dashboard home, Explore, category, and Bookmarks
surfaces searches locality, city, PIN, or property name. The Filters sheet keeps
searchable live city/locality controls. Property results, suggestions, and filter
choices come only from the authenticated property API; there is no frontend
sample-location fallback or second catalogue-location selector. The landing
dashboard omits inventory/bookmark/city/category metrics, and property search
never updates the profile. The profile stores one manually supplied readable
value until it is cleared or the account is deleted.

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
- [`apps/api/alembic/versions/e4b5c6d7e8f9_replace_profile_address_with_location.py`](../../apps/api/alembic/versions/e4b5c6d7e8f9_replace_profile_address_with_location.py)
- [`apps/api/app/tests/auth/test_register.py`](../../apps/api/app/tests/auth/test_register.py)
- [`apps/api/app/tests/auth/test_update_me.py`](../../apps/api/app/tests/auth/test_update_me.py)
- [`apps/web/app/(auth)/register/page.tsx`](../../apps/web/app/(auth)/register/page.tsx)
- [`apps/web/app/(app)/dashboard/settings/page.tsx`](../../apps/web/app/(app)/dashboard/settings/page.tsx)
- [`apps/web/components/profile/optional-profile-fields.tsx`](../../apps/web/components/profile/optional-profile-fields.tsx)
- [`apps/web/features/real-estate/property-search-bar.tsx`](../../apps/web/features/real-estate/property-search-bar.tsx)
- [`apps/web/e2e/registration-profile.spec.ts`](../../apps/web/e2e/registration-profile.spec.ts)
- [`apps/web/e2e/dashboard-navigation.spec.ts`](../../apps/web/e2e/dashboard-navigation.spec.ts)

This supersedes the former mandatory-email registration implementation and
settles FR-3.3/FR-17.2 without changing CS-001 dual-line enrollment or CS-003
profile/RLS scope.

### CS-006 — vehicle arrangements are a dedicated site-visit workflow

A Client may optionally request one pickup while creating a real-estate site
visit. The request creates a dedicated `vehicle_arrangements` row linked 1:1
to `site_visits`; vehicle logistics are not stored on the visit and are not a
fourth Employee task type. A platform Admin enters vehicle/driver details and
directly assigns an active real-estate Employee. The assigned Employee may
complete or cancel the pickup, while the owning Client follows a read-only
status and receives driver/vehicle details only after assignment.

The lifecycle is `requested → arranged → assigned → completed`, with
non-terminal cancellation. Site-visit cancellation atomically cancels its
active arrangement through a database trigger without granting Clients UPDATE
access to company-managed logistics. Platform-Admin, owning-Client read, and
assigned-Employee policies remain distinct under RLS; audit and notification
payloads exclude pickup locations and contact data.

Evidence:

- [`apps/api/app/models/vehicle_arrangement.py`](../../apps/api/app/models/vehicle_arrangement.py)
- [`apps/api/app/services/vehicle_arrangements.py`](../../apps/api/app/services/vehicle_arrangements.py)
- [`apps/api/alembic/versions/b8c9d0e1f2a3_add_vehicle_arrangements.py`](../../apps/api/alembic/versions/b8c9d0e1f2a3_add_vehicle_arrangements.py)
- [`apps/api/app/tests/test_vehicle_arrangements_api.py`](../../apps/api/app/tests/test_vehicle_arrangements_api.py)
- [`apps/api/app/tests/test_vehicle_arrangements_rls.py`](../../apps/api/app/tests/test_vehicle_arrangements_rls.py)
- [`apps/web/features/admin/vehicle-arrangements-view.tsx`](../../apps/web/features/admin/vehicle-arrangements-view.tsx)
- [`apps/web/features/employee/vehicle-arrangements-view.tsx`](../../apps/web/features/employee/vehicle-arrangements-view.tsx)

This resolves OI-003 and supersedes only advisory passages that proposed
folding fulfilment into `tasks` or attaching logistics directly to a property
deal. A property deal may already reference the same site visit, preserving
workflow history without a duplicate nullable ownership key.

### CS-007 — analytics teams are the existing business lines

For FR-16 reporting, a selected list of Agent profile IDs is the ad hoc Agent
group filter. The Loans and Real Estate business lines are the authoritative
team dimension because Agents are already permanently line-scoped; there is no
separate mutable team-membership entity. Team performance summaries aggregate
the selected Agents by their business line. This resolves the ambiguous
“team” terminology without adding organization management, historical
membership, or a new cross-line access path.

Evidence:

- [`apps/api/app/models/profile.py`](../../apps/api/app/models/profile.py)
- [`apps/api/app/services/reporting.py`](../../apps/api/app/services/reporting.py)
- [`apps/web/features/admin/analytics/report-filter-bar.tsx`](../../apps/web/features/admin/analytics/report-filter-bar.tsx)
- [`apps/web/features/admin/analytics/analytics-view.tsx`](../../apps/web/features/admin/analytics/analytics-view.tsx)
- [PR #150](https://github.com/brollysolutions/client1/pull/150)

Compatibility requirement: report access remains limited to active
platform-Admin sessions, and all selected-Agent and team aggregates keep the
existing business-line predicates and PostgreSQL RLS context.

### CS-008 â€” authenticated personalization is consented and purpose-limited

Client and Agent dashboards may render one live banner per default,
personalized, and action layer. A closed, versioned rule grammar supports user
type, Client journey stage, Agent activity, and bounded geographic circles;
populated dimensions are ANDed and values within one dimension are ORed.
Customer offers remain Client-facing, while Agent benefits and incentives use
the personalized banner layer. Anonymous responses never include personalized
banners or offers with non-empty audience rules.

Activity-based personalization is off until the account owner enables it. The
web app no longer captures or refreshes browser coordinates. A previously saved
coarse personalization point remains removable from Settings and otherwise
expires after 30 days; disabling personalization and account deletion also erase
it. The preference table remains owner-only under RLS, and the existing
authorization-checking one-row database function permits atomic deletion without
giving Admin a read policy. Placements use a private, no-store authenticated
response and validate the caller's active profile and requested business line
before reading content.

Evidence:

- [`apps/api/app/schemas/personalization.py`](../../apps/api/app/schemas/personalization.py)
- [`apps/api/app/services/personalization.py`](../../apps/api/app/services/personalization.py)
- [`apps/api/alembic/versions/c9d0e1f2a3b4_add_authenticated_personalization.py`](../../apps/api/alembic/versions/c9d0e1f2a3b4_add_authenticated_personalization.py)
- [`apps/api/app/tests/test_personalization_api.py`](../../apps/api/app/tests/test_personalization_api.py)
- [`apps/api/app/tests/test_personalization_rls.py`](../../apps/api/app/tests/test_personalization_rls.py)
- [`apps/web/features/dashboard/personalized-placements.tsx`](../../apps/web/features/dashboard/personalized-placements.tsx)
- [`apps/web/features/settings/personalization-settings-card.tsx`](../../apps/web/features/settings/personalization-settings-card.tsx)
- [`apps/web/e2e/personalization.spec.ts`](../../apps/web/e2e/personalization.spec.ts)

Compatibility requirement: no clickstream, impression log, raw or historical
location, IP geolocation, inferred demographic, arbitrary JSON/SQL expression,
or staff targeting is introduced without a separately approved design and
privacy/security review.

### CS-009 — v1 payouts use UPI, bank transfer, or manual cheque

**Decision (2026-08-08):** FR-10.3 is interpreted as an outbound disbursement
requirement for cashback, referral bonuses, and commissions. V1 supports UPI
VPA and bank-transfer payouts through RazorpayX plus an audited manual-cheque
workflow. RazorpayX remains the sole automated provider, represented behind an
explicit provider boundary so a later provider does not require redesigning the
payout domain. RuPay/card-number handling, customer checkout, loan-principal or
property-payment collection, a second live provider, configurable routing, and
automatic cross-provider failover are not in v1.

Cheque issuance does not make a payout paid. The payout remains processing
until an authorized Admin records clearance, which emits the recipient-ledger
credit. Voids or bounces fail before settlement; a reversal after clearance
uses the existing compensating-ledger pattern. Only masked cheque references
and a deduplication fingerprint may be retained.

This decision resolves the mixed vocabulary in SRS FR-10.3, where Razorpay is a
provider, UPI is a payment rail, RuPay is a card network, and cheque is an
offline instrument. It does not change FR-10.1/FR-10.2's prohibition on
collecting property payments or loan principal.

**Implementation status:** Complete in
[PR #154](https://github.com/brollysolutions/client1/pull/154). Payout rows
persist an explicit provider; existing VPA and
bank-account rows backfill to RazorpayX, while manual cheques remain approved
until issuance and processing until clearance. Raw cheque references are
reduced to a masked display hint plus a keyed deduplication fingerprint, and
only clearance creates the paid recipient ledger row. Failure and reversal
preserve source-link reconciliation and compensating-ledger behavior.

Evidence:

- [`apps/api/app/services/payments.py`](../../apps/api/app/services/payments.py)
- [`apps/api/alembic/versions/e0f1a2b3c4d6_add_payment_methods.py`](../../apps/api/alembic/versions/e0f1a2b3c4d6_add_payment_methods.py)
- [`apps/api/app/tests/test_payouts_api.py`](../../apps/api/app/tests/test_payouts_api.py)
- [`apps/api/app/tests/test_payouts_live.py`](../../apps/api/app/tests/test_payouts_live.py)
- [`apps/web/features/admin/payouts-view.tsx`](../../apps/web/features/admin/payouts-view.tsx)
- [`packages/contracts/openapi/openapi.json`](../../packages/contracts/openapi/openapi.json)

### CS-010 — Map/GMB integration is removed from the product scope

**Decision (2026-08-09):** Map-based integration, including Google My Business
(GMB) usage, is not part of the current product baseline or future backlog.
FR-18.2 and the aligned feature-list bullet are superseded and must not be
counted as incomplete, deferred, planned, or required for release.

The original supplied SRS and feature list remain unchanged as historical
source documents. This decision changes only their active authority for the
specific Map/GMB requirement; it does not remove address-based properties,
site visits, vehicle pickup locations, or the consented coarse-location
personalization implemented under FR-18.1 and CS-008.

**Implementation impact:** none. No Map/GMB integration exists in the current
code, so no application, API, schema, migration, provider configuration, or
data cleanup is required. Future reintroduction requires a new explicit product
decision and a separate privacy, security, provider, and data-retention review.

### CS-011 — Telecallers and Employees may be provisioned for both lines

**Decision (2026-08-10):** an Admin may provision a Telecaller or Employee for
Loans, Real Estate, or Both. This extends CS-003's line-scoped staff model; it
does not make either role platform-scoped and does not extend dual-line access
to Agents.

A dual-line staff JWT carries `business_line=both`, while every operational API
request resolves to exactly one concrete `loans` or `real_estate` line selected
by the dashboard. The API validates that selector against the signed role and
claim before installing PostgreSQL RLS context. A single-line token cannot use
the selector to expand its access, and assignment/ownership policies continue
to restrict records within the selected line.

Database checks permit `both` only for line-scoped Telecaller and Employee
profiles. Operational records, audit line tags, assignment cursors, leads,
tasks, payouts, and media remain concretely classified as Loans or Real Estate.
This supersedes earlier wording that implied all internal staff must hold only
one line, while preserving the profile-based identity model and all RLS,
maker/checker, audit, and assignment boundaries.

Evidence:

- migration `c5d6e7f8a9b0` and [`apps/api/app/core/deps.py`](../../apps/api/app/core/deps.py)
- dual-line provisioning, assignment, selected-line RLS, and vehicle workflow tests
- [`apps/web/features/dashboard/line-provider.tsx`](../../apps/web/features/dashboard/line-provider.tsx)
- generated OpenAPI and TypeScript contracts

### CS-012 — Main Admin hierarchy and delegated payout requests

**Decision (2026-08-10):** the oldest existing active Admin is migrated as the
single Main Admin. On a clean installation, the first seeded Admin becomes Main
Admin. Only that live Main Admin identity may create additional Admin accounts,
with a maximum of three additional active Admins, or grant/revoke closed staff
features. Main Admin status is database-constrained to an active platform Admin
and is not a caller-controlled token flag. Main Admin deletion is rejected until
a separate, explicit ownership-transfer workflow is approved and implemented.

The first closed feature is `payout_requests`. A granted platform Sub Admin may
search the minimal payout-recipient projection, create payout requests, and
list payout workflow rows. They may not approve or reject a payout, view payout
link reconciliation, or issue, clear, fail, or reverse a manual cheque. Feature
changes increment the target user's session version and revoke refresh tokens,
so a grant or revocation takes effect on the next request and requires a normal
sign-in to obtain fresh signed claims. Payout RLS independently requires the
same feature claim.

Main Admin-created payouts are the only approval-free exception. The service
derives this exception from the live staff row and records an explicit
`primary_admin_standalone` approval audit without fabricating a checker. The
existing recipient/self-payout checks, configured caps, daily serialization,
idempotency/deduplication, provider handling, masked destination storage,
notification, and paid-ledger settlement rules remain in force. A Sub Admin or
additional Admin remains a maker whose payout requires a different Admin.

This decision supersedes the universal maker/checker wording only for a live
Main Admin's own payout. It does not make Sub Admin a general platform Admin,
does not permit arbitrary feature strings, and does not broaden any other RLS
policy or business-line boundary.

Evidence:

- migration `d7f8a9b0c1d2` and the `staff_feature_grants` RLS policies
- [`apps/api/app/services/admin.py`](../../apps/api/app/services/admin.py) and
  [`apps/api/app/services/payments.py`](../../apps/api/app/services/payments.py)
- hierarchy, grant/revocation, payout API/RLS, linked-payout, auth/session, and
  dashboard capability tests
- generated OpenAPI and TypeScript contracts

### CS-013 — property listing authority, owner CRUD, and panorama media

**Decision (2026-08-20):** Clients cannot list properties. Real-estate Agents
may create and manage only their own listings; Sub Admins and platform Admins
may also create listings. Platform Admin retains approval/rejection and broader
operational authority. An owner edit to an approved listing returns the authored
version to review while the last approved catalogue version stays public.
Withdrawal deactivates an approved catalogue row instead of erasing it.

Property MP4 is removed. One optional first-party uploaded equirectangular JPEG
or WebP panorama is supported through the existing private managed-media and
Admin approval lifecycle. Loans video, external tour embeds, 360 video, and
multi-room tours are outside this amendment.

This supersedes FR-7.3 and aligned feature-list wording only where they permit a
Lead/Client to upload property details; FR-13.1/FR-13.3 only for property video;
and CS-004 only where it permits Client submission or excludes listing
editing/resubmission. It preserves real-estate isolation, owner-bound storage,
content verification, reviewer-only documents, RERA review, auditability,
retention, and active-listing public RLS.

Source and approved interpretation:

- [`property-listing-authority-and-panorama-2026-08-20.md`](property-listing-authority-and-panorama-2026-08-20.md)

### CS-014 — Admin-configured product-specific Financial Services forms

**Decision (2026-08-21):** Admin-configured Financial Products and their
versioned, allowlisted application forms are the source of truth for the
authenticated Client dashboard. Lending/funding products retain the loan
lifecycle; Credit Cards and Insurance use quote/enquiry semantics and never
enter sanction/disbursal states. Registered identity fields are server-sourced,
submitted answers are validated against the exact configured version, and
historical submissions retain an immutable schema snapshot.

Lender names and product availability remain Admin-managed reference data and
are not seeded by CS-014. Initial intake also contains no inline KYC/document
upload fields; the existing document workspace remains a separate workflow.

**Implementation status:** Complete in
[PR #211](https://github.com/brollysolutions/client1/pull/211). The
additive migration, typed server validation, generated contracts, Admin form
builder, dynamic Client renderer, loan/enquiry separation, historical
snapshots, RLS ledgers, no-store responses, and account-deletion answer scrub
are implemented and verified. No lender or product-availability seed is part
of this delivery.

This explicitly replaces the previously settled v1 shared-field behavior and
activates the reserved per-product form capability. It does not weaken Admin
authorization, Client ownership, assigned-staff scope, business-line RLS,
account-deletion cleanup, or public catalogue independence.

Source and approved interpretation:

- [`configurable-financial-product-forms-2026-08-21.md`](configurable-financial-product-forms-2026-08-21.md)

## 3. Previously open items settled by current behavior

The following entries may still be labelled “open,” “assumed,” or “pending” in
the supplied designs. Preserve the implemented behavior unless a later decision
explicitly changes it.

| Topic | Current behavior | Evidence |
| --- | --- | --- |
| Telephony and number masking | Integrated telephony, recording, and masking are outside v1. Assigned Telecallers use the visible number and device dialer. | SRS v1.2 §5.2/§5.7 and feature-list v1.2 revision note |
| Loan-type custom fields | Superseded by CS-014: Admin-configured versioned product forms are now approved for the authenticated Client dashboard. | [`configurable-financial-product-forms-2026-08-21.md`](configurable-financial-product-forms-2026-08-21.md) |
| Agent lead editing cutoff | The originating Agent may edit an unassigned lead; assignment to a Telecaller locks further Agent edits. | [`services/agent.py`](../../apps/api/app/services/agent.py), [`test_agent_api.py`](../../apps/api/app/tests/test_agent_api.py) |
| Telecaller field tasks | A Telecaller may raise a `document_collection` task for an assigned lead; the service assigns it to an active same-line or dual-line Employee by durable round robin, with scheduled no-capacity retry and inactive-assignee repair. Admin sees the relationship read-only. | [`api/v1/telecaller.py`](../../apps/api/app/api/v1/telecaller.py), [`services/telecaller.py`](../../apps/api/app/services/telecaller.py), [`services/employee_assignment.py`](../../apps/api/app/services/employee_assignment.py), [`test_employee_auto_assignment.py`](../../apps/api/app/tests/test_employee_auto_assignment.py) |
| Document verification owner | A platform Admin verifies task and loan documents. The collecting Employee cannot self-verify. | [`api/v1/document_verification.py`](../../apps/api/app/api/v1/document_verification.py), [`models/task.py`](../../apps/api/app/models/task.py) |
| Background-check representation | A task has one outcome: `clear`, `flagged`, or `inconclusive`; structured sub-checks are not part of the current model. | [`models/task.py`](../../apps/api/app/models/task.py), [`schemas/employee.py`](../../apps/api/app/schemas/employee.py) |
| Website content approval | Sub Admin content blocks publish directly; there is no Admin approval gate. | [`api/v1/content.py`](../../apps/api/app/api/v1/content.py), [`test_content_blocks_api.py`](../../apps/api/app/tests/test_content_blocks_api.py) |
| Banner precedence | Public banners sort by highest `priority`, then oldest `created_at`, then stable ID. | [`services/public_catalog.py`](../../apps/api/app/services/public_catalog.py), [`test_public_banners.py`](../../apps/api/app/tests/test_public_banners.py) |
| Client status reasons | The API exposes `status_reason`, and the client loan UI renders it verbatim when present. | [`schemas/loans.py`](../../apps/api/app/schemas/loans.py), [`apps/web/lib/loans.ts`](../../apps/web/lib/loans.ts), [`loans-applications.tsx`](../../apps/web/features/dashboard/loans-applications.tsx) |
| Referral payout execution | Sub Admin manages bonus configuration; creating the actual referral payout is restricted to platform Admin. | [`api/v1/referral_bonus.py`](../../apps/api/app/api/v1/referral_bonus.py), [`api/v1/referrals.py`](../../apps/api/app/api/v1/referrals.py) |
| Agent lead expiry | Agent attribution has a fixed 30-day first-attribution deadline with converted/closed exclusions, idempotent scheduled release, audit, notifications, RLS denial, and Agent history/countdown. | [PR #144](https://github.com/brollysolutions/client1/pull/144), [`services/lead_expiry.py`](../../apps/api/app/services/lead_expiry.py) |
| Client registration and optional profile | Client registration is mobile-first; email and demographic/income/location details are optional, skippable, editable, clearable, and never gate account use. Location is entered manually through a search-style field; the web app does not request browser geolocation. | CS-005, [PR #148](https://github.com/brollysolutions/client1/pull/148), migration `e4b5c6d7e8f9` |
| Vehicle arrangements | One dedicated arrangement per site visit; Admin enters transport details, the service automatically assigns an eligible real-estate or dual-line Employee, the assignee fulfils it, and the owning Client follows it read-only. | CS-006, [PR #149](https://github.com/brollysolutions/client1/pull/149), migration `b8c9d0e1f2a3`, migration `dd45ee67ff89`, vehicle-arrangement and Employee-auto-assignment tests |
| Authenticated personalization | Client/Agent dashboard banner layers and Client offers use a closed consented rule grammar; coarse optional location is retained for at most 30 days; public responses exclude targeted content. | CS-008, [PR #152](https://github.com/brollysolutions/client1/pull/152), migration `c9d0e1f2a3b4`, personalization API/RLS/web tests |

## 4. Genuine open decisions and implementation gaps

These items are not resolved merely because related scaffolding exists. They
need a separate product decision and implementation task.

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
