# Application-wide UI refinement verification

Date: 13 September 2026. Source baseline: `1cce1a7`.
Contribution branch: `feat/production-environment-evidence`.
Status: implemented and reviewed; [review PR](https://github.com/brollysolutions/client1/pull/299). Existing release gates remain open.

## Approved scope

The final approved direction pairs brand navy `#293681`, sky accents and pale
sky blue `#F0F7FC`
with white reading, form and table surfaces. Public pages retain the original
full-color logo. Authentication uses a navy illustration panel and the same
full-color site logo in a separate row above the back link;
dashboard rails and mobile drawers use navy with the original logo rendered
white. The light dashboard header uses the navy logo.

Shared spacing, headings, controls and card treatments carry through public,
authentication and all six dashboard roles. All homepage content bands use the same pale sky surface; closing calls to
action and the footer use navy. White is reserved for reading/card/form surfaces.
Public, auth, dashboard and error-page actions share the same navy token. Legacy
blue/teal action aliases and pale blue/grey washes now resolve to these shared
colours. The sponsor strip retains its layout with a white plate and sky backing
in place of its beige gradient. Status and notice colours remain distinct. The footer's
original logo sits on a white backing. The user requested the original banner
design: the carousel implementation and its existing unit tests match the
baseline exactly. Small-screen artwork visibility, image delivery, text-only
campaigns and carousel navigation are preserved. Public navbar dropdowns
are wider, retain their existing icons and category order, contain no image
thumbnails, and allow long link labels to wrap.
Desktop menus appear from 1280px; narrower headers retain the mobile menu.
Calculators precedes Earn with Us in both headers. Its matching icon-only
dropdown includes all 18 existing tools grouped into Loans, Property, Credit
Cards and Insurance, plus the calculator hub link. The small menu catalogue is
checked against the full calculator registry without shipping its explanatory
copy in the shared header. Existing pointer, keyboard and mobile navigation
behaviour is retained.
The services search toolbar uses a white field, navy category controls and
clear keyboard focus while preserving debounced filtering, URL state, scrolling
and stalled-navigation recovery.

`/loans` now includes all 16 existing navbar service types: 11 loans, four
insurance types and one credit-card category. The service directory joins
anonymous published product metadata onto that existing marketing list. All 16
services have dedicated pages linked directly from the navbar and service cards.
The ten types without published products in the synthetic fixture render
service-specific overviews and enquiry prompts with the existing contact journey.
Every service page includes the same provider comparison section and filters.
Unpublished overviews show a clear empty state and contact enquiry; provider
records and application links remain restricted to published API data. Filter
submission keeps query state and returns to the comparison section. Canonical
metadata, social images and sitemap entries cover all 16 pages;
the plural credit-cards URL redirects to the existing credit-card route and
retains its query parameters. Unknown unpublished slugs remain not found.
Additional published service types
remain discoverable, including those beyond the first API page. Search and
category counts cover the complete directory, and legacy footer anchors reach
the corresponding cards. A streamed-route hash recovery handles navigation
that otherwise targets the loading skeleton before its service card exists.
No provider record is created. Public publication remains Admin-controlled.

The latest user clarification extends application fields and settings to every
public service in Admin Financial Products. Fifteen public slugs already had
product-specific forms; a data-only migration adds OD/DOD while retaining
Equipment Financing, for 17 configured Admin products. OD/DOD starts active for
dashboard intake and unpublished publicly, with descriptive copy ready for Admin
publication. It uses the existing loan workflow and form contract. Same-slug
Admin records are never overwritten; rollback retains the data to protect saved
configuration and submission references. The catalogue shows field counts.
School Funding copy and artwork now match its established educational-institution intake.

The user requested replacing service illustrations with generated photography.
Seventeen service-specific WebP assets total 1,858,922 bytes before responsive
Next Image delivery: the 16 marketing types and existing equipment financing.
The original full-color logo is overlaid at the top-left of each public card
and service-page image.
Original illustration/logo files remain intact. See [image provenance and
prompts](SERVICE-IMAGES.md). The loans loading grid follows the new artwork
plates and search toolbar; service detail routes have their own matching fallback.

Dashboard workspaces omit all published, action and fallback promotional banners,
including the former conversation/progress banner. Eligible offer cards remain
usable and campaign editors retain their noninteractive previews. Admin and
sub-admin sidebars share a grid track with the workspace: the navy background
stretches with long pages and the navigation stays within the viewport. The
menu uses a thin sky scrollbar and contains wheel scrolling, while the logo
and account controls stay in place. Direct links reveal the selected item
inside the menu, including after account data or a viewport resize changes its
available height. Labels wrap, menu targets are at least 44px, and mobile
drawers use dynamic viewport height with bottom safe-area padding.

Calculator illustrations were rendering at 300px inside their intended 460px
column because the native picture wrapper shrink-wrapped its SVG. A scoped
width correction restores the original 460px display size and aspect ratio,
with the existing desktop-only visibility and all original assets preserved.

Every authentication shell includes Privacy Policy and Terms of Use links with
visible and screen-reader indications that they open separately. Registration
adds the approved reminder. There is no checkbox, consent record, authentication,
endpoint, schema structure, financial calculation, role-policy or dependency change.
The Admin extension above adds one catalogue row through a new migration. Original
illustration and logo files, font configuration and section order remain.
Copy changes cover the approved registration reminder, service overviews and
enquiry prompts, the directory's service/provider distinction and removal of
dashboard promotional banners. The new enquiry prompts describe discussion
topics and make no new rate, eligibility or provider-availability claims.

The keyboard audit reproduced lost focus after closing the mobile workspace
drawer. Its opener now receives focus on close. Expanded Explore navigation also
reveals its existing categories when reached by keyboard. Navigation destinations
and role-specific expansion behavior remain unchanged. Shared, labelled loading
regions replace blank or spinner-only page fallbacks. All 77 page modules inherit
a tested route fallback; the browser gallery covers 18 actual loading layouts,
and the route sweep delays and releases real client requests to check loading
transitions separately from static markup. Pending form submissions retain their
existing operation feedback.

The card-category redirect exposed a separate loading gap: the streamed server
redirect cleared the page while the product destination was still downloading.
A client replacement navigation retains the shared workspace skeleton during
that wait. The destination still comes from the published catalogue and the
automatic category skip and replacement history behavior are preserved. A
controlled delayed-response regression reproduced the blank page before the fix.

The Lighthouse review also reproduced inherited accessibility defects. Slider
names and value descriptions now belong to the actual focusable slider thumbs,
with separate minimum/maximum names for property ranges. EMI preset tabs own a
real panel containing their inputs. Inactive tab text uses an opaque contrast
colour, and public property categories follow the page H1 with H2 headings.
Calculator defaults, maths, URL state, filters and keyboard value changes are
unchanged. Focused browser regressions cover these semantics and interactions.

## Verification scope and artifacts

All observations use synthetic fixtures and isolated local production copies.
Real env files, accounts, customer records and provider delivery are excluded.
The existing GET-only catalogue fixture has an opt-in `--published-banners`
mode for two bundled image campaigns and a text-only campaign. Default fixture
behavior continues to return an empty CMS collection for fallback coverage.

Fresh before screenshots cover 17 page families at 320, 390, 768 and 1365 pixels,
plus published campaigns at those widths. The cached baseline production
artifact matches all 767 runtime/contract source files; only the browser release
configuration differs. This is fresh browser evidence against that artifact,
not reuse of its historical test results.

Google font downloads stalled in the local build environment. The isolated
build therefore reads the exact eight previously delivered WOFF2 files through
Next's font response test facility. An initial cache-formatting error omitted
font emission: those builds and the interrupted browser run are excluded from
visual and performance acceptance. The corrected cache passes Next's own font
discovery function with eight readable files and two Latin preloads. The final
production build exits 0, generates 95/95 routes and emits all eight font files
with byte-for-byte matching baseline hashes. Browser font loading is checked
independently in the final suite.

Ignored evidence is retained under `build/frontend-audit/ui-before/` and
`build/frontend-audit/ui-after/`: source identity, build/serve logs, font hashes,
screenshots, browser results and Lighthouse HTML/JSON reports. The local server
uses Next production output behind the existing gzip fixture on port 3201 and
the synthetic catalogue on 4311. This does not verify Linux standalone
packaging, TLS, real backend authorization or production deployment.

## Results and remaining gates

Fresh verification: web lint/typecheck pass; 103 files / 692 unit tests pass,
with affected menu/registry and provider/loading tests repeated after final edits.
Production build exits 0 at `2026-09-13T15:00:09.786Z`, generating 95/95 routes.
The final broad browser sweep passes 252/253 cases at 320/390/768/1365px, covering all
roles, populated/empty/loading/error/validation states, original published/fallback
banners, legal links, menus and all 17 Admin form editors. The remaining delayed
redirect test used an unreliable paused gzip stream and a generic loading-region
selector. It now holds the complete real response and waits for the named redirect
region; it and a new ordinary-navigation case pass three runs each (six passes).
All 254 distinct current cases therefore have passing evidence across broad and
targeted gates, not one uninterrupted full-suite pass. The provider filter-reset
defect discovered in browser review is fixed and passes the broad final run.

The isolated Linux API suite passes all 1,990 tests; focused configurable-form,
catalogue and RLS tests pass 87 cases. Empty-database migrations and exactly one
Alembic head pass. API Ruff/format passes across 508 files. Repository scripts:
198 passed and one expected Windows skip. Native `./scripts/verify.sh --ci` cannot
complete because Windows greenlet fails to import; component gates were run
separately using the existing locked Linux image and disposable PostgreSQL/Redis.

A new synthetic Admin was created only in the requested isolated local review
database. Browser verification uses the real API for first-login password reset,
all 17 current form editors, refresh after reload, logout and fresh login.
The clean migration history retains two additional inactive legacy products.
The local review uses localhost with the unchanged Secure/HttpOnly cookie;
helper retries during startup/session initialization are separate from the
completed functional checks. Credentials
remain private and are excluded from Git and the PR. No real environment files,
accounts, customer data or external message providers were used.

Final resource/SEO/Lighthouse evidence and exact limitations are recorded in
the observations below. Existing mobile performance,
older-page metadata/indexability and dependency/release gates remain open.
Complete Linux standalone web packaging, the separate API-backed navigation/
media/personalization Playwright suites, hosted CI and deployment are unverified.

The original eight font files and illustration/logo assets match the baseline.
The source snapshot and delivered School Funding WebP are independently checked
against the final build. The known Windows standalone symlink-copy warning
remains; a successful local Next build is not proof of Linux standalone packaging.

Browser command: `pnpm test:e2e` with `mobile-layout`, `ui-refinement`,
`sidebar-layout`, `loading-pages`, `brand`, `registration-profile`,
`lead-assignment`, `financial-services`, `service-directory`,
`admin-financial-products` and `frontend-performance` (253 cases, one worker,
252 passed / one delayed-navigation failure), followed by `ui-refinement --grep
"card-category redirect" --repeat-each 3` (six passes, two distinct cases).
Before views retain 17 family cases plus a published-banner case; the baseline
drawer-close focus defect is reproduced and corrected. Prior broad runs and
failed traces remain separate from the successful targeted correction.

All 18 final resource observations (nine routes at 390/1440px) return HTTP 200
without page errors or horizontal overflow. These are local transfer observations,
not field performance. The 45-URL SEO audit exits 1: all 16 financial-service
pages pass, while older routes retain metadata/title/description/OG-image findings,
root trailing-slash normalization and synthetic-property sitemap/auth-link issues.
Invitation noindex is preserved; inherited general auth/dashboard noindex gaps
remain. There is no blanket search-readiness claim.

Final Lighthouse 13.4.1 smoke measurements cover Home, EMI and School Funding on
mobile and desktop after the provider/menu changes. The first six attempts exit
1 with three valid reports and three `NO_NAVSTART` failures (Home mobile and
both School Funding devices). One separate replacement per failed trace exits 0,
yielding six valid samples in total. Failed reports remain retained and excluded
from the table. These are single valid lab samples, not repeated-run medians or
field Core Web Vitals. Budgets remain performance >=90, LCP <=2500ms,
TBT <=200ms and CLS <=0.1. All three mobile samples breach performance/LCP/TBT;
all three desktop samples meet these budgets. The six accessibility scores are
100; automated scores do not certify complete accessibility.

| Page | Device | Performance | LCP (ms) | TBT (ms) | CLS | Accessibility |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/calculators/emi` | desktop | 93 | 878 | 191 | 0.000 | 100 |
| `/calculators/emi` | mobile | 76 | 3456 | 582 | 0.000 | 100 |
| `/` | desktop | 97 | 883 | 126 | 0.000 | 100 |
| `/` | mobile | 69 | 3706 | 840 | 0.000 | 100 |
| `/loans/school-funding` | desktop | 94 | 1026 | 159 | 0.000 | 100 |
| `/loans/school-funding` | mobile | 56 | 4299 | 1788 | 0.000 | 100 |

Earlier measurements for Home, Loans, EMI, Real Estate and School Funding are
retained under `ui-admin-final/lighthouse`; the EMI mobile `NO_NAVSTART` trace
is invalid and is not counted as a passing sample. Mobile performance remains
an open gate. No performance thresholds or security gates were weakened.

Design review applies Taste/Impeccable/Kowalski with Apple Design's restrained
feedback, spatial consistency, typography, focus and reduced-motion guidance.
Security review traces the data-only seed and versioned Admin forms through
existing guards, publication boundaries, safe internal links, escaped structured
data and fresh synthetic tests. No change-owned finding remains. This does not
certify full assistive-technology support or any production deployment.

Evidence (ignored): `build/frontend-audit/ui-before/`, `ui-after/`,
`ui-admin-dev/`, `ui-admin-api/`, `ui-admin-final/` and `ui-navigation-final/`.
See [image provenance](SERVICE-IMAGES.md) for generation prompts and original
asset preservation. Delivery: [review PR](https://github.com/brollysolutions/client1/pull/299).

Design/Apple, security and complete-diff review found no remaining change-owned
defect in the verified scope. Requirement coverage remains 100% of the same 79
requirements. Next priority: dependency remediation and outstanding performance,
target-host, approved-provider and legal/operational release evidence. No merge
or deployment was performed.
