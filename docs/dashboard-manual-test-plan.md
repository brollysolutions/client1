# Dashboard manual acceptance test plan

Status: **Execution-ready manual QA plan**

As of: **2026-08-10**

Repository baseline reviewed: **`f56e7b8`**

Scope: **All 52 implemented dashboard page entry points across Client, Agent, Telecaller, Employee, Sub Admin, and Admin**

## 1. Purpose and authority

Use this document to manually test every implemented dashboard feature before a release. It is derived from current web routes and components, API routes, generated contracts, API/RLS tests, `SECURITY.md`, the approved SRS/feature list, and the current implementation decision register.

Where older design documents conflict with current behavior, this plan follows the current implementation register:

- ordinary Clients have both Loans and Real Estate profiles under one account and choose an active dashboard line;
- both business lines use the established blue visual system;
- Telecallers and Employees may be provisioned for Loans, Real Estate, or Both, but dual-line staff must select one concrete line per request and remain assignment-scoped;
- Agents remain single-line;
- Sub Admin is platform-scoped but has only its closed set of content, referral, property-submission, and optionally delegated payout-request capabilities;
- payouts support UPI VPA and bank transfer through RazorpayX, plus audited manual cheque; no card/RuPay collection, property payment, or loan-principal collection exists;
- Map/GMB integration is removed from scope.

This is a test plan, not a claim that a case passed. Record fresh evidence for every execution.

### Known product gaps to preserve in reporting

| Requirement | Current status | How to report during this run |
| --- | --- | --- |
| FR-2.2 exhaustive Admin coverage | Partial | Test every implemented Admin surface below. Log a product-gap observation when an SRS record/update operation has no Admin UI; do not mark the entire requirement passed from route smoke tests. |
| FR-2.8 provenance-based edit ownership | Partial | Execute the implemented Agent pre-assignment edit and Client profile edit cases plus all denial cases. Log inconsistent or absent ownership rules as product gaps, not test-environment blockers. |

## 2. Execution record

Copy this block for each test cycle.

| Field | Value |
| --- | --- |
| Build/commit | |
| Environment and URL | |
| API version | |
| Database migration head | |
| Browser/OS/device | |
| Tester | |
| Started/finished | |
| RazorpayX mode | Must be mock/test; never live |
| Storage/scanner/transcoder status | |
| Result summary | Pass: / Fail: / Blocked: / Not run: |
| Defect links | |

Result codes:

- **P** - observed result matches every expected result.
- **F** - product behavior differs; create a defect with reproducible evidence.
- **B** - an external dependency or environment prevents execution; name it exactly.
- **N/R** - not run; never count as passing.
- **N/A** - genuinely inapplicable to the selected account/data; explain why.

For each case record: result, account ID, test-data IDs, timestamp, browser/network evidence, relevant API response status, and defect link. Never put access tokens, OTPs, full mobile numbers, bank details, KYC data, raw storage keys, or other PII in screenshots or defects.

## 3. Environment and safety prerequisites

### 3.1 Required services

- Web, API, PostgreSQL with RLS enabled, Redis, object storage, scheduler, nginx/proxy, and the configured mail/push test adapters are running.
- ClamAV, Pillow, and FFmpeg processing are available for managed-media cases. Production-like scanning must fail closed; do not disable the security gate to make an upload pass.
- RazorpayX is in the repository's mock/test mode. Webhook secrets and payout credentials are non-production.
- The database is migrated to exactly one Alembic head.
- Test notifications and email copies use synthetic recipients only.
- HTTPS or a localhost secure context is available for service-worker, push, clipboard, camera, and geolocation cases.

### 3.2 Browser matrix

Run the priority-0 smoke and critical journeys on all supported browsers; run the full suite on the release browser.

| ID | Browser/device | Required coverage |
| --- | --- | --- |
| B1 | Current Chromium, desktop, 1440 x 900 | Full suite |
| B2 | Current Chromium, mobile viewport, 390 x 844 | Navigation, forms, dialogs, tables, uploads, camera fallback |
| B3 | Current Firefox, desktop | Auth/session, critical Client/Agent/staff journeys, downloads |
| B4 | Current Safari/WebKit or Playwright WebKit | Auth/session, responsive navigation, uploads, geolocation/push graceful handling |
| B5 | Keyboard-only plus 200% zoom | All priority-0 routes and representative complex forms |

### 3.3 Synthetic account matrix

Do not use real customer or production data.

| ID | Role/scope | Required state |
| --- | --- | --- |
| ADM-MAIN | Main Admin, platform | Oldest/seeded active Admin; can create additional Admins and grant closed staff features |
| ADM-A | Additional Admin, platform | Active; not the payout maker in checker tests |
| ADM-B | Additional Admin, platform | Active; separate maker/checker for mobile-change tests |
| SUB-GRANT | Sub Admin, platform | Active with `payout_requests` grant |
| SUB-NO-GRANT | Sub Admin, platform | Active without payout grant |
| AG-L | Agent, Loans | Active, approved, own new/assigned/expired/converted leads and commission rows |
| AG-R | Agent, Real Estate | Active, approved, own leads and pending/approved/rejected listing submissions |
| TEL-L1/TEL-L2 | Telecaller, Loans | Active; stable creation order for round-robin tests |
| TEL-R1/TEL-R2 | Telecaller, Real Estate | Active; stable creation order for round-robin tests |
| TEL-B | Telecaller, Both | Active; assignments in each line plus cross-assignment negatives |
| EMP-L | Employee, Loans | Active; assigned document-collection and background-check tasks |
| EMP-R | Employee, Real Estate | Active; assigned property-visit task and vehicle arrangement |
| EMP-B | Employee, Both | Active; assigned tasks in each line plus cross-assignment negatives |
| CLI-A | Client | Active with both profiles; loan application, enquiry, visit, referral, transaction, notification |
| CLI-B | Client | Active with both profiles; foreign-owned records used for isolation checks |
| DEL-USER | Any non-Main-Admin role | Synthetic account reserved for deletion/retention testing |

### 3.4 Seeded records

Prepare at least:

- two approved properties in different categories, one inactive property, and one property with image/video media;
- loan types, two active banks, one inactive bank, and different bank-to-loan-type availability;
- a Client loan in each meaningful status, including `on_hold` and `rejected` with safe reasons;
- assigned and unassigned leads in each business line, including Agent-originated and direct leads;
- assigned, in-progress, blocked, completed, and overdue Employee tasks of every valid type;
- requested, arranged, assigned, completed, and cancelled vehicle arrangements;
- pending/approved/rejected property submissions, banner drafts, offers, and content blocks;
- eligible and ineligible commission, fee-cashback, referral-payout, and general payout sources;
- unread/read notifications with valid same-origin deep links;
- open/in-progress/resolved support tickets and two mobile-change requests suitable for maker/checker testing;
- enough report rows to exercise pagination, sorting, line/Agent filters, CSV, and XLSX.

## 4. Route and capability smoke matrix

For every row: open the route from navigation and by direct URL; refresh it; use Back/Forward; confirm the expected page title, loading state, populated or empty state, and no console error. Then repeat the direct URL with one disallowed role. The browser must return the user to `/dashboard`, while the corresponding API must independently deny access with a non-disclosing 403/404 and return no data.

| Area | Implemented route(s) | Allowed role/scope |
| --- | --- | --- |
| Shared home | `/dashboard` | All authenticated roles; role-specific home |
| Shared notifications | `/dashboard/notifications` | All authenticated roles |
| Shared profile | `/dashboard/settings` | All authenticated roles |
| Shared support | `/dashboard/support` | All authenticated roles in current navigation |
| Client explore | `/dashboard/explore`, `/dashboard/explore/[slug]` | Client; content adapts to active line |
| Client Loans | `/dashboard/apply`, `/dashboard/documents`, `/dashboard/loan-offers`, `/dashboard/loan-officer`, `/dashboard/loans/[id]` | Client with Loans profile/active line |
| Client Real Estate | `/dashboard/bookmarks`, `/dashboard/enquiries`, `/dashboard/site-visits`, `/dashboard/compare`, `/dashboard/agent` | Client with Real Estate profile/active line |
| Client shared | `/dashboard/transactions`, `/dashboard/referrals` | Client |
| Real Estate submitter | `/dashboard/my-submissions`, `/dashboard/property-submit` | Real Estate Client, Real Estate Agent, or Sub Admin |
| Agent leads | `/dashboard/leads`, `/dashboard/leads/new`, `/dashboard/leads/[id]` | Agent; only own line and own introduced leads |
| Agent finance | `/dashboard/earnings`, `/dashboard/transactions` | Agent; only own rows |
| Telecaller leads | `/dashboard/leads`, `/dashboard/leads/[id]` | Telecaller; assigned leads in selected/permitted line only |
| Employee tasks | `/dashboard/tasks`, `/dashboard/tasks/[id]` | Employee; own assignments in selected/permitted line only |
| Employee logistics | `/dashboard/vehicle-arrangements` | Real Estate Employee or dual-line Employee with Real Estate selected |
| Sub Admin property/referral | `/dashboard/my-submissions`, `/dashboard/property-submit`, `/dashboard/referral-rules` | Sub Admin |
| CMS list/review | `/dashboard/banners`, `/dashboard/offers`, `/dashboard/content` | Sub Admin and Admin; actions differ by role |
| CMS authoring | `/dashboard/banners/new`, `/dashboard/offers/new`, `/dashboard/content/new` | Sub Admin only |
| Delegated payouts | `/dashboard/payouts` | Admin, or Sub Admin with `payout_requests` grant |
| Admin lead operations | `/dashboard/admin-leads` | Admin |
| Admin task operations | `/dashboard/admin-tasks` | Admin |
| Admin Loans | `/dashboard/loan-applications`, `/dashboard/loan-config`, `/dashboard/fee-cashbacks`, `/dashboard/document-verification` | Admin |
| Admin Real Estate | `/dashboard/property-deals`, `/dashboard/vehicle-arrangements`, `/dashboard/property-review` | Admin |
| Admin people/access | `/dashboard/users`, `/dashboard/agents`, `/dashboard/support-tickets`, `/dashboard/access-control` | Admin |
| Admin finance | `/dashboard/payouts`, `/dashboard/commissions`, `/dashboard/referral-payouts`, `/dashboard/referral-rules` | Admin |
| Admin communications | `/dashboard/broadcast` | Admin |
| Admin insights | `/dashboard/analytics`, `/dashboard/audit-log` | Admin |

Additional route checks:

- An unauthenticated request to any `/dashboard*` route reaches login and does not flash protected data.
- An unknown `/dashboard/...` path is rejected by the dashboard route guard.
- Nested paths inherit the correct capability; authoring child routes do not inherit broader list access.
- Sidebar visibility and direct-route UX are consistent, but hidden UI is never treated as authorization evidence.

## 5. Shared dashboard cases

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| SH-001 | Sign in as each of the six roles and open `/dashboard`. | The correct role home renders; no other role's cards, counts, or records appear. Refresh preserves the session and selected line where applicable. |
| SH-002 | Expand/collapse the desktop sidebar; use keyboard controls; shrink the viewport; open/close the mobile drawer; scroll a short-height Admin menu. | Every eligible destination remains reachable. Active state and accessible labels are correct. Admin sidebar scrolls without a visible scrollbar and without trapping wheel, touch, or keyboard input. |
| SH-003 | Compare sidebar items for every account in the account matrix. | Items exactly match the route matrix. Client items change with active line. Both-line Telecaller/Employee items change with selected line. `SUB-NO-GRANT` has no Payouts item. |
| SH-004 | Open the notification bell and `/dashboard/notifications`; mark one item read, then mark all read. | Unread count decreases immediately and persists after refresh. Only the current user's notifications are visible. Empty/loading/error states are usable. |
| SH-005 | Click notifications with valid workflow links and attempt seeded external, protocol-relative, login, and malformed links through the API/test fixture. | Valid links open the relevant same-origin workflow. Unsafe destinations never render as navigable links and cannot produce an external redirect. |
| SH-006 | Enable and disable browser push in Profile on supported and unsupported browsers; deny permission once. | Subscription state persists, duplicate subscriptions are avoided, unsubscribe succeeds, and denial/unsupported states are explained without blocking the dashboard. No raw endpoint/key is shown. |
| SH-007 | Edit first/last name and optional profile fields; add then clear optional email, gender, occupation, address, and a complete income group. Try a partial income group and duplicate email. | Valid changes persist in `/auth/me`; clearing produces null values. Inconsistent income and duplicate email fail with bounded messages. Mobile remains read-only. Other users cannot read the values. |
| SH-008 | For Client and Agent, enable personalization, enable geolocation, deny once, grant once, remove saved location, then disable personalization. | Consent is explicit and independent. Location is not requested before action. Stored location is coarse/latest-only, removed on revoke/disable, and failures do not block operational content. Staff roles do not receive personalization controls. |
| SH-009 | Raise each available support category with valid bounded text; inspect ticket list and status. Try empty/overlong values. | Ticket is created for the current user and routed to Admin. Validation is accessible and safe. Another user cannot view it. Current implementation permits all authenticated roles through the shared route. |
| SH-010 | Start authenticated lost-mobile intake, complete replacement-number OTP in the test adapter, and verify a linked support ticket appears. | Public/authenticated responses remain enumeration-safe; the OTP is purpose-bound, expiring, attempt-limited, and single-use. No raw number appears in audit/notification detail. |
| SH-011 | Start account deletion; cancel at the warning; retry with wrong and correct password using `DEL-USER`. | Cancel makes no change. Wrong password fails. Correct confirmation ends usable sessions, scrubs PII, delinks retained financial rows, and prevents old access/refresh reuse. Main Admin deletion is rejected. |
| SH-012 | Sign out from the account menu, then use Back and refresh. | Tokens/session state are revoked or cleared, protected data is not recovered from history/cache, and login is required. |

## 6. Client dashboard

### 6.1 Client home and line handling

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| CL-H-001 | Sign in as `CLI-A`; switch between Loans and Real Estate from Home and via line-specific routes. | One account reaches both separate surfaces. The label, navigation, API requests, home data, and personalized placements follow the active concrete line; records are never tagged `both`. |
| CL-H-002 | On each line, observe default, personalized, and action placements with consent off/on and matching/nonmatching seeded rules. | At most one banner per layer is selected deterministically; targeted offers appear only to eligible authenticated Clients; failure to load placements does not block core dashboard content. |
| CL-H-003 | Attempt to fetch `CLI-B` loan, enquiry, visit, transaction, referral, bookmark, submission, and notification IDs. | UI does not expose them; APIs/RLS return non-disclosing denial and no ownership information. |

### 6.2 Loans surface

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| CL-L-001 | Open Loans Home with no applications, then with seeded applications in multiple statuses. | Empty state offers Apply. Populated list shows type, amount, applied date, current full journey status, and safe `status_reason` for `on_hold`/`rejected`. |
| CL-L-002 | Open Explore on Loans and each Loans category slug. | Category navigation works; implemented categories render current content and explicitly incomplete categories show a non-broken coming-soon state. No Real Estate records leak. |
| CL-L-003 | Open Apply; select a configured loan type, enter boundary/valid amount, attach allowed KYC media, submit, and retry a partial upload failure. | Only active types are selectable. One application is created once, progress is clear, uploaded media is linked to that application, partial media failure does not duplicate the application, and success links to the new record. |
| CL-L-004 | Attempt a second active loan journey; repeat-submit; use inactive/unavailable configuration and invalid amounts/files. | Server constraints prevent duplicate active journeys and duplicate requests. Invalid/inactive selections and files fail without partial financial/workflow state. |
| CL-L-005 | Open `/dashboard/loans/[id]` for each pipeline status. | Detail shows requested/sanctioned amount, bank/rate/fee when present, full ordered journey, dates, and safe reason. Internal actor identity, notes, and other Clients' data are absent. |
| CL-L-006 | On Explore, add published lender offers to compare until the 3-item limit across one or more loan products; open Compare Loan Offers to review the side-by-side table, remove an offer, re-add, then continue to Apply. | Only published loan-category offers can be added; the comparison table renders real provider/rate/tenure/amount/fee/eligibility/verified-date fields per offer; limit messaging is clear at 3; removing restores capacity and updates both Explore's checkbox state and the table; Apply navigation carries the right product/offer. |
| CL-L-007 | Open My Loan Officer before and after assignment; use available contact/support actions. | Unassigned state is safe and helpful. Assigned contact is the authorized projection only, with no unrelated staff data. |
| CL-L-008 | In Loan media, upload JPEG/PNG/WebP/PDF/MP4 from files and camera; preview/download; delete an unverified item; try deleting a verified item. | Media is grouped by own application and remains private. Images preview, PDFs download, ready MP4 plays. Pending/processing/failed state is clear. Verified media cannot be removed. |
| CL-L-009 | Exercise upload limits: 5 MiB for image/PDF, 20 MiB for MP4, 12 total per application, at most 2 MP4, MP4 at most 60 seconds; also wrong extension, MIME/signature mismatch, malware fixture, duplicate/replay, and cross-application key. | Valid boundaries succeed. Every excess/mismatch/replay/malware/cross-owner attempt fails closed, exposes no storage key, and creates no public or usable media. |
| CL-L-010 | After Admin/Telecaller updates the loan, refresh Client list/detail/media/transaction views. | Status, terms, document review state, and resulting cashback ledger are consistent without exposing staff-only notes or payout destinations. |

### 6.3 Real Estate surface

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| CL-R-001 | Open Real Estate Home/Explore; search by property name, city, locality, and PIN; combine category, BHK, budget, area, construction, furnishing, amenities, city/locality, and sort filters; clear each/all. | Results and count update consistently, URL state is stable, clear actions work, no-match state is useful, and only active approved listings are shown. |
| CL-R-002 | Inspect property cards/media; verify RERA, price, facets; bookmark/unbookmark; add/remove compare items and exceed the comparison limit. | Details/media are consistent, bookmark persists for `CLI-A` only, compare limit is enforced with recovery, and inactive/pending listings are absent. |
| CL-R-003 | Send an enquiry with valid data; repeat it; submit invalid/overlong data. | One owned inquiry appears in My Enquiries with the correct property and status; duplicate behavior is deterministic; invalid input makes no record. |
| CL-R-004 | Request a site visit without pickup, then with pickup location/time. | Visit is linked to the enquiry/property. Pickup creates exactly one requested arrangement; no pickup row is created when not requested. |
| CL-R-005 | Open My Enquiries and Site Visits through scheduled/completed/cancelled/no-show states; cancel an eligible visit. | Status and workflow history update. Cancelling the parent visit atomically cancels its non-terminal arrangement. Terminal/foreign visits cannot be cancelled. |
| CL-R-006 | Follow requested -> arranged -> assigned -> completed vehicle states while signed in as Client. | Client view is read-only. Driver/vehicle details stay hidden until assignment, then show the safe projection to the owner only. Pickup/contact PII never appears in URLs, notification bodies, or audit details. |
| CL-R-007 | Open My Agent before and after a deal/agent association. | Empty/support state is useful. Associated Agent contact is the authorized projection only. No loan-only or unrelated Agent data appears. |
| CL-R-008 | Submit a property with all required facets, 1-10 ordered JPEG/PNG/WebP images, optional one MP4 and up to two reviewer PDFs; use camera capture and reorder/remove before submit. | Submission is pending and visible only to the submitter/Admin. Image order persists. Reviewer PDFs and pending video remain private. No listing is public before approval. |
| CL-R-009 | Exercise property media boundaries: 5 MiB images/PDFs, 20 MiB MP4, MP4 at most 120 seconds, 1-10 images, max 1 video/2 PDFs; test empty images, excess files, wrong signature, malware, replay, cross-owner staging key, and processing outage. | Valid boundaries succeed. Invalid/malicious/replayed media fails closed. Outage leaves a recoverable private state, never a public asset. |
| CL-R-010 | After Admin approval/rejection, inspect My Listings and public/client catalog. | Approval links one active listing and publishes only processed images/video; RERA and price are correct. Reviewer PDFs remain private. Rejection shows the bounded reason and publishes nothing. |

### 6.4 Client finance and referrals

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| CL-F-001 | Open Transactions with cashback/referral rows in initiated, processing, paid, failed, and reversed states. | Only own rows appear with correct line, type, amount, method/status/date and safe reference. The view is read-only; raw VPA/bank/cheque data is absent. |
| CL-F-002 | Open Referrals; copy the unique code; use WhatsApp share; inspect pending/converted/not-converted rows. | Code is stable and belongs to the Client. Share destination contains intended referral information without access tokens or private IDs. Only conversion produces a reward/payout linkage. |
| CL-F-003 | Attempt Referrals as Agent, Telecaller, Employee, and Sub Admin via UI and API. | No referral surface is advertised and the API denies Client-only referral data. |

## 7. Agent dashboard

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| AG-001 | Open Agent Home as `AG-L` and `AG-R`. | Home shows own lead counts, Agent code/status/KYC/approval date, RERA only for Real Estate, commission summary, and eligible incentive placements. |
| AG-002 | Introduce a lead with valid E.164 mobile and optional name/requirement. | One exact-line Agent-origin lead is created, the Agent remains immutable origin owner, expiry is stamped, and eligible same-line Telecaller assignment occurs. |
| AG-003 | Introduce duplicate, existing-account, already Agent-owned, invalid, wrong-line, and concurrent same-mobile leads. | Duplicate ownership is prevented without enumeration/partial records; another Agent cannot claim the mobile. |
| AG-004 | Open Leads and detail for active, converted, expired, released, and closed rows. | Only own leads in the Agent's immutable line appear. Mobile is visible. Fixed-expiry countdown/history is accurate; expired rows are read-only and retained as history. |
| AG-005 | Copy the generic registration link; open it separately; bind by registering with the matching mobile/OTP; try a forwarded link with another mobile. | Link contains no lead ID/mobile and grants no authority. Only OTP proof for the matching mobile binds the Client account; forwarded link cannot claim the lead. |
| AG-006 | Edit the Agent-supplied requirement before Telecaller assignment, then after assignment/expiry; attempt contact/status/internal-field edits. | Pre-assignment supported edit persists. Assignment/expiry locks further Agent edits. Contact, operational status, and staff-owned values are never editable. Record any broader provenance inconsistency under FR-2.8. |
| AG-007 | Open Earnings and Transactions with pending/paid/cancelled/reversed commissions. | Own per-deal commission rows and totals reconcile with paid transaction rows. No other Agent, raw destination, internal notes, or Client loan detail is exposed. |
| AG-008 | As `AG-R`, submit/review property listings; as `AG-L`, attempt listing routes and APIs. | Real Estate Agent receives the same owner-only submission workflow as the Client. Loans Agent is redirected/denied with no listing data. |
| AG-009 | Try Clients-only referrals/offers and Telecaller/Employee/Admin routes by direct URL/API. | Navigation omits them and authorization independently denies them. |

## 8. Telecaller dashboard

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| TC-001 | Open Home/Leads for Loans, Real Estate, and Both-line Telecallers; switch `TEL-B` between lines. | Counts, due follow-ups, notifications, and list contain assigned records only for the selected/permitted concrete line. Single-line staff cannot expand scope with a line selector. |
| TC-002 | Open an assigned lead; use `tel:` and `wa.me` actions. | Raw mobile is visible only for the assigned lead and actions hand off to the device/browser safely. No cloud calling, recording, or automatic log is implied. |
| TC-003 | Log every disposition; require interest for connected; add optional follow-up and notes; inspect history/Home due list. | One manual activity per submission, correct validation, chronological history, and due-list update. Double submit does not duplicate an activity. |
| TC-004 | Progress assigned -> working -> converted/closed through allowed controls; attempt invalid reverse/terminal transitions and reassignment. | Allowed state changes persist and notify safely. Invalid/terminal/reassignment attempts fail with no partial update. Telecaller cannot control Agent expiry. |
| TC-005 | Edit allowed requirement/interest/pick fields; attempt name/mobile/origin/Agent ownership/business-line edits. | Allowed operational fields persist. Contact/provenance/line fields remain immutable. |
| TC-006 | On a Loans lead/application, add manual bank, amount, interest rate, and date transaction history with valid and boundary values. Repeat as Real Estate Telecaller. | Valid Loans transaction appears once and becomes read-only history. Invalid values fail. Real Estate Telecaller has no Loans transaction control/API access. |
| TC-007 | Raise a document-collection field task with notes and optional due date; repeat/cancel input. | One unassigned same-line task is created for Admin assignment; no Employee is chosen by Telecaller. Invalid/cross-line lead cannot create a task. |
| TC-008 | On Real Estate lead, open a property deal for an approved property; test invalid/inactive/wrong-line property and duplicate creation. | Valid deal is same-line and attached to the lead/property once. Invalid/duplicate/cross-line attempts fail atomically. |
| TC-009 | Attempt to create a lead, perform a background check, access an unassigned/other-Telecaller lead, or query the other line. | UI offers no controls; API and RLS deny every attempt without leaking whether the target exists. |
| TC-010 | Verify stable round-robin with TEL-L1/TEL-L2 and TEL-R1/TEL-R2, inactive/reactivated staff, and manual Admin assignment. | Each line rotates independently in stable creation order; inactive staff are skipped and can rejoin; manual assignment/reassignment does not consume an automatic turn. |

## 9. Employee dashboard

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| EM-001 | Open Home/Tasks for Loans, Real Estate, and Both-line Employees; switch `EMP-B` lines; filter by type/status. | Today's, overdue, type, and status counts reconcile with the filtered own-assignment list for the selected concrete line. |
| EM-002 | Open own task and another Employee's/cross-line task by ID. | Own detail shows only minimum required lead/context fields. Foreign/cross-line task is denied without existence leakage. |
| EM-003 | Progress assigned -> in_progress -> completed; set blocked/cancelled where allowed; try invalid/terminal transitions. | Allowed transition and timestamps persist once. Invalid transitions fail without changing linked records. |
| EM-004 | Complete background checks with `clear`, `flagged`, and `inconclusive`; omit outcome; add bounded notes. | Completion requires one allowed outcome. Employee records the outcome but does not modify the underlying lead/application/deal. |
| EM-005 | Complete property-visit task as visited/no-show; omit the required no-show note; inspect linked visit. | No-show requires explanatory note. Valid completion updates task/visit consistently and only for the assignee. |
| EM-006 | For document collection, select types, upload/download/delete allowed files, complete the task, and attempt verification. | Files remain private and bound to own task. Employee can collect/remove eligible files but cannot self-verify; Admin review owns verification. |
| EM-007 | Attach property-visit feedback using image/PDF and camera; test 5 MiB/file, max 5/task, wrong type/signature, malware, duplicate, other task, and delete. | Valid sanitized private feedback is visible to assignee/Admin only. Limits and ownership fail closed. Clients, Agents, Telecallers, and unrelated Employees cannot fetch it. |
| EM-008 | Exercise contact visibility modes `allow`, `deny`, and `share_link`; create/copy/use/revoke invitation; reassign/close task and retry token. | Allow returns raw permitted contact; deny returns none; share-link returns no raw contact and creates an opaque 24-hour single-use URL. Revoked/used/expired/reassigned/closed tokens expose only `valid=false`. |
| EM-009 | As Real Estate assignee, list vehicle arrangements and complete/cancel one; try unassigned/cross-line arrangement. | Only own assigned arrangements appear, safe driver/pickup projection is shown, allowed terminal action persists, and foreign/cross-line action is denied. |
| EM-010 | Attempt to edit lead, loan, property, visit logistics, document verification, or another Employee's task. | No UI control and server/RLS denial. Employee writes stay confined to own task/document/feedback/assigned-arrangement paths. |

## 10. Sub Admin dashboard

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| SA-001 | Open Home with pending approvals, live banners/offers, content drafts, and recent referral payouts. | Counts/queue show only authorized content-domain data and own pending submissions; no full lead, loan, commission, Client PII, or Admin-only actions appear. |
| SA-002 | Create default, personalized, and action banner drafts for Loans/Real Estate/Both. Fill title/subtitle/CTA/deep link/priority/schedule; upload image; configure valid audience rules. | Valid draft is created. Personalized banner requires a supported audience; unknown/incompatible rules fail closed. Deep link must be safe same-origin. |
| SA-003 | Edit a draft, submit for approval, attempt self-approval, then inspect Admin approval/rejection. | Sub Admin can edit/submit own draft but cannot approve/reject. Pending is not live. Admin decision and rejection reason return to the queue. |
| SA-004 | Create/edit/schedule/activate/archive offers with line, discount type/value, optional code, dates, priority, and audience. | Valid lifecycle persists; invalid date/value/rule combinations fail. Targeted offers never appear anonymously or to Agents/staff. |
| SA-005 | Create/edit/publish/archive website content with unique slug, section, line/global choice, title, and body. | Content follows current direct-publish behavior with no Admin approval gate. Duplicate slug and bodyless publish fail. Public output matches status/line. |
| SA-006 | Create referral rules for each line with bonus, minimum conversions, optional cap; activate/deactivate and inspect recent payout activity. | Rules remain concretely line-tagged and conversion-gated. Sub Admin configures rules but cannot execute referral payout unless separately using the closed payout-request grant. |
| SA-007 | Submit a property and follow owner review state. | Same private media/approval guarantees as CL-R-008..010; Sub Admin cannot approve its own or any listing. |
| SA-008 | As `SUB-NO-GRANT`, open Payouts by nav/direct URL/API. Then grant `payout_requests` from Main Admin, retry the old session, sign in again, and revoke. | No grant: item absent and route/API/RLS denied. Grant/revoke immediately invalidates current access/refresh sessions. After normal re-login, signed feature claim permits/revokes exactly the closed capability. |
| SA-009 | As `SUB-GRANT`, search minimal recipient projection, create/list payout requests, and attempt approve/reject/link-divergence/cheque issue-clear-fail-reverse. | Can search minimal recipients and create/list only. Every checker, reconciliation, and manual-cheque transition remains Admin-only. Raw destination is not returned. |
| SA-010 | Attempt Agent/user management, full leads, analytics, audit, document verification, broadcasts, and cross-domain APIs. | UI omits them and server/RLS denies them without data leakage. |

## 11. Admin dashboard

### 11.1 Home, people, access, and support

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| AD-P-001 | Open Admin Home with/without pending agent/banner/property reviews, unassigned leads/tasks, open loans/deals, payout/referral counts. Follow every card/link. | Counts match target lists; capped queue states are explained; links reach the correct Admin surface; no stale or broken card exists. |
| AD-P-002 | As Main Admin, provision Sub Admin, single-line and Both-line Telecaller/Employee, and an additional Admin; validate required names/mobile/email/role/line and one-time temporary credentials. | Accounts have correct role/scope, temp password is displayed only once, forced-reset/session behavior works, and `both` never creates platform bypass for Telecaller/Employee. |
| AD-P-003 | As additional Admin, attempt to create Admin; as Main Admin, create up to three active additional Admins and attempt a fourth. | Only live Main Admin can create additional Admins. Hard cap is enforced atomically. There remains exactly one immutable Main Admin. |
| AD-P-004 | Grant/revoke Sub Admin `payout_requests`; inspect toggle, forced re-login, and audit. Attempt arbitrary feature string or grant to wrong role/inactive user. | Only closed valid grant persists; session version changes and refresh tokens revoke; audit contains IDs/action but no PII. Invalid target/feature fails. |
| AD-P-005 | Review Agent applications with KYC/RERA states; approve and reject with required reason; test duplicate/cross-line/collision conditions. | Approval issues unique Agent code and correct immutable line; rejection reason persists; private KYC is least-exposed and never logged; collision failures roll back. |
| AD-P-006 | Filter support tickets; move open -> in_progress -> resolved with staff-only response. | Valid transitions persist and notify the owner safely; unauthorized roles cannot triage; no sensitive free text enters audit/notification detail. |
| AD-P-007 | Review mobile-change request: Admin A attests an allowed proof with PII-free reference; Admin B completes using password. Try self-check, target Admin, collision, stale/inactive Admin, bad password, and concurrent completion. | Target, maker, checker are distinct; completion atomically changes identity-linked contacts, resolves ticket, revokes sessions/push, and enables new login while old login/session/reset fails. All invalid/race cases roll back. |
| AD-P-008 | In Field visibility, toggle supported fields for Agent/Telecaller/Employee; test locked mobile rules and Employee allow/deny/share-link modes. | Next API request projects fields server-side. Locked entries cannot be weakened. Unknown fields/modes fail closed. Policy change is audited without field values/contacts. |
| AD-P-009 | Use implemented account deletion path/API on `DEL-USER`; try Main Admin deletion and unauthorized deletion. | Eligible deletion scrubs PII, closes/delinks workflows, preserves legally retained finance, and revokes sessions. Main Admin/unauthorized targets are denied. Note any missing general Admin UI coverage under FR-2.2. |

### 11.2 Lead, task, loan, and property operations

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| AD-O-001 | In Lead assignments, assign an unassigned lead to an active same-line Telecaller; try inactive/wrong-role/wrong-line assignee. | Valid assignment persists and notifies after commit. Invalid assignee fails at service/database boundary. |
| AD-O-002 | In Assigned leads, release to queue or reassign Telecaller with optional reason; attempt to change Agent origin/owner. | Telecaller assignment changes safely and manual action does not consume round-robin. Agent origin/ownership remains immutable; expiry history is preserved. |
| AD-O-003 | In Task assignments, assign unassigned task to active same-line Employee; view visit feedback; try wrong-line/inactive/other-role assignee. | Valid assignment and feedback projection persist; invalid assignment fails. Feedback query is bounded and private. |
| AD-O-004 | Filter Loan applications; progress valid statuses; set sanction/bank/rate/fee/fee outcome; require reason for hold/reject; try invalid transition/bank availability/values. | Allowed change is atomic and visible to Client/Telecaller. Invalid transition/config/value makes no partial change. Only safe reason reaches Client. |
| AD-O-005 | Manage loan types: add/edit/disable; manage banks: add/edit/disable; update availability matrix; revisit Client Apply/Offers. | Changes require no deploy, persist across tabs, inactive items stop new selection but history remains, and matrix controls offered combinations. Shared field set remains v1 behavior. |
| AD-O-006 | Progress Property deals with allowed next status, required reject/on-hold reason, quoted price and booking amount; try invalid/backward/terminal transitions and negative values. | Valid terms/status persist and update Client workflow. No property payment collection appears. Invalid action is rejected atomically. |
| AD-O-007 | Review requested vehicle arrangement: enter complete driver/vehicle data, assign/reassign active Real Estate Employee, cancel/complete where allowed; test partial data, cross-line Employee, races, and terminal row. | Row-locked lifecycle and one-arrangement-per-visit hold. Safe projections/notifications update by role; PII stays out of audit/URLs. |
| AD-O-008 | Review pending property submission and processed media; approve or reject with reason; try while media is pending/failed, double/concurrent review, and non-Admin review. | Approval is Admin-only, waits for all media ready, creates one active listing, publishes only allowed assets, and is idempotent. Rejection publishes nothing. |
| AD-O-009 | In Document verification, filter subjects, inspect task and loan documents, mark verified, send back with required note, and retry a verified item as Employee. | Admin decision persists; rejection note is required; Client/Employee sees appropriate review state; Employee cannot self-verify. |

### 11.3 Finance and payouts

Never use real payout credentials or a live provider for these cases.

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| AD-F-001 | Enter a commission for an eligible converted deal with agreed amount/notes; try duplicate, ineligible, wrong-line source, and automated percentage expectation. | One manual Admin-authored commission persists with concrete line/source; duplicate/ineligible fails; no automatic rate engine runs. |
| AD-F-002 | Enter eligible processing-fee cashback; try over-fee, duplicate, non-disbursed, or wrong fee outcome; cancel pending entry. | Valid bounded cashback persists once. Invalid source/amount fails. Cancel creates no paid ledger credit. |
| AD-F-003 | Inspect referral payouts awaiting payment and open a payout only for converted eligible referral; try pending/not-converted/duplicate. | Conversion-gated source creates at most one payout; ineligible/duplicate fails. |
| AD-F-004 | Raise generic, commission, cashback, and referral payouts by UPI VPA, bank transfer, and manual cheque. Validate amount/type/line/recipient/destination; inspect API/UI afterward. | Money uses integer paise, configured caps and daily serialization. Raw VPA/account/cheque reference is not persisted or returned; only masked hint/fingerprint remains. |
| AD-F-005 | Additional Admin creates payout; view as same maker and as different Admin; same maker tries approval; different Admin approves/rejects. | Maker sees waiting-for-another-Admin and no usable self-approval. Server rejects maker=checker. Distinct Admin action succeeds once and is audited/notified. |
| AD-F-006 | Main Admin creates payout. | This sole standalone exception records explicit `primary_admin_standalone` approval without fabricated checker, while self-recipient, cap, idempotency, provider, audit, and ledger controls still apply. |
| AD-F-007 | Attempt self-payout, maker/checker recipient conflict, over-cap, duplicate idempotency key/source, concurrent approval, and repeated webhook/reconciliation. | All prohibited/duplicate/concurrent paths fail or converge to one transition and one ledger effect. No double credit/debit occurs. |
| AD-F-008 | For RazorpayX mock UPI/bank payout, test success, definitive failure, ambiguous result then reconciliation, invalid/replayed webhook signature/event. | Provider state reconciles idempotently. Ambiguous outcome is not retried or failed over automatically. Invalid/replayed webhook cannot move money. |
| AD-F-009 | For cheque, approve -> issue with reference/reason -> clear; separately issue -> fail; separately clear -> reverse. Race issue/clear/fail/reverse and repeat calls. | Approval creates no credit. Issue remains processing. Clear emits exactly one credit. Pre-clear failure emits none. Post-clear reversal emits exactly one compensating negative ledger row. References remain masked. |
| AD-F-010 | Inspect link-divergence/reconciliation access as Admin and Sub Admin. | Admin receives bounded reconciliation data; Sub Admin is denied even with payout-request grant. No raw payout destination appears. |

### 11.4 Content, notifications, analytics, and audit

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| AD-C-001 | Review CMS lists; approve/reject pending banner with reason; attempt authoring child routes as Admin. | Admin can review banner but only Sub Admin can use `/new` authoring routes. Approved schedule/audience governs serving; rejected banner never serves. |
| AD-C-002 | Review offers and website content lifecycle created by Sub Admin. | Current role/actions match implementation: Admin can inspect shared lists; unsafe/targeted public serving remains blocked. Do not infer an unimplemented content approval gate. |
| AD-C-003 | Preview and send broadcasts to each audience/line with valid same-origin link; test empty, oversized, unsafe link, and unauthorized sender. | Preview count matches recipients; send creates one notification per eligible active user, line filters correctly, unsafe destination fails, and action is audited. |
| AD-C-004 | Open Analytics; switch Leads/Loans/Deals/Agents; apply week/month/custom dates, line, one/multiple Agent filters, sort, pagination; export CSV and XLSX. | Tiles/table/team summaries reconcile with source rows and filters. Only platform Admin can query. Downloads are bounded, correctly typed, formula-safe, and signal 50,000-row truncation. |
| AD-C-005 | Open Audit log; filter action, load more, and inspect records from approvals, grants, payouts, mobile change, deletion, configuration, and broadcasts. | Append-only chronological entries identify actor/action/entity/line safely. No OTP, token, coordinates, mobile, destination, KYC, storage key, or free-form PII is present. |
| AD-C-006 | Confirm Admin receives notifications for each seeded major action and follows the link. | Exactly intended Admin recipients receive PII-minimized same-origin notifications after durable commit; failed/rolled-back action produces no false success notification. |

## 12. Cross-dashboard end-to-end journeys

Run these after the isolated role cases. Retain the created record IDs so each handoff is proven against the same workflow.

| ID | Journey | Required end-to-end result |
| --- | --- | --- |
| E2E-001 | Agent introduces lead -> same-line round-robin Telecaller assignment -> Telecaller follow-up -> matching Client OTP registration -> Agent/Client tracking. | Origin remains Agent, Telecaller is exact-line, OTP is binding authority, each role sees only its projection, and status/notification handoffs are consistent. |
| E2E-002 | Direct Client registration intent for Loans and Real Estate -> independent per-line leads -> independent Telecaller rotations. | One Client identity owns two isolated journeys; no `both` operational record exists; cursors and teams do not cross. |
| E2E-003 | Agent lead remains unconverted past fixed 30-day first-attribution deadline -> scheduler expiry -> open pool/manual/automatic assignment. | Expiry is idempotent, Agent history/countdown remains, Agent loses edit authority, converted/closed rows are excluded, and origin history is not transferred. |
| E2E-004 | Client loan application/media -> Telecaller transaction/status -> Admin terms/document verification -> disbursement -> fee cashback -> maker/checker payout -> Client transaction. | One coherent loan workflow, private media, valid status progression, one payout and one ledger credit, safe notifications, and no principal collection. |
| E2E-005 | Client property enquiry -> site visit with pickup -> Admin arrangement/Employee assignment -> Employee visit/feedback/pickup completion -> Client progress. | One enquiry/visit/arrangement chain, correct assignment/RLS, private feedback, safe Client logistics projection, and no property-payment capture. |
| E2E-006 | Client/Agent/Sub Admin property submission -> media processing -> Admin approval -> approved catalog/bookmark/enquiry. | Ownership stays with submitter, review is Admin-only, pending/reviewer assets stay private, public assets are sanitized/ready, and listing appears once. |
| E2E-007 | Public Agent application with KYC -> Admin approval/rejection -> Agent first login/Home. | Private KYC stays protected, approved identity gets unique code/correct line, rejected applicant gets safe status/reason, and collisions roll back. |
| E2E-008 | Sub Admin banner rule -> Admin approval -> eligible Client/Agent placement -> ineligible/anonymous check -> safe CTA. | Closed grammar, consent, line/role proof, precedence, non-leakage, and same-origin redirect all hold. |
| E2E-009 | Client referral code -> referred lead conversion -> referral payout request -> distinct Admin approval/provider or cheque settlement -> Client ledger. | Reward occurs only on conversion, source linkage is unique, payout is controlled/idempotent, and Client sees one paid transaction. |
| E2E-010 | Lost-mobile request -> Admin A proof review -> Admin B completion -> old/new session tests. | Maker/checker separation, atomic contact update, session/push revocation, old credential path denial, new login success, ticket resolution, and PII-minimized audit all hold. |
| E2E-011 | Main Admin grants Sub Admin payout requests -> old session invalid -> re-login -> request -> additional Admin approval -> revoke -> old session invalid. | Closed feature is signed and independently enforced in API/RLS; Sub Admin never gains checker/manual/reconciliation powers. |

## 13. Security and data-isolation attack matrix

Use browser devtools or an approved local API client. Never weaken RLS or use a production credential. For each valid request, alter exactly one authority-bearing value and confirm denial.

| ID | Attack/check | Expected result |
| --- | --- | --- |
| SEC-001 | Remove/expire/corrupt access token; reuse access after logout, deletion, password/mobile change, feature grant/revoke. | 401/forced re-auth; no cached protected response; refresh rotation/reuse protections remain effective. |
| SEC-002 | Change role, `business_line`, selected-line header/query, profile/user/Agent/Telecaller/Employee UUID, owner ID, or staff feature in the browser request. | Server derives authority from signed/live identity and trusted context. Tampering cannot widen access. |
| SEC-003 | Both-line Telecaller/Employee omits selected line, sends `both`, selects disallowed line, or queries unassigned row. | Request fails before RLS context is broadened; only one concrete permitted line and own assignment can succeed. |
| SEC-004 | Cross-user/cross-Agent/cross-Telecaller/cross-Employee/cross-line direct ID enumeration on every detail/download/mutation endpoint. | Non-disclosing 403/404, empty body of protected data, no timing/error text revealing owner or sensitive fields. |
| SEC-005 | Sub Admin/Admin UI hiding bypass attempts against forbidden API actions. | API dependency, service checks, grants, and RLS deny independently of UI. |
| SEC-006 | Upload filename/path traversal, MIME spoof, polyglot, oversized/dimension bomb, malware, unsupported codec/duration, replayed staging key, foreign key, pending/failed media access. | Validation/scanning/transcoding fails closed; storage keys never become authority; no executable/public/private cross-owner object is returned. |
| SEC-007 | Inject script/HTML, SQL-like text, formula prefixes, CRLF, URL schemes, and oversized Unicode into all free-text, search, export, notification, CMS, support, audit-reason, and file-name inputs. | Values are validated/escaped; no XSS, injection, header split, CSV/XLSX formula execution, unsafe redirect, or raw exception occurs. |
| SEC-008 | Payout duplicate/concurrency/webhook replay/self-payment/maker-checker/cap/provider-destination tampering. | State machine, row locks/CAS, idempotency, constraints, signatures, and audit prevent double/unauthorized money effects. |
| SEC-009 | Inspect responses, browser storage, console/network logs, server logs, audit, notifications, email, exports, URLs, and screenshots for secrets/PII. | No refresh token in JS storage, no OTP/password/token/raw destination/KYC/storage key/coordinate/full PII in prohibited locations; private responses use no-store. |
| SEC-010 | Revoke personalization/contact-share/push consent and immediately retry cached or previously issued access. | Revocation is effective on the next request; old share links/subscriptions/location data cannot remain usable beyond defined safe behavior. |

## 14. Accessibility, responsive, and resilience checks

| ID | Scenario | Expected result |
| --- | --- | --- |
| UX-001 | Navigate every priority-0 flow with keyboard only. | Logical focus order, visible focus, no trap, Escape closes dialogs, Enter/Space activates controls, and focus returns to trigger. |
| UX-002 | Inspect headings, landmarks, table headers, form labels/descriptions/errors, icon-button names, dialog names, status announcements, and color contrast. | Semantic structure is understandable without layout/color; dynamic success/error/loading state is announced. |
| UX-003 | Run at 320 px width, 390 px mobile, tablet, desktop, and 200% zoom. | No essential control/data is clipped or horizontally unreachable; tables/cards/dialogs/forms remain operable; sidebar/drawer works. |
| UX-004 | Use reduced motion and high text scaling; deny camera/clipboard/geolocation/notification permissions. | Motion is nonessential; text remains readable; permission denial has a usable fallback and never breaks the workflow. |
| UX-005 | Throttle network; force one API 401, 403, 404, 409, 422, 429, and 5xx on representative pages; use Retry. | Loading skeleton/status is stable, error is bounded/non-sensitive, retry is not a duplicate mutation, and stale data is not shown as success. |
| UX-006 | Double-click every critical submit/approval/payout/upload/status action and refresh mid-request. | Buttons disable or requests are idempotent; exactly one durable business effect exists. |
| UX-007 | Open two browser sessions and race lead assignment, task assignment, review, status, payout, mobile change, and media confirmation. | One valid winner; loser receives a controlled conflict; no lost update, double ledger row, duplicate listing, or split workflow. |
| UX-008 | Verify date/time/currency/empty/null/large-count rendering. | INR/paise, Indian date display, time zones, null placeholders, status labels, and pagination are consistent and do not overflow. |

## 15. Automated regression gates

Manual acceptance complements rather than replaces automated tests. Run fresh checks from the repository root and attach the final output or CI link.

```bash
./scripts/verify.sh --ci
```

If the wrapper cannot run on the host, execute and report every applicable constituent command; a skipped command is not a pass.

```bash
cd apps/api
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
uv run alembic heads

cd ../../apps/web
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

High-value existing browser suites:

- `apps/web/e2e/dashboard-navigation.spec.ts`
- `apps/web/e2e/lead-assignment.spec.ts`
- `apps/web/e2e/loan-media.spec.ts`
- `apps/web/e2e/personalization.spec.ts`

High-value API suites to retain in the evidence set include the role API tests, every `test_*_rls.py`, and the focused auth, lead, loan, property, upload/media, notification, support/mobile-change, payout, referral, reporting, and account-deletion tests under `apps/api/app/tests`.

## 16. Requirement coverage map

| Requirement area | Manual sections | Primary automated evidence |
| --- | --- | --- |
| FR-1.x line classification/isolation | 4, 6-13 | classification contract, API/RLS tests |
| FR-2.x roles/access/edit/visibility | 4-13 | navigation, role API, RLS, field-visibility tests |
| FR-3.x auth/onboarding/mobile change | 5, 12, 13 | auth, session, mobile-change API/RLS tests |
| FR-4.x leads/assignment/expiry | 7, 8, 11.2, 12 | Agent/Telecaller/Admin lead, round-robin, expiry, RLS tests |
| FR-5.x Agent lifecycle/KYC | 7, 11.1, 12 | Agent application/API/RLS tests |
| FR-6.x Loans/config/cashback | 6.2, 8, 11.2-11.3, 12 | loan/config/progress/document/cashback tests |
| FR-7.x Real Estate/visits/logistics | 6.3, 8, 9, 11.2, 12 | property/deal/visit/vehicle/submission/RLS tests |
| FR-8.x commissions | 7, 11.3, 12 | commission API/RLS/payout tests |
| FR-9.x referrals | 6.4, 10, 11.3, 12 | referral attribution/conversion/config/payout/RLS tests |
| FR-10.x disbursements | 11.3, 12, 13 | payout API/live/webhook/RLS/reconcile tests |
| FR-11.x notifications | 5, all handoffs, 11.4 | notification/link/push/Admin notify tests |
| FR-12.x personalization/CMS | 5, 6.1, 10, 11.4, 12 | banner/offer/personalization/public/RLS tests |
| FR-13.x media/uploads | 6.2-6.3, 9, 11.2, 12-13 | media/storage/processor/lifecycle/RLS tests |
| FR-14.x support | 5, 11.1, 12 | support/mobile-change API/RLS tests |
| FR-15.x contact privacy | 7-9, 11.1, 13 | field visibility/share-link/lead projection tests |
| FR-16.x analytics | 11.4 | reporting service/API/RLS/export tests |
| FR-17.x profile/account/deletion | 5, 11.1, 13 | auth profile/account-deletion/retention tests |
| FR-18.1 coarse location | 5, 13 | personalization/location/RLS/retention tests |

FR-18.2 Map/GMB is intentionally absent because CS-010 removed it from the active product scope.

## 17. Release exit criteria

A dashboard test cycle is acceptable only when:

- every route in Section 4 has a fresh allowed-role and denied-role result;
- all priority financial, auth, upload, business-line, ownership, and RLS cases pass;
- every end-to-end journey in Section 12 passes against one coherent record chain;
- no open Critical/High defect remains, and Medium defects have an explicit release decision;
- the two known partial requirements are reported honestly and not hidden by aggregate pass rate;
- all applicable automated gates have fresh results; unavailable commands are listed as unverified with reasons;
- evidence contains no secret, production data, or customer PII;
- migration check reports exactly one Alembic head;
- the tested commit, environment, account/data manifest, result counts, and defect links are recorded.

### Final summary template

| Area | Passed | Failed | Blocked | Not run | Defects/notes |
| --- | ---: | ---: | ---: | ---: | --- |
| Shared shell/profile/support | | | | | |
| Client Loans | | | | | |
| Client Real Estate/referrals | | | | | |
| Agent | | | | | |
| Telecaller | | | | | |
| Employee | | | | | |
| Sub Admin | | | | | |
| Admin people/operations | | | | | |
| Admin finance | | | | | |
| Admin content/analytics/audit | | | | | |
| Cross-dashboard journeys | | | | | |
| Security/RLS/privacy | | | | | |
| Accessibility/responsive/resilience | | | | | |
| Automated gates | | | | | |

Release recommendation: **Go / Conditional Go / No-Go**

Decision owner/date:

Residual risks and explicitly unverified commands:
