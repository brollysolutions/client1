# Loans & Real Estate Platform — Software Requirements Specification (SRS)

**Web Application · Admin Panel**
**Version 1.2 — Final (Revised Scope: Web-Only, Masking Removed)**
**Date:** 25 June 2026

| | |
|---|---|
| **Document Title** | Loans & Real Estate Platform — Software Requirements Specification (SRS) |
| **Version** | 1.2 — Final (Revised Scope) |
| **Status** | Approved for Development — Revised (Web-Only Scope) |
| **Date** | 25 June 2026 |
| **Prepared by** | Project Lead, Development Team (4) |
| **Source Documents** | Consolidated Product Requirements Document; Client Clarification Document |
| **Audience** | Client, Project Team, Developers, QA |

**Revision note (v1.1 → v1.2).** Two finalizations since v1.1: (a) number masking has been **removed from scope entirely** — Telecallers dial leads directly and see assigned-lead numbers; Admin field-level visibility (FR-2.9) still governs other sensitive fields; (b) loan-type configuration is confirmed as a **shared field set** for v1, with the per-type custom-field builder deferred. The retention period is confirmed at 7 years. All changes are reflected in Sections 4.14, 5.1, 5.2, 5.3 and Appendix A.

**Amendment (post-v1.2).** A client account may now operate in Loans, Real Estate, or **both** under a single mobile number; the earlier requirement to register a second profile on an alternate number is removed for clients (records remain line-tagged and isolated, so data segregation is unchanged). Internal staff and Agents remain single-line. The client → agent transition and the onboarding of agent-introduced leads (invite link plus OTP-gated binding) are specified in the new Section 5.9. Affected: FR-3.5, FR-4.3, Section 5.8 (D-3), and Section 5.9.

---

## Table of Contents

1. Introduction
   - 1.1 Purpose
   - 1.2 Scope
   - 1.3 Definitions & Roles
2. Overall Description
   - 2.1 Product Perspective
   - 2.2 User Classes
   - 2.3 Operating Environment
   - 2.4 Assumptions & Dependencies
3. System Architecture & Data Segregation
4. Functional Requirements
   - 4.1 User Roles & Access Control
   - 4.2 Authentication & Account Onboarding
   - 4.3 Lead Management
   - 4.4 Agent Registration & Management
   - 4.5 Loan Module
   - 4.6 Real Estate Module
   - 4.7 Commission Management
   - 4.8 Referral System
   - 4.9 Payment Gateway & Disbursements
   - 4.10 Notifications
   - 4.11 Banners & Personalization
   - 4.12 Media Gallery & Uploads
   - 4.13 Support & Ticketing
   - 4.14 Contact Privacy & Communication
   - 4.15 Analytics & Reporting
   - 4.16 Profile & Account Management
   - 4.17 Location-Based Features
5. Confirmed Decisions & Clarifications Log
   - 5.1 Account Deletion vs. Transaction-History Retention
   - 5.2 Contact-Number Visibility (Masking Removed)
   - 5.3 Self-Service Loan-Type Configuration
   - 5.4 Direct Customers and Commission
   - 5.5 Commission Calculation Method
   - 5.6 Property Registration & Developer Relationship
   - 5.7 Telecalling — Direct Dialing (Cloud Telephony Removed)
   - 5.8 Reconciled Source-Document Conflicts
   - 5.9 Multi-Line Clients and Agent-Introduced Lead Onboarding
6. Non-Functional Requirements
   - 6.1 SEO & Performance
   - 6.2 Security & Data Protection
   - 6.3 Hosting, Deployment & Publishing
   - 6.4 Support & Maintenance
- Appendix A — Role-Permission Matrix
- Appendix B — Branding Inputs Provided by Client

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the complete functional and non-functional requirements for the Loans & Real Estate Platform. It consolidates the two source documents — the Consolidated Product Requirements Document and the Client Clarification Document — into a single, de-duplicated, implementation-ready specification. All previously open items and conflicts between the two sources have been reconciled and are recorded in Section 5 (Confirmed Decisions & Clarifications Log).

### 1.2 Scope

The platform manages two independent business lines — Loans and Real Estate — within one shared ecosystem. While both lines share infrastructure and a common user base, their data, workflows, dashboards, and user visibility remain strictly separated. The delivered solution comprises a public web application, an administrative panel, role-based dashboards, and supporting APIs. It is delivered as a responsive web application only; native Android and iOS applications are not in scope.

**In scope:** lead generation and management, OTP-based authentication, loan workflows (calculators, bank/product management, status tracking), real-estate workflows (listings, visits, vehicle arrangement), commission and referral handling, payment-gateway disbursement of commissions and cashback, telecaller follow-up via direct device dialing, notifications, banners and personalization, media galleries, support, and analytics.

**Out of scope (handled separately):** property/loan principal payments (these flow directly to the builder or bank), third-party hosting and domain costs, and any major UI redesign, new modules, or additional integrations requested after delivery.

### 1.3 Definitions & Roles

- **Bucket** — One of the two operational pipelines: Loans or Real Estate. Every record is tagged to exactly one bucket at creation.
- **Admin** — Owner-level user with full visibility and control across the system.
- **Sub Admin** — Limited administrative user for promotions, offers, banners, website content, and referral-bonus administration.
- **Agent** — A registered intermediary who introduces leads and manages only their own leads and client relationships.
- **Telecaller** — An internal user who follows up on assigned leads by phone and updates their status; cannot create leads.
- **Employee** — An internal user who performs field and background work (document collection, in-person property visits, background checks).
- **Client / Lead** — An end customer seeking a loan or property, registered with a unique customer ID.
- **RERA** — Real Estate Regulatory Authority registration, required for real-estate agents.

---

## 2. Overall Description

### 2.1 Product Perspective

The system is a multi-role product. A common authentication and profile layer feeds two segregated operational modules (Loans and Real Estate), each with its own dashboards, content, media, and reporting. Routing logic ensures that every lead, inquiry, banner, upload, and report is associated with the correct bucket from the moment it is created, eliminating downstream ambiguity.

### 2.2 User Classes

Six distinct roles are supported — Admin, Sub Admin, Agent, Telecaller, Employee, and Client — each with its own dashboard and a restricted permissions model. No role has unrestricted access; every role sees only the screens, actions, and records relevant to its responsibilities. The complete capability breakdown is provided in Appendix A (Role-Permission Matrix).

### 2.3 Operating Environment

- Responsive web application (public site + authenticated dashboards).
- Administrative web panel.
- RESTful API layer serving the web application and admin panel, secured by authentication, authorization, and encryption.

### 2.4 Assumptions & Dependencies

- The client provides the domain, logo, colour theme, and the colour combination and content for referral-related documents.
- The client holds an active RERA registration and will obtain RERA approval for the website where required.
- Commercial rules for commissions, interest, and processing charges are negotiated case-by-case and recorded by Admin (see Sections 4.7 and 5).

---

## 3. System Architecture & Data Segregation

Loans and Real Estate are implemented as two distinct operational buckets that never share pipelines, dashboards, or reporting views. The following requirements govern the core structure.

- **FR-1.1** The system shall classify every lead, inquiry, workflow item, content item, upload, and report into either the Loans bucket or the Real Estate bucket at the point of creation.
- **FR-1.2** Classification shall be automatic and unambiguous; manual re-classification after creation shall not be required for routine flows.
- **FR-1.3** Loan-related records shall be routed to the loan team and property-related records to the real-estate team. This routing shall also drive dashboards, analytics, notifications, and access permissions.
- **FR-1.4** Loan data and real-estate data shall remain isolated from each other so that teams operate without cross-contamination between the two business lines.
- **FR-1.5** The platform shall be delivered as a web application, an admin panel, role-based dashboards, and a supporting API layer.

---

## 4. Functional Requirements

### 4.1 User Roles & Access Control

- **FR-2.1** The system shall provide six roles — Admin, Sub Admin, Agent, Telecaller, Employee, Client — each with its own dashboard and permission set.
- **FR-2.2** Admin shall have full visibility and the ability to view, update, and audit every record, user, workflow, product, listing, bank, banner, offer, referral, notification, and report in the system.
- **FR-2.3** Sub Admin permissions shall be limited to banner creation (subject to Admin approval), offer and discount management, promotions, website content, and referral-bonus administration. Sub Admin shall not create or remove agents and shall not view full lead details.
- **FR-2.4** Agent access shall be limited to the agent's own leads and client relationships. Where a lead is introduced by an agent for a property purchase, the agent shall see only that lead's property requirements and not any loan details.
- **FR-2.5** Telecallers shall act only on leads assigned to them — placing calls and updating requirements, interest, and pick status — and shall not create leads or perform background checks.
- **FR-2.6** Employees shall perform field and background work (document collection, in-person property visits, background checks) on assigned tasks and shall not alter records already submitted or owned by another user.
- **FR-2.7** Clients shall access only their own profile, status, transactions, and interactions.
- **FR-2.8** Details provided by an agent shall be editable only by that agent; details provided by a client shall be editable only by that client; Admin shall be able to edit details provided by either.
- **FR-2.9** Admin shall be able to enable or disable, at field level, which fields are visible to Employees, Telecallers, and Agents.

### 4.2 Authentication & Account Onboarding

- **FR-3.1** Users shall register with a mobile number, verify it via OTP, and then create a password for subsequent logins.
- **FR-3.2** The OTP workflow shall support resend, expiration timing, and failed-attempt handling to improve security and reduce unauthorized access.
- **FR-3.3** During profile creation, email ID and additional details shall be optional and not mandatory.
- **FR-3.4** Through support, a user who has lost access to their registered mobile number shall be able to change it to an alternate number (see Section 4.13).
- **FR-3.5** Each customer ID shall be unique, mapping to exactly one mobile number; if a mobile number is already registered, the system shall display an 'already registered' message. A single client account may hold both a loan journey and a real-estate journey under the same mobile number (see Section 5); the client selects loans, real estate, or both at registration. Internal staff and Agents remain tied to a single business line (see Section 5).

### 4.3 Lead Management

- **FR-4.1** The system shall support lead creation, assignment, tracking, and status progression, with the lead's origin (Agent or direct Client) preserved throughout its lifecycle.
- **FR-4.2** When an agent introduces a lead, the system shall generate a client ID capturing name, mobile number, and requirements, and assign it to a telecaller for follow-up.
- **FR-4.3** A customer shall be able to register directly (without an agent), select a requirement — loan, real estate, or both — and be assigned to a telecaller for direct follow-up with no agent involvement. Where both are selected, the account holds a separate journey per line; the two journeys remain isolated from each other and follow their own line's pipeline.
- **FR-4.4** Telecallers shall not create leads; they shall only follow up on and update leads already assigned to them. (This reconciles a conflict between the two source documents — see Section 5.)
- **FR-4.5** The system shall prevent duplicate lead ownership: if a mobile number is already registered (by an agent or by the lead), it shall be shown as 'already registered' and shall not be assignable to a different agent.
- **FR-4.6** Admin shall not transfer an agent-owned lead to a different agent. An agent-registered lead must convert within a defined timeline; otherwise it shall become open (unassigned) and return to the available pool. (This reconciles a conflict between the two source documents — see Section 5.)

### 4.4 Agent Registration & Management

- **FR-5.1** Any lead shall be able to apply to become an agent by submitting an agent request registration form, subject to Admin approval.
- **FR-5.2** Agent registration shall require Aadhaar, PAN, photo, and address proof. Real-estate agents shall additionally require RERA approval and a RERA agent code.
- **FR-5.3** On approval, the system shall issue the agent a unique agent ID.
- **FR-5.4** Agents shall view their respective leads' contact numbers. Contact details provided by a lead or agent shall not be alterable by Employees or Telecallers.

### 4.5 Loan Module

- **FR-6.1** The Loans section shall provide dedicated loan pages, a loan calculator, business-contact CTAs, and explanatory content for prospective customers.
- **FR-6.2** The module shall support loan lead management, status updates, customer workflow monitoring, referral tracking, notification updates, and bank/product management.
- **FR-6.3** All loan types shall be supported in principle. Per-bank availability shall be configurable (for example, HDFC currently offers personal loans only).
- **FR-6.4** Admin shall be able to add new loan types (for example, education or business loans) directly through configuration, without developer involvement (see Section 5).
- **FR-6.5** Loan transaction history shall capture bank name, amount, interest rate, and date, entered manually by telecallers.
- **FR-6.6** Based on successful business conversion, the processing fee shall be either waived or returned to the lead as cashback.

### 4.6 Real Estate Module

- **FR-7.1** The Real Estate section shall remain separate from the Loan module and shall support property listing management, inquiry handling, visit scheduling, and vehicle-arrangement tracking.
- **FR-7.2** The workflow shall expose real-time progress visibility so that the customer and internal team can follow the process, and all property-related logistics shall remain attached to the same workflow record so the operational history is not fragmented.
- **FR-7.3** Property details shall be uploadable by Sub Admin, Agents, and Leads, and shall become visible in the application only after Admin approval.
- **FR-7.4** Employees shall conduct in-person property viewings and collect physical documents where required.
- **FR-7.5** When a lead purchases a property, the platform shall not collect the property payment; that payment shall go directly to the builder (see Section 4.9).

### 4.7 Commission Management

- **FR-8.1** Commission shall have no fixed rate; it shall vary by property type, loan type, agent, and bank, and shall be determined through one-to-one discussion.
- **FR-8.2** Admin shall configure and record the agreed commission rate per agent and per deal in the backend; an automated commission-percentage engine is not in base scope (see Section 5).
- **FR-8.3** Earned commissions shall be disbursed via the payment gateway (Razorpay) or by cheque.

### 4.8 Referral System

- **FR-9.1** Referrals shall be available to Clients only — not to agents, employees, or telecallers.
- **FR-9.2** Each client shall have a unique referral code (or referring phone number) used to credit cashback to that client.
- **FR-9.3** Rewards shall be tied to actual conversion, not referral submission: if a client refers ten others and only one converts into successful business, commission shall be paid on that one only.
- **FR-9.4** Referral amounts shall be sent via the payment gateway or cheque, credited to the referring client, and reflected in that client's transaction history (viewable by the client).
- **FR-9.5** Referral activity shall be traceable by Admin, with the source preserved. Referral-bonus administration shall be managed by Sub Admin.

### 4.9 Payment Gateway & Disbursements

- **FR-10.1** The payment gateway shall be used solely to send users their offers, cashback, and commissions — not for property or loan principal payments.
- **FR-10.2** Property purchase payments shall go directly to the builder; loan principal flows directly through the bank.
- **FR-10.3** The payment layer shall support multiple methods — Razorpay, UPI, and RuPay — plus cheque, and shall be flexible enough to allow more than one gateway.
- **FR-10.4** Final commercial rules for interest or charges shall be defined separately from this functional scope.

### 4.10 Notifications

- **FR-11.1** The platform shall support push notifications for process updates, status changes, and important events.
- **FR-11.2** Notifications, emails, and banners shall each redirect to their respective relevant page or workflow when clicked.
- **FR-11.3** Admin shall receive a notification for each major action to maintain an audit trail and operational oversight.

### 4.11 Banners & Personalization

- **FR-12.1** The platform shall use a layered banner structure: a default banner shown to all users, a personalized banner adapting to user type and interest, and an action banner guiding users to the correct section (Loans or Real Estate).
- **FR-12.2** Customers shall see banners relevant to their selection (loan or real estate); agents shall see banners about their own benefits and incentives.
- **FR-12.3** Personalized content shall appear only to logged-in users. Admin shall update banners dynamically; Sub Admin may create banners, which go live only after Admin approval.
- **FR-12.4** Offer placement shall consider user activity, location, and business status.

### 4.12 Media Gallery & Uploads

- **FR-13.1** The platform shall provide separate media galleries for Loans and Real Estate so that images and videos remain organized by business area.
- **FR-13.2** Users shall be able to upload media, capture content through the device camera, and attach feedback files where relevant.
- **FR-13.3** Media uploads shall support images, videos (with a fixed file-size limit), and PDFs.
- **FR-13.4** Upload limits shall be enforced to prevent server overload and maintain stability, particularly for large or repeated submissions.

### 4.13 Support & Ticketing

- **FR-14.1** Support shall be available to clients, employees, and agents for issues such as forgotten passwords and non-receipt of OTPs.
- **FR-14.2** Login-related support tickets shall be handled exclusively by Admin; Sub Admin and other roles shall have no involvement.
- **FR-14.3** Support shall cover cases where a user has lost access to their registered mobile number and needs to change it to an alternate number.
- **FR-14.4** Users shall be able to reach support through WhatsApp or a central support route, with requests routed to Admin for review and response.

### 4.14 Contact Privacy & Communication

- **FR-15.1** Telecallers shall see the contact numbers of leads assigned to them so they can place calls directly from their own devices; contact numbers are not masked. Admin field-level visibility (FR-2.9) continues to govern other sensitive fields.
- **FR-15.2** Agents shall see their own leads' numbers.
- **FR-15.3** Telecallers shall place calls directly from their own devices — the portal shall present a click-to-dial link that hands the number to the device's native dialer. Centralized call bridging through a shared virtual number, server-side number masking, call logging, and call recording are not in scope (see Section 5.7).
- **FR-15.4** Contact visibility shall support role-based access controls such as allow, deny, and share-link permissions, exposing no more contact data than necessary for a given role.

### 4.15 Analytics & Reporting

- **FR-16.1** Analytics shall support weekly and monthly views with date-based filtering and export to CSV and Excel.
- **FR-16.2** Reports shall be able to isolate a single agent, a group of agents, or a specific business segment.
- **FR-16.3** The reporting layer shall surface lead counts, conversion counts, and performance summaries per agent and per team, with sorting and selective viewing.

### 4.16 Profile & Account Management

- **FR-17.1** Each user shall have a profile area providing access to transactions, support, history, account management, and logout, reflecting the role of the logged-in user.
- **FR-17.2** Registration shall collect key profile data — name, gender, contact number, net salary or business income, occupation, and address — while keeping the flow simple.
- **FR-17.3** Account deletion shall be protected by a warning and confirmation step and shall follow the soft-delete and retention policy defined in Section 5.
- **FR-17.4** Admin shall be able to remove any account suspected of being suspicious.

### 4.17 Location-Based Features

- **FR-18.1** Where permitted, the system shall capture the user's login location and use it to display relevant offers and personalization.
- **FR-18.2** The architecture shall anticipate future map-based integration, including business-location visibility such as Google My Business (GMB) usage.

---

## 5. Confirmed Decisions & Clarifications Log

The items below were either flagged as open in the source material or were areas where the two source documents disagreed. Each has been resolved and is treated as confirmed for development. Please verify these resolutions match what was agreed with the client, as they directly drive implementation.

### 5.1 Account Deletion vs. Transaction-History Retention

**Decision:** On account deletion (confirmed via a warning pop-up), the user's personal and identifying details — name, contact number, address, gender, income, occupation, photo, and KYC documents — are permanently erased, while transaction and financial records are retained. The retained records are de-linked from the deleted identity (kept against an internal reference ID only, not the user's personal data) so that no personal information is held without a lawful basis. Retention is justified by financial record-keeping obligations: records are retained for 7 years and automatically purged once that window expires. On any later re-registration, none of the user's previous details are visible to them. The same logic applies to admin-initiated removal of suspicious accounts.

### 5.2 Contact-Number Visibility (Masking Removed)

**Decision:** Number masking has been removed from scope entirely. With cloud telephony removed (see 5.7), Telecallers dial leads directly and must see the number to call; no display-masking or reveal-logging is implemented. Telecallers see the numbers of leads assigned to them; Agents see their own leads' numbers. Admin's field-level visibility control (FR-2.9) remains in place for other sensitive fields. If number protection (the Telecaller never seeing the raw number) later becomes a firm requirement, it requires reinstating integrated telephony as a separate scope item (see 5.7).

### 5.3 Self-Service Loan-Type Configuration

**Decision:** Admin adds, edits, and disables loan types directly from the Admin dashboard UI, with no developer involvement. Loan types are stored as configuration records (not hardcoded), each mappable to specific banks, and newly added types automatically appear in the relevant dropdowns and workflows.

**Resolved for v1:** all loan types share one input-field set; the Admin adds a type name and label only. The dynamic per-type field builder (e.g., an institution-name field specific to education loans) is deferred. The `loan_types.custom_fields` slot is reserved so the builder can be added later without a migration.

### 5.4 Direct Customers and Commission

**Decision:** A customer who registers directly (without an agent) is treated as a Client, not an Agent, and does not earn agent commission. Such a client may participate in the referral programme (earning cashback only on referred leads that convert). To earn agent commission, the client must separately apply as an agent, supplying the required documents and obtaining Admin approval (plus RERA approval and code for real estate).

### 5.5 Commission Calculation Method

**Decision:** Commissions are entered manually in the backend by Admin on a per-agent, per-deal basis. There is no fixed rate and no automated percentage engine in the base scope; the negotiated rate is recorded against each deal, with entry restricted to Admin and logged. Tax obligations on commission payouts (GST, TDS) apply regardless of manual entry and are handled outside the functional scope (CA sign-off).

### 5.6 Property Registration & Developer Relationship

**Decision:** The platform only lists existing, RERA-registered properties for clients to browse — it does not provide a property-registration function. Listings may be uploaded by Sub Admin, Agents, or Leads and become visible only after Admin approval, which is also the checkpoint for confirming the property is RERA-registered. The RERA registration number is displayed on every listing/advertisement. Property purchase payments flow directly to the builder; the platform does not collect them. Developer/builder relationships are handled as an operational/business arrangement and do not require a separate functional module in the base scope.

### 5.7 Telecalling — Direct Dialing (Cloud Telephony Removed)

**Decision:** Telecalling is handled by Telecallers dialing leads directly from their own devices. No cloud-telephony provider (e.g., Exotel, Ozonetel, Knowlarity), call bridging, server-side number masking, call logging, or call recording is in scope. The portal presents the assigned lead's number with a click-to-dial link that hands off to the device's native dialer. Consequences of removing telephony: (a) the lead's number is visible to the Telecaller — number masking is not in scope (see 5.2); (b) there is no automatic call log or recording, so call outcomes are captured only by the Telecaller manually updating the lead's status, requirements, and interest; (c) DLT registration, recorded-call consent disclosure, DND scrubbing, and calling-hour enforcement are not platform features, though the telecalling team remains responsible for lawful calling practices on their own lines. Integrated telephony with masked click-to-call, call logging, and call recording can be reinstated later as a separate scope item; doing so would also restore true number masking. (This supersedes the earlier decision to bring cloud telephony, call logging, and recording into base scope.)

### 5.8 Reconciled Source-Document Conflicts

- **D-1 Telecallers as a lead source:** the Consolidated PRD listed telecallers among lead originators, but the Clarification Document states telecallers cannot create leads. Resolved in favour of the clarification — telecallers only update assigned leads (FR-4.4).
- **D-2 Lead reassignment by Admin:** the Consolidated PRD implied Admin could change lead ownership, but the Clarification Document states Admin cannot transfer an agent-owned lead to another agent. Resolved in favour of the clarification — unconverted agent leads instead expire to an open pool (FR-4.6).
- **D-3 Single mobile number per profile:** a mobile number maps to one unique customer ID. A client account may hold both a loan journey and a real-estate journey under that single number; selecting "both" at registration is supported, and each journey is tagged to its own line and kept isolated. (This revises the earlier resolution, which required an alternate number for the second profile; the alternate-number requirement is removed for clients. Internal staff and Agents remain single-line — an Agent identity in a different line requires a separate account on a different mobile, see Section 5.4 and FR-5.x.)

### 5.9 Multi-Line Clients and Agent-Introduced Lead Onboarding

**Decision (multi-line client).** A single client account may operate in the Loans line, the Real Estate line, or both, chosen at registration. Data segregation is preserved at the record level — every lead, application, inquiry, and transaction is tagged to exactly one line and remains immutable — so a "both" client simply holds separate, isolated journeys under one login. The segregation requirement (FR-1.4) is a guarantee about *records and teams*, not a restriction preventing one customer from holding two products; loan and real-estate records are never combined in a single query, team view, or report. Internal staff (Telecaller, Employee) and Agents remain bound to a single line, which is what keeps the operational teams cleanly separated. The customer-facing dashboard renders the Loans surface (green) and the Real Estate surface (amber) as separate areas and never combines the two accents on one working screen.

**Decision (client → agent).** When an existing client applies to become an agent: if the client is single-line and applies in that same line, the account is upgraded in place (the existing record becomes an agent record, retaining history). If the client holds "both" lines, or applies in the other line, a separate agent account is created on a different mobile number, leaving the client account intact — because an Agent is a single-line, KYC-verified, commission-earning role and cannot be "both."

**Decision (agent-introduced lead login).** A lead introduced by an agent is created without a login account. To gain access and track status, the lead registers with their own mobile number: an agent may share an invite link to start this, but the binding of the lead to the new account is gated by OTP sent to the lead's own number. Only the verified owner of the number can claim the lead; a forwarded or leaked link cannot be used to take over a lead. Registering normally with the same number achieves the same binding, so the link is a convenience for onboarding and agent attribution, not a security credential. The account adopts the lead's business line on claim.

---

## 6. Non-Functional Requirements

### 6.1 SEO & Performance

- **NFR-1.1** The website shall be built with SEO-friendly architecture, mobile responsiveness, optimized page structure, and technical-SEO fundamentals, including search-engine indexing support and blog readiness.
- **NFR-1.2** Performance shall remain stable across devices, with efficient loading and a structure that keeps future content expansion manageable.

### 6.2 Security & Data Protection

- **NFR-2.1** The platform shall enforce role-based restrictions strictly and prevent cross-access between users without permission; unauthorized editing, deletion, or viewing shall be blocked at the application level.
- **NFR-2.2** Data shall be protected through secure API handling, authentication, authorization, and encryption.
- **NFR-2.3** The system shall support activity monitoring and backup mechanisms to protect operational data against loss or misuse.

### 6.3 Hosting, Deployment & Publishing

- **NFR-3.1** The system shall be deployable as a web application served over HTTPS; native app-store publishing (Google Play Store, Apple App Store) is not in scope.
- **NFR-3.2** Infrastructure planning shall include database architecture and a backup strategy. Third-party services, hosting, and domain costs shall be handled separately from the functional scope.

### 6.4 Support & Maintenance

- **NFR-4.1** After launch, the platform shall include a defined support window for bug fixes, technical-issue resolution, and stability monitoring.
- **NFR-4.2** Major UI changes, workflow redesigns, new modules, or additional integrations shall be treated as separate scope items beyond the base project.

---

## Appendix A — Role-Permission Matrix

The matrix summarizes which roles may perform each key action. It is the authoritative reference for access control during development and testing.

| Capability / Action | Admin | Sub Admin | Agent | Telecaller | Employee | Client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View all leads & full client details | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View own / assigned lead details | ✓ | ✗ | ✓* | ✓* | ✓* | ✓* |
| Create a new lead | ✓ | ✗ | ✓ | ✗ | ✗ | ✓* |
| Update lead requirements / status | ✓ | ✗ | ✓* | ✓* | ✗ | ✗ |
| View lead contact number | ✓ | ✗ | ✓* | ✓* | ✗ | — |
| Edit details they provided | ✓ | ✗ | ✓* | ✗ | ✗ | ✓* |
| Reassign a lead to another agent | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create / approve / remove agents | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage banners | ✓ | ✓* | ✗ | ✗ | ✗ | ✗ |
| Manage offers / discounts / promotions | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Administer referral bonuses | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Upload property details | ✓ | ✓* | ✓* | ✗ | ✗ | ✓* |
| Approve uploads & listings | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Field / background work & property visits | — | ✗ | ✗ | ✗ | ✓ | ✗ |
| Perform background checks | — | ✗ | ✗ | ✗ | ✓ | ✗ |
| Enter loan transaction history | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Handle login / OTP support tickets | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configure field visibility | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Add / edit loan types | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Remove suspicious accounts | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Participate in referral program | — | ✗ | ✗ | ✗ | ✗ | ✓ |
| Raise a support request | — | ✗ | ✓ | ✗ | ✓ | ✓ |

**Legend**

- ✓ = permitted · ✗ = not permitted · — = not applicable to this role
- ✓* = permitted but limited to the user's own or assigned records (e.g., an agent only on their own leads; a telecaller only on assigned leads; a client only on their own profile).
- For 'Manage banners' and 'Upload property details', a Sub Admin / Agent / Client entry of ✓* means the item is created or drafted by that role but goes live or becomes visible only after Admin approval.
- Telecallers see assigned leads' contact numbers and dial directly from their own devices; number masking is not in scope (see 5.2 and 5.7).

## Appendix B — Branding Inputs Provided by Client

- Domain name.
- Logo.
- Colour theme / brand guidelines.
- Colour combination and content for referral-related documents.

---

*Confidential.*
