# Loans & Real Estate Platform — Feature List

**Web Application · Admin Panel**
**Version 1.4 — MVP Sign-off: Profile-Based Line Segregation**
**Date:** 28 June 2026

| | |
|---|---|
| **Document Title** | Loans & Real Estate Platform — Feature List |
| **Version** | 1.4 — MVP Sign-off (Profile-Based Line Segregation) |
| **Status** | Aligned to SRS v1.4 — Signed off for MVP Development |
| **Date** | 28 June 2026 |
| **Prepared by** | Project Lead, Development Team (4) |
| **Source Document** | Loans & Real Estate Platform — SRS v1.4 |
| **Audience** | Client, Project Team, Developers, QA |

**Revision note.** This feature list reflects the revised web-only scope and supersedes earlier drafts. Native Android/iOS apps and integrated cloud telephony (call bridging, server-side number masking, automatic call logs, and call recording) have been removed. Telecallers now dial leads directly from their own devices, and **number masking has been removed from scope** — Telecallers see the numbers of leads assigned to them. Loan types use a shared field set for v1 (per-type custom-field builder deferred). All items below are aligned with SRS v1.3, including the v1.3 decision register updates.

**Amendment (v1.4 final database segregation).** The database no longer uses `business_line = both`. A single mobile login is stored in `auth_users`; line-specific participation is stored in separate profile rows. A customer using Loans and Real Estate has two `client_profiles` rows under the same mobile: one `loans` profile and one `real_estate` profile. Internal staff and Agents remain line-specific through `staff_profiles` and `agent_profiles`. Agent-introduced leads gain login access via self-registration with their own number (optionally started by an agent invite link, bound by OTP). Agent-introduced leads do **not** auto-expire to an open pool; they remain attributed to the originating agent profile until fulfilled/converted, closed, or manually released by Admin under exception. If an existing client is approved as an agent, the client profile/customer ID remains immutable and agent capability is recorded in an `agent_profiles` row linked to the same login identity.

---

## v1.4 Final Database Segregation Decision

The database no longer uses `business_line = both`. The final schema separates **login identity** from **business-line participation**:

- `auth_users` stores login identity only: mobile number, password hash, verification state, account status, and audit/security fields.
- `client_profiles` stores one row per client per business line. A person who uses Loans and Real Estate has two rows under the same `auth_user_uuid`: one `loans`, one `real_estate`.
- `agent_profiles` stores one row per approved agent per business line. Agent capability is line-specific and never `both`.
- `staff_profiles` stores Telecaller/Employee/Sub Admin/Admin capability and scope. Telecaller and Employee rows are single-line; Admin and Sub Admin are platform-scoped but do not use a `both` enum value.
- All business records keep a single immutable `business_line` value: `loans` or `real_estate` only.

This gives the client the required separation: Loans and Real Estate remain separately reportable, separately permissioned, and separately routed, while the user can still log in with one mobile number.

## Platform & Architecture

- Two independent business lines — Loans and Real Estate — within one shared ecosystem.
- Every record auto-classified into a Loans or Real Estate bucket at the point of creation.
- Bucket routing drives team assignment, dashboards, analytics, notifications, and access permissions.
- Loan data and real-estate data kept fully isolated from each other using separate line-specific profile rows and immutable `business_line` values on all business records.
- Delivered as a responsive web application, admin panel, role-based dashboards, and a supporting REST API layer. Native Android/iOS apps are not in scope.

## Roles & Access Control

- Six roles — Admin, Sub Admin, Agent, Telecaller, Employee, Client — each with its own dashboard and permission set.
- **Admin:** full visibility and control to view, update, and audit every record, user, and configuration.
- **Sub Admin:** banners (Admin-approved), offers, discounts, promotions, website content, and referral-bonus administration.
- **Agent:** access limited to own leads; sees only property requirements for agent-introduced property leads, not loan details.
- **Telecaller:** acts only on assigned leads (calls, updates); cannot create leads or run background checks.
- **Employee:** field and background work on assigned tasks; cannot alter records owned by others.
- **Client:** access limited to own profile, status, transactions, and interactions.
- **Edit ownership:** agents edit only their own entries, clients edit only theirs, Admin can edit both.
- Admin field-level visibility control over which fields Employees, Telecallers, and Agents can see.

## Authentication & Onboarding

- Mobile-number registration with OTP verification, then password creation for login.
- OTP workflow with resend, expiry timing, and failed-attempt handling.
- Optional email and additional profile details (not mandatory).
- Unique customer/profile ID per business line. The same mobile can have one Loan client profile and one Real Estate client profile, but cannot create duplicate active profiles within the same line.
- A single mobile/login can support Loans, Real Estate, or both, but the database stores this as separate `client_profiles` rows. If a customer selects both, one `loans` profile and one `real_estate` profile are created under the same `auth_user`. No record uses `business_line = both`. Internal staff and Agents remain tied to a single line through profile rows.
- Support-assisted mobile-number change when a user loses access to their registered number.

## Lead Management

- Lead creation, assignment, tracking, and status progression, with lead origin preserved throughout.
- Agent-introduced lead generates a client ID (name, mobile, requirements) and assigns it to a telecaller.
- An agent-introduced lead gains login access by registering with their own mobile number; the agent can share an invite link to start this, and the lead-to-account binding is confirmed by OTP to the lead's own number. Once registered, the client can track their application status. A leaked or forwarded link cannot be used to take over a lead, because the OTP goes to the number, not the link holder.
- Direct self-registration (no agent), requirement selection, creation of one or two line-specific client profiles, and assignment to the relevant telecaller pipeline.
- Duplicate lead-ownership prevention via the "already registered" check.
- No routine Admin reassignment of agent-owned leads and no automatic expiry/open-pool release. Agent-introduced leads remain attributed to the originating agent until the client's requirement is fulfilled/converted, the lead is closed, or Admin manually releases the lead under an exceptional business decision.

## Agent Registration & Management

- Any lead/client can apply to become an agent via a request form, subject to Admin approval.
- Agent KYC: Aadhaar, PAN, photo, address proof; real-estate agents additionally require RERA approval and a RERA code.
- Unique agent code/profile issued on approval. For an existing client approved as an agent, the original client profile/customer ID remains immutable; the agent identity is stored in an `agent_profiles` row linked to the same `auth_user`, with `converted_from_client = true`.
- Agents view their own leads' numbers; lead/agent contact details not alterable by Employees or Telecallers.

## Loan Module

- Loan pages, loan calculator, business-contact CTAs, and explanatory content.
- Loan lead management, status updates, workflow monitoring, referral tracking, notifications, and bank/product management.
- All loan types supported; per-bank availability configurable.
- Admin adds, edits, and disables loan types directly from the Admin dashboard (config-driven, no developer). Loan types share one field set for v1; per-type custom fields are deferred.
- Loan transaction history (bank name, amount, interest rate, date), entered manually by telecallers.
- Processing fee waived or returned as cashback on successful conversion.

## Real Estate Module

- Lists only existing, RERA-registered properties for clients to browse (no property-registration function).
- Property listing management, inquiry handling, visit scheduling, and vehicle-arrangement tracking.
- Real-time workflow progress; all property logistics attached to the same workflow record.
- Property uploads by Sub Admin, Agents, or Leads; visible only after Admin approval.
- RERA registration number displayed on every listing/advertisement.
- Employee-led in-person viewings and physical document collection; Employees collect and upload documents only. Admin verifies internal document completeness, while the bank verifies final loan acceptance/sanction where applicable.
- Platform does not collect property payment — it flows directly to the builder (mediator positioning).

## Commission

- No fixed rate; commission varies by property type, loan type, agent, and bank, set through one-to-one discussion.
- Admin enters and records the agreed rate per agent and per deal (manual entry, restricted to Admin, logged).
- No automated commission-percentage engine in base scope.
- Commissions disbursed via payment gateway (Razorpay) or cheque.

## Referral Program

- Available to Clients only — not agents, employees, or telecallers.
- Unique referral code (or referring phone number) per client used to credit cashback.
- Rewards tied to actual conversion, not referral submission.
- Referral amounts paid via gateway or cheque, credited to the referring client, and shown in their transaction history.
- Referral activity traceable by Admin. Sub Admin manages referral-bonus rules/content only; Admin executes referral payouts.

## Payments & Disbursement

- Payment gateway used solely for offers, cashback, and commissions.
- Property payments go to the builder; loan principal flows through the bank — neither touches the platform.
- Multiple methods supported: Razorpay, UPI, RuPay, and cheque, with multi-gateway flexibility.

## Telecalling & Call Activity

- Telecallers dial assigned leads directly from their own devices; the portal presents a click-to-dial link that hands the number to the device's native dialer.
- No cloud-telephony provider, call bridging, virtual business number, server-side number masking, automatic call logging via webhook, or call recording is in scope.
- Call outcomes are captured manually — the telecaller logs a disposition and updates the lead's status, requirements, and interest after each attempt.
- WhatsApp follow-up is available via a wa.me link as a non-telephony channel.
- DLT registration, recorded-call consent disclosure, DND scrubbing, and calling-hour enforcement are not platform features; the telecalling team remains responsible for lawful calling practices on their own lines.
- Integrated telephony (masked click-to-call, call logging, recording) can be reinstated later as a separate scope item; doing so would also restore true number masking.

## Notifications

- Web push notifications for process updates, status changes, and key events.
- Notifications, emails, and banners each redirect to their relevant page or workflow when clicked.
- Admin notified of each major action for an audit trail.

## Banners & Personalization

- Layered banner structure: default, personalized, and action banners.
- Customers see banners by selection (loan or real estate); agents see incentive banners.
- Personalized content shown only to logged-in users; Admin updates banners dynamically; Sub Admin banners go live after Admin approval.
- Offer placement based on user activity, location, and business status.

## Media Gallery & Uploads

- Separate media galleries for Loans and Real Estate.
- Upload media, capture via device camera, and attach feedback files.
- Supports images, videos (fixed file-size limit), and PDFs.
- Upload limits enforced for stability, especially for large or repeated submissions.

## Support & Ticketing

- Support for clients, employees, and agents (forgotten passwords, OTP non-receipt).
- Login-related tickets handled exclusively by Admin.
- Mobile-number-change support for users who lost access to their registered number.
- Reachable via WhatsApp or a central support route, routed to Admin.

## Contact Privacy

- Telecallers see the numbers of leads assigned to them and dial directly from their own devices; number masking is not in scope.
- Agents always see their own leads' numbers.
- Admin field-level visibility (FR-2.9) governs other sensitive fields.
- Contact-visibility controls (allow, deny, share-link); invite-sharing without over-exposing data.

## Analytics & Reporting

- Weekly and monthly views with date-based filtering and CSV/Excel export.
- Reports can isolate a single agent, a group of agents, or a specific business segment.
- Lead counts, conversion counts, and per-agent/per-team performance summaries, with sorting and selective viewing.

## Profile & Account Management

- Role-aware profile area: transactions, support, history, account management, and logout.
- Registration data: name, gender, contact number, net salary or business income, occupation, and address.
- Account deletion behind a warning and confirmation step.
- On deletion, personal/identifying details are permanently erased; transaction history is retained, de-linked from identity, for 7 years, then purged.
- No previous details visible to the user on later re-registration.
- Admin can remove any account suspected of being suspicious.

## Location-Based Features

- Captures login location (where permitted) to display relevant offers and personalization.
- Architecture anticipates future map-based integration, including Google My Business (GMB) usage.

## Platform & Technical

- SEO-friendly architecture, mobile-responsive layout, optimized page structure, search-engine indexing, and blog readiness.
- Strict role-based access enforcement; cross-access and unauthorized edit/delete/view blocked at the application level.
- Secure API handling with authentication, authorization, and encryption.
- Activity monitoring and backup mechanisms.
- Deployed as a web application served over HTTPS; native app-store publishing (Google Play Store, Apple App Store) is not in scope.

---

*Confidential.*
