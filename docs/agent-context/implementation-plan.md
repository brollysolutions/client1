# Living implementation plan

Status: **Derived, actively maintained plan**

As of: **2026-08-23**

Evidence baseline: `abcc1fd`
([PR #175](https://github.com/brollysolutions/client1/pull/175)).

## Outcome

Complete the approved Loans and Real Estate scope without weakening
authorization, business-line segregation, PII/KYC handling, payout controls,
or auditability. The current evidence-based implementation coverage is
approximately **99.4%** across 79 active requirements; see
[`feature-status.md`](feature-status.md) for the
calculation and requirement-level gaps.

## Working rules

Before the first implementation edit for every feature, the agent must:

1. read this plan, `feature-status.md`, `current-implementation-state.md`, the
   approved SRS/feature list, `SECURITY.md`, and the relevant nested
   `AGENTS.md`;
2. trace the affected UI, client wrapper, generated contract, API route,
   dependency/authorization guard, service, model, migration/RLS policy, job,
   and tests as applicable;
3. tell the user the recommended Codex model and reasoning effort, with a
   one-sentence reason, before implementation begins;
4. mark exactly one plan item **In progress**, including its branch or PR; and
5. define acceptance criteria, non-goals, security invariants, and verification.

Before shipping, the same PR must update this plan and `feature-status.md` with
fresh evidence. Automation checks that both files accompany product-code
changes; human/agent review remains responsible for the truth of their content.

## Model and effort policy

Use the lowest effort that safely handles the feature. Current Codex guidance
describes GPT-5.6 Sol as the choice for complex, open-ended, high-value work and
Terra as the everyday full-stack workhorse. Higher effort is appropriate as
planning depth, sources, tradeoffs, or security impact increase.

| Work shape | Recommended model | Effort | Typical use here |
| --- | --- | --- | --- |
| Narrow, established pattern; low-risk UI/docs/test work | `gpt-5.6-terra` | Medium | Copy, bounded UI wiring, isolated test coverage |
| Bounded full-stack feature with settled behavior | `gpt-5.6-terra` | High | Reporting/export completion, notification link audit |
| Cross-stack or ambiguous feature | `gpt-5.6-sol` | High | New workflow/entity, scheduler behavior, multi-surface changes |
| Auth/RLS, PII/KYC, uploads, payouts, or complex migrations | `gpt-5.6-sol` | Extra High (`xhigh`) | Field visibility, mobile change, media, location personalization |
| Exceptional systemic redesign after smaller approaches fail | `gpt-5.6-sol` | Max | Identity/RLS redesign only; not a routine default |

Do not use Ultra by default. It introduces subagent execution and is useful
only when the user explicitly authorizes parallel agent work and the task
splits into genuinely independent streams.

The recommendation must be reassessed at feature start. The table below is a
default, not permission to skip the pre-implementation announcement.

## Prioritized active backlog

FR-18.2 Map/GMB integration was removed from the product scope by CS-010 on
2026-08-09. It is not an active, deferred, or release requirement and is not
included in completion coverage.

| Priority | Feature / requirements | Why now | Planning model / effort | Implementation model / effort | Exit criteria |
| ---: | --- | --- | --- | --- | --- |
| 0 | Real-estate Client dashboard property presentation: subtype default artwork, populated-only Explore rows, uniform cards, and RERA-verified corner treatment (direct user-reported UI change; no requirement or completion-percentage change) | **Done — PR #233 update** on `claude/20260825-211218-remove-browse-by-type-section-in-explore`. Added nine local generated subtype fallback images and a generated-contract-complete resolver: approved listing image wins; subtype artwork follows; category representative covers legacy rows; fallback never becomes managed media. Home’s category cards now share this artwork family. Explore derives and renders only populated category carousels, while Home remains category discovery. Dashboard full/mini cards now use one visible 4:3 media band, clamped/reserved content slots, and fixed footer geometry; a folded corner appears only for server state `verified`, with the RERA number retained in content. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | `pnpm lint`, strict `pnpm typecheck`, focused 8-test property suite, and the full `pnpm test` suite pass. `pnpm build` compiles, typechecks, and generates all 93 pages, then hits the established Windows standalone-symlink `EPERM`; host builds also cannot resolve Docker-only `api` for static fetches. The focused Playwright journey was attempted twice after restart but the first died before startup and the warm retry remained at login because the local app/API connection could not complete authentication; neither reached the changed pages. Design, security, and maintainer diff review found no actionable issue. No API, contract, migration, RLS, upload, or new external runtime surface changed. |
| 0 | Real-estate dashboard search-bar redesign: shared animated omnibox across Home/Explore/category/Bookmarks, Explore's "Browse by property type" strip removed, Home's category pills replaced with illustrated cards (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR #233](https://github.com/brollysolutions/client1/pull/233)** on `claude/20260825-211218-remove-browse-by-type-section-in-explore`. Three direct user requests on top of PR #232: (1) remove the "Browse by property type" section from Explore; (2) redesign Home's quick-search field with a nicer design/animation, reused identically everywhere the property search bar appears; (3) replace Home's "Browse by property type" pill buttons with illustrated cards. Mid-review, live testing surfaced a fourth: Home's quick search showed no location/property suggestions while Explore's did, which the user flagged and asked to be fixed as part of the same consistency goal. New `features/real-estate/search-field-chrome.tsx` (`SEARCH_FIELD_SHELL_CLASS`, `SearchFieldIcon`, clear-button and Search-button motion classes, a `.search-field-shell` CSS class in `globals.css` animating a focus-triggered sheen via `background-position` — no Tailwind utility exists for that) is now the one visual/animation source both `PropertySearchBar`'s omnibox (Explore/category pages/Bookmarks) and Home's quick search render through. New `features/real-estate/property-suggestions.tsx` extracts the suggestion-matching (`useSuggestionMatches`) and grouped-results rendering (`SuggestionsList`) that used to live only inside `PropertySearchBar`, so Home's quick search now shows the same Localities/Cities/PIN codes/Property types/Properties popover as you type; picking a suggestion hands off straight to `/dashboard/explore?<facet>=<value>` (Home owns no filter state or results grid of its own) instead of setting a local filter. Home therefore now calls `useProperties()` again, but only to build the suggestion index — loading/error are deliberately unread (same tradeoff already established for `dashboard-property-detail.tsx`'s parallel catalog fetch), and Home still renders no results grid, filters, or live category counts. `RE_CATEGORIES` (`lib/real-estate.ts`) gained an `illustration` field reusing the existing per-subtype mega-menu SVGs (`public/illustrations/menu/properties/*.svg`, from `components/navbars/properties-menu.ts`) rather than commissioning new art; Home's category section now renders `ExploreArtCard` (already established on the loans Explore hub) instead of pill `<Link>`s. `CategoryStrip` (Explore's "Browse by property type" grid) is deleted outright along with its test, since removing it without a replacement would have silently reintroduced the exact zero-count-category-disappears defect PR #231 fixed (`property-row.tsx` returned `null` for an empty category) — instead, the dashboard `PropertyRow` itself now renders a "No listings yet" state with a "Browse {category}" link for a zero-count category, so every category stays reachable from Explore's idle state without a separate strip above the carousels. `components/ui/input.tsx`'s `Input` gained explicit `ref` forwarding (React 19 ref-as-prop, no `forwardRef` needed) so Home's clear button can refocus the field, mirroring `PropertySearchBar`'s existing `inputRef` pattern. | Claude Sonnet 5 / High | Claude Sonnet 5 / High | `apps/web`-only UI/animation work reusing already-live, already-RLS-scoped APIs (the same `useProperties()` catalog fetch Explore/category/Bookmarks already call) and existing illustration assets — no auth/RLS/PII/contract/migration surface, matching the PR #231/#232 precedent this builds directly on. Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (70 files, 447 tests, including new `lib/real-estate.test.ts` guarding `RE_CATEGORIES`' illustration files exist on disk and new `features/real-estate/property-row.test.tsx` covering the zero-listing empty-state/reachability regression) all pass. `pnpm build` compiled, typechecked, and generated all 93 pages before the same pre-existing Windows-host `EPERM` standalone-symlink failure documented elsewhere in this table. Live-verified via Playwright MCP against the restarted `client1-web-1` container, logged in as the seeded demo Client ("Charan Client"): Home's search field shows the animated shell/icon and, typing a real locality, the same grouped suggestion popover Explore shows, and picking "Baner" navigates straight to `/dashboard/explore?locality=Baner` with the filter chip and 5 matching properties already applied; Home's category section renders as illustrated cards linking into each category; `/dashboard/explore`'s idle state shows no "Browse by property type" heading anywhere, and its zero-count categories (Residential Houses, Commercial in the seeded data) each render "No listings yet." with a working "Browse {category}" link. `pnpm exec playwright test e2e/dashboard-navigation.spec.ts -g "Client can search locations manually across dashboard property surfaces"` passes (48.7s) on a warm run; a first attempt hit the 5-second default `toHaveURL` assertion timeout immediately after a container restart, but the saved failure screenshot showed the navigation had in fact completed (Explore fully rendered with the expected result) — a cold-Turbopack-compile timing artifact already documented elsewhere in this table for this same spec, not a functional defect, confirmed non-recurring on the warm re-run. That spec's own locator for Home's field was updated from `getByRole("textbox", ...)` to `getByRole("combobox", ...)` since cmdk's `CommandInput` (now used by Home too) exposes combobox semantics, not a plain textbox. The broader `dashboard-navigation.spec.ts` role-scenario suite was not re-run in full, to conserve the shared dev stack's per-IP OTP registration quota for future work; none of its other scenarios touch real-estate Home/Explore. `design-review` was not separately run this pass; the design intent (consistent animated search chrome, illustrated category cards, preserved zero-count reachability) was verified directly against the live app instead. |
| 0 | Real-estate Home/Explore differentiation: Home rebuilt as a personal "my property journey" status view (bookmarks, enquiries, site visits, quick search hand-off), Explore inherits Home's former catalog-browsing content (category strip, per-category carousels) (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR #232](https://github.com/brollysolutions/client1/pull/232)** on `claude/20260825-153444-as-home-and-explore-showing-same-ui`. User-reported: "Home and Explore showing same UI." Confirmed by tracing both component trees — `RealEstateHome` and `RealEstateExplore` (`features/dashboard/explore-line-switch.tsx`) both fetch the same catalog via `useProperties()`, both render `PropertySearchBar` + filters, and both idle-state a category-browse grid followed by listing carousels. Root cause: PR #223 moved the real-estate Explore hub "unchanged" when loans Explore was redesigned, and PR #231 redesigned Home in isolation — neither pass gave the two pages a distinct job, so both converged on "browse the catalog." The loans line already solves this (Home = personal application-status table, Explore = catalog discovery hub); real estate has the same personal data available and unused (`useBookmarks()`, `getEnquiries()`, `getSiteVisits()`, each already backing their own full dashboard page) but Home never surfaced it. Rebuilt Home as the personal status view mirroring `LoansApplications` (bookmark/enquiry/site-visit `MetricCard`s, a quick-search `<form>` that hands off to `/dashboard/explore?q=...`, and lightweight category quick-link pills with no live counts — Home no longer fetches the property catalog at all); moved Home's former catalog-browsing content (`CategoryStrip` + per-category `PropertyRow` carousels) onto Explore's idle state, replacing its lower-fidelity local `CategoryTile` grid + single "Featured" row; extracted `useEnquiries`/`useSiteVisits` hooks (mirroring `use-properties.ts`'s shape) out of `enquiries-view.tsx`/`site-visits-view.tsx` so Home and their existing full-page views share one fetch implementation, with `useSiteVisits` exposing `setSiteVisits` so the existing cancel-visit optimistic update keeps working unchanged. Found and fixed a real bug during browser verification: `MetricCard` renders `value` inside a `<p>`, and the shared `Skeleton` component renders a `<div>` — nesting a block element inside a paragraph is invalid HTML that broke hydration and silently broke the quick-search form's click handler (confirmed via Playwright MCP console inspection: React DOM-nesting warnings, then the Search button stopped triggering navigation). Fixed with an inline `<span>`-based skeleton local to `real-estate-home.tsx` instead of the shared block-level one. Scope is `apps/web` only, no API/contract/migration change. | Claude Sonnet 5 / High | Claude Sonnet 5 / High | `apps/web`-only UI/data-wiring over already-live, already-RLS-scoped APIs (bookmarks/enquiries/site-visits), no auth/RLS/PII/contract/migration surface — same tier as the PR #231 precedent it builds on. Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (69 files, 446 tests, including new `use-site-visits.test.ts` covering the extracted `nextUpcomingVisit` pure helper) all pass. `pnpm build` was not re-run this pass (unaffected `output: "standalone"` Windows symlink limitation already documented against PR #231; no build-relevant surface touched here). Browser-verified end to end via Playwright MCP against the live local stack after a `docker restart client1-web-1`: `/dashboard` shows the personal status view with zero bookmark/enquiry/site-visit counts and their empty-state hints for a freshly registered account, no hydration errors; typing a locality into the quick search and submitting lands on `/dashboard/explore?q=<value>` with results already filtered by that query; `/dashboard/explore` independently shows "Explore properties" with the category strip (live counts from real seeded data) and per-category carousels, no console errors beyond pre-existing unrelated MinIO image-proxy 500s. The extended Playwright spec `"Client can search locations manually across dashboard property surfaces"` (`e2e/dashboard-navigation.spec.ts`) passes in isolation with a fresh OTP quota, covering the same flow plus the subtype-facet filtering from PR #231. The full spec's other, unrelated failures in this run are the same pre-existing `OTP_RATE_LIMIT_PER_IP=10` dev-environment exhaustion already documented against PR #231 (registration fails before reaching any page under test); one of the blocked tests (`"Client retains the redesigned Loans and Real Estate workspaces"`) was inspected and does not assert on any content this change touches. Exit criteria: `/dashboard` shows a personal status view (bookmark/enquiry/site-visit counts, quick search hand-off to Explore) with no property catalog fetch — met; `/dashboard/explore` shows the category strip and per-category carousels Home used to have — met; `useEnquiries`/`useSiteVisits` hooks extracted and reused by their existing full-page views with no behavior change — met by construction (identical JSX, typecheck-verified); Vitest coverage for the new hooks and the rebuilt Home — met for the one hook with real logic (`nextUpcomingVisit`); `use-enquiries.ts` and `RealEstateHome` itself are untested at the unit level (no `jsdom` dependency is installed in this repo to support hook/DOM rendering tests, and adding one was out of scope for this change) and are covered by the e2e flow instead; Playwright coverage distinguishing the two pages' headings/content — met; `pnpm lint`, `pnpm typecheck`, `pnpm test` green — met; `design-review` run over the changed UI — met, no blocking findings (two minor deliberately-unfixed notes recorded in the PR body). |
| 0 | Real-estate client dashboard home rework: demo placement banner removed, property-subtype search/filter facet, per-category facet map, category coverage strip (direct user-reported UI change; no requirement or completion-percentage change) | **Done - [PR #231](https://github.com/brollysolutions/client1/pull/231)** on `claude/20260825-realestate-home-search-filters`. The real-estate client home has never had its own redesign item: every recent pass scoped to the loans line (PR #222-#226) or the public `/real-estate` pages (PR #195, #216, #217). Four defects reported by the user and confirmed against the running dev stack: (1) the "Demo Real Estate workspace / Synthetic campaign / Explore properties" banner is a `seed_demo.py` row rendered through the generic `PersonalizedPlacements` slot the loans home already dropped in PR #222; (2) dashboard search and filters know only the 5 coarse `PropertyCategory` values while the API, contract, public nav, and submit forms all carry 9 `PropertySubtype` values, and `mapProperty` already writes `propertySubtype` onto every `REListing` — the UI simply ignores it; per-category filtering is one crude `RESIDENTIAL_CATEGORIES` boolean; (3) `property-row.tsx` returns `null` for an empty category, so `houses` and `commercial` (0 active rows each vs apartments 288, villas 7, plots 1) vanish silently; (4) `RECategory` is hand-declared in `lib/real-estate.ts` and re-listed again in `use-property-filters.ts`, so a backend category addition is a compile error in `lib/properties.ts` but silent in both dashboard copies. Scope is `apps/web` only. Explicit non-goals: no server-side property search (`GET /api/v1/properties` is unfiltered by documented design and 296 active rows filter fine client-side), no `structured_details` facets (255 of 296 active rows are `NULL`), no seed-data change, no API/contract/migration change. | Claude Opus 5 / High | Claude Sonnet 5 / High | `apps/web`-only UI plus pure-TypeScript filter logic with no auth/RLS, PII/KYC, payout, contract, or migration surface, so the plan's lowest tier applies; matches the PR #223/#224 precedent for a dashboard UI redesign of comparable breadth. Exit criteria: demo banner absent from the real-estate client home; subtype facet present in filters, chips, omnibox suggestions, and URL state; facet visibility driven by a per-category map rather than a residential boolean; all 5 categories discoverable including zero-count ones; category and subtype unions derived from the generated contract with a type-level completeness guard; Vitest coverage for the filter and facet-map logic; Playwright coverage for the banner removal and the subtype facet; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the dashboard e2e spec green; `design-review` run over the changed UI. |
| 0 | Property catalog 500 fixed: legacy `structured_details` no longer breaks `GET /api/v1/properties` (direct user-reported Docker/API error; no requirement or completion-percentage change) | **Done — [PR TBD](https://github.com/brollysolutions/client1/pulls)** on `claude/20260824-130948-lets-work-on-compare-loan-offers-page`: `GET /api/v1/properties` re-validates each row's `structured_details` JSON through the same strict, closed discriminated union used for submission input, with no tolerance for rows that predate a since-tightened field requirement. 37 dev-DB rows have `project_residence.amenities_description = null` (now required, non-nullable), and one bad row poisoned the whole list — reproduced live via `curl` against the running `client1-api-1` container (500), confirmed pre-existing and unrelated to the same-branch Compare Loan Offers work above. `app/api/v1/public_catalog.py` already solved this exact problem for the anonymous public catalog (`_public_property_data`: validate `structured_details` separately, fall back to `null` with a logged warning on failure); that pattern was never applied to this authenticated endpoint. Mirrored it in as `_property_data`, used by both `list_properties` and `_to_read` (`get_property`/`update_property_status`). Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern bug fix (no auth/RLS/payment/PII/contract/migration surface — no schema, endpoint shape, or access-control change; purely defensive read-path hardening already proven safe by its sibling public-catalog implementation) touching one route file plus one test file, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence. |
| 0 | Compare Loan Offers redesign: real provider-offer comparison table sourced from Explore's catalogue, metric grid removed (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR #228](https://github.com/brollysolutions/client1/pull/228)** on `claude/20260824-130948-lets-work-on-compare-loan-offers-page`: `/dashboard/loan-offers` previously read the thin `loan_types`/`banks` reference tables (`GET /loans/loan-types`, `GET /loans/banks`), which carry no rate/tenure/fee data by design, and showed a `MetricGrid` of a render-capped "Loan types" count, an unfiltered "Participating banks" count inflated by dev-DB seed pollution, a static "Shortlisted 0/3", and a static "Next step: Apply / Rates follow profile review" tile. The metric grid is removed outright, not replaced. The page now shows a genuine side-by-side comparison table of up to 3 real, Admin-published provider offers (interest rate, tenure, amount, processing fee, eligibility, last verified), sourced from the same anonymous public financial-products catalogue Explore's product page already reads (`lib/financial-catalog.ts`) via a new client-safe twin (`lib/financial-catalog-client.ts`, needed because the page reacts to a client-only localStorage shortlist and that module's server-only fetch wrapper throws if imported client-side). The shortlist (`features/loans/loan-offers-store.tsx`) changes from bank ids to `{offerId, productSlug}` pairs (bumped storage key, runtime shape guard, exposed `hydrated` flag so the resolve effect doesn't run against the pre-hydration empty array) and is now populated from a new "Add to compare" checkbox on Explore's lender-offer cards (`features/loans/add-to-compare-button.tsx`, renders nothing for non-loan products since `ProviderOfferList` is shared across all three Explore categories). The old bank-only `LoanOfferCard` is deleted. This mirrors the existing real-estate Bookmarks/Compare split rather than rebuilding a second browse UI on the Compare page. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern, low-risk UI change (no auth/RLS/payment/PII/contract/migration surface — both catalogue endpoints are pre-existing and anonymous) touching seven files (one deleted) across `apps/web`, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence, including the one residual gap: `pnpm test:e2e -- dashboard-navigation.spec.ts` ran against the restarted `client1-web-1` container (2 passed, 10 failed in 11.4m); every failure traces to the shared dev stack's already-exhausted `OTP_RATE_LIMIT_PER_IP` blocking the shared `registerClient`/`logIn` test helper before reaching any changed code, the same pre-existing infrastructure limitation recorded against PR #223/#225/#226 — this diff's actual behavior was instead verified live via Playwright MCP against an existing seeded demo account (see `feature-status.md`). |
| 0 | Notification dropdown and page redesign: click-to-open, neutral icons, unread/type/date/search filters, pagination (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR TBD](https://github.com/brollysolutions/client1/pulls)** on `claude/20260824-123331-lets-design-notification-panel-and-dropdow`: the bell dropdown converts from a buggy hover-triggered open (custom 180ms close-timer, dead zone between trigger and content) to click-to-open/close, relying entirely on Radix Popover's pre-existing outside-click/Escape dismissal; every blue `brand-cta`/`loans-accent` token across dropdown and page notification icons/badges/unread-highlights/links is replaced with neutral `bg-muted`/`text-text-primary`; the dropdown gains its own compact "Mark all as read" button; the page's redundant stats block is removed; and a client-side Unread/All tab, type filter, date range, search, and pagination (reusing `admin-list-tools.tsx`) are added over the existing capped feed, with the Unread tab now making read items disappear — the actual fix for the "mark all as read still shows notifications" report, since the mutation itself was already correct. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern, low-risk UI change (no auth/RLS/payment/PII/contract/migration surface) touching three feature files plus one e2e spec across `apps/web`, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence, including the one residual gap: live interactive browser verification was not performed (OTP-based registration with no static dev credentials available in this session). |
| 0 | Apply-page product picker removed; "Change product" and productless entry points now redirect to Explore by category (direct user-reported UI change, filed once PR #225 was live; no requirement or completion-percentage change) | **Done — [PR #226](https://github.com/brollysolutions/client1/pull/226)** on `claude/20260824-113343-so-how-this-thing-works-is-when`: `/dashboard/apply`'s inline "Choose a product" panel (and its `chooseProduct`/`CATEGORY_LABEL` support code) is deleted outright instead of just hidden; `changeProduct()` now looks up the selected product's category in `EXPLORE_CATEGORIES` and `router.push`es to `/dashboard/explore/{loans|insurance|cards}` instead of resetting local state back to the picker (the "cards" slug still self-redirects to the sole flagship product via the existing `shouldSkipCardsCategoryList`); a new effect `router.replace`s to `/dashboard/explore` whenever product-loading finishes with no `?product=` match (missing or invalid id), covering both stale links and the two remaining productless entry points — Compare Loan Offers' "Apply for a loan" button/metric card (`loan-offers-view.tsx`) and "Your loan journey"'s Apply CTA (`loans-applications.tsx`) — which are repointed straight to `/dashboard/explore/loans` since the picker they relied on no longer exists. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern, low-risk UI change (no auth/RLS/payment/PII/contract/migration surface) touching three product files plus one e2e spec across `apps/web`, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence. |
| 0 | Cards category always skips its list, apply-page product picker hides once selected, full-width application form (direct user-reported UI change, filed once PR #224 was live; no requirement or completion-percentage change) | **Done — [PR #225](https://github.com/brollysolutions/client1/pull/225)** on `claude/20260824-104244-1-cards-and-credit-cards-showing-same`: the "cards" category never shows a list now, regardless of item count (`explore-categories.ts`'s `shouldRedirectToSoleProduct` generalized to `shouldSkipCardsCategoryList`), and the Explore hub tile links straight to the sole card product instead of the category page; `/dashboard/apply`'s "Choose a product" panel hides once a product is selected (via link or manual pick), replaced by a "Change product" control on the form panel, while entry points with no product still see the picker; the apply page drops its `max-w-5xl` cap to match the dashboard's standard `max-w-[1440px]`, and the form's field grid widens to 3 columns at `xl`. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern, low-risk UI change (no auth/RLS/payment/PII/contract/migration surface) touching four files across `apps/web` plus one test file, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence, including the one residual gap: the Playwright spec exercising the apply-page flow failed at account registration on a pre-existing, already-exhausted OTP rate limit before reaching the changed code. |
| 0 | Explore product-journey trim: cards collapse, copy cleanup, sticky filters (direct user-reported UI change, filed once PR #223 was live; no requirement or completion-percentage change) | **Done — [PR #224](https://github.com/brollysolutions/client1/pull/224)** on `claude/20260824-092753-1-remove-explore-page-as-we-only`: the "cards" category page redirects straight to its sole product instead of listing it (`explore-categories.ts`'s new `shouldRedirectToSoleProduct`, called from `explore/[slug]/page.tsx`); the product page's `<h1>` tagline (`DashboardHeader`'s now-optional `description`), the "Why consider it / General eligibility / Documents to prepare" facts grid, the standalone description paragraph (removed on user confirmation after live verification showed it matched the exact seed-data sentence the user had quoted for removal), and the FAQ accordion are all gone from `explore/[slug]/[productSlug]/page.tsx`; the lender-offer filter bar (`provider-offer-filters.tsx`) is now `sticky top-14 z-10` under the dashboard's own sticky top bar. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Opus 5 / High | Claude Sonnet 5 / High | Narrow, established-pattern, low-risk UI trim (no auth/RLS/payment/PII/contract/migration surface) touching six files across `apps/web`, matching this table's lowest tier. See `feature-status.md` for the full change-by-change breakdown and verification evidence. |
| 0 | Loans-Client Explore redesign: category catalogue, product detail, lender offers (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR #223](https://github.com/brollysolutions/client1/pull/223)** on `claude/20260824-075055-lets-design-explore-page-in-client-dashboa`: `/dashboard/explore` on the loans line goes from three static coming-soon tiles to a real product-discovery journey (category → product → lender offers → Apply) built entirely on the already-shipped, Admin-published public financial-products catalogue (`lib/financial-catalog.ts`, from PR #215/#211) — no API, contract, migration, or RLS change. Every `DashboardHeader` eyebrow across the Client-visible surfaces (both lines, plus the two shared client+staff routes `transactions` and `notifications`) is removed; the redundant "Financial products" sidebar item is dropped from `nav-items.ts` (its route stays reachable as the Apply deep-link target). Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Opus 5 / High | Claude Sonnet 5 / High | Adds `/dashboard/explore/[slug]/[productSlug]` as a new server-component route; `explore/page.tsx` and `explore/[slug]/page.tsx` become server components (the catalogue client, `lib/financial-catalog.ts`, imports the server-only fetch wrapper and throws if pulled into a Client Component) with the pre-existing client-side real-estate hub moved into a new `ExploreLineSwitch` client component that receives the server-rendered loans hub as a prop; a new `ExploreArtCard` (`features/dashboard/explore-cards.tsx`) ports the illustration-plate/hover/designed-fallback technique from the public `/loans` catalogue (`components/financial-services-catalogue.tsx`) onto dashboard tokens; `EXPLORE_CATEGORIES` gains `illustration`/`category` fields and reorders to Loans, Insurance, Credit Cards, keeping `icon` for the collapsed 16px sidebar rail where art would not read; new `features/loans/provider-offer-filters.tsx` (search + provider type + sort, no amount/rate/tenure accordion, per direct user decision) and `provider-offer-list.tsx` port the public `/loans/[slug]` lender-offer cards (logo with `isAllowedAssetUrl` guard and initials fallback, amount/interest/tenure/fee tiles, pagination) with no external lender link, matching the catalogue's fail-closed publication and no-redirect invariants; `getDashboardPathLine`/`app-sidebar.tsx`'s Explore-category active state changes from exact match to a prefix match so a category stays highlighted on its product pages; the now-unreferenced `features/dashboard/coming-soon.tsx` is deleted. Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 418 web unit tests across 66 files pass, including a new `explore-categories.test.ts` (5 tests: hub order, slug shape, category-to-`ProductCategory` mapping, every illustration file exists on disk, slug resolution); `pnpm build` compiled, typechecked, and generated all 93 pages (confirmed against a live Docker API backend, so the loans-line Explore route tree — hub, category, and new product page — was exercised with real published-product data, not just mocked) before the same pre-existing Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this table, reproduced with the sandbox disabled to confirm it is an OS/environment limitation and not caused by this change. `pnpm test:e2e -- dashboard-navigation.spec.ts` ran against the restarted `client1-web-1` container: the Client-role and Client-mobile-drawer scenarios pass, including this change's updated assertions (no "Financial products" link; "Explore" present instead); the Admin scenario fails on a pre-existing, unrelated bug predating this branch (the "Financial products" exclusion assertion was never updated when `admin-loan-config`'s label changed to "Financial products" in `a92eec4`, confirmed by `git log -p` on that line); the full-workspace Client scenario and two further Client-registration scenarios could not be completed because the shared dev stack's per-network OTP-initiation rate limit (`OTP_RATE_LIMIT_PER_IP`, a security control) was exhausted by this and the prior verification run's repeated test-account registrations — this was not bypassed or reset. The `/dashboard/loan-offers` heading assertion that failed mid-run on a cold Turbopack compile was confirmed by direct source inspection to be unaffected by this diff (`loan-offers-view.tsx`'s `title="Compare Loan Offers"` is unchanged; only its `eyebrow` prop was removed). Live verification otherwise: `curl` against the running API confirmed real Admin-published loan products flow through `GET /api/v1/public/financial-products` with the expected shape, and the dev container's own request log shows `/dashboard/explore`, `/dashboard/explore/[slug]`, and `/dashboard/apply` compiling and returning 200. Security, design, and maintainer review were not separately requested for this direct user-reported UI change. |
| 0 | Loans client dashboard shell and home decluttering (direct user-reported UI change; no requirement or completion-percentage change) | **Done — [PR #222](https://github.com/brollysolutions/client1/pull/222)** on `claude/20260823-211421-loans-client-page-dashbaord-1-side-navbar`: the desktop icon rail no longer remembers its expanded state across reloads (always starts collapsed; the in-session toggle is unchanged), and the loans-Client dashboard home drops the "Dashboard highlights" banner/offers block, the "Loans workspace" eyebrow, the zero-count metric row, and the empty-state icon. Real-estate Client and Agent homes are unaffected. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / High | Claude Sonnet 5 / High | Narrow, established-pattern, low-risk UI change (no auth/RLS/payment/PII/contract/migration surface), matching this table's lowest tier. `app-shell.tsx` drops `RAIL_OPEN_KEY`, the restore `useEffect`, and the `localStorage.setItem` write in `toggleRail`, leaving `railOpen` initialized `false` with a plain in-session toggle; `dashboard/page.tsx`'s loans-Client fallthrough branch renders `<LoansApplications />` alone instead of pairing it with `<PersonalizedPlacements>` (the real-estate Client and Agent branches keep their `<PersonalizedPlacements>` call, and the import stays); `loans-applications.tsx` drops the `DashboardHeader` `eyebrow` prop, the `MetricGrid`/`MetricCard` row and its now-orphaned `activeCount`/`attentionCount`/`completedCount` computations (narrowing the `dashboard-ui` import to `DashboardHeader, DashboardPage`), and the empty-state icon span. `shell-state.ts`/`shell-state.test.ts` are untouched — `isDesktopSidebarExpanded`'s `role === "client" && clientPreference` logic is still correct with `railOpen` simply no longer persisted. Three Playwright specs that asserted the old behavior are updated: `dashboard-navigation.spec.ts` inverts its post-reload rail assertion to `"Expand sidebar"` and adds home-page regressions (`Dashboard highlights` region absent, no "Loans workspace"/"Needs attention" text); `personalization.spec.ts` and `loan-media.spec.ts`'s shared `logIn` helper swap their "Dashboard highlights" visibility gate for the `"Your loan journey"` heading, which renders in both the empty and populated states. `loan-media.spec.ts`'s unrelated "Needs attention" document-badge assertion (`documents-view.tsx`) is untouched. No route, API, contract, migration, or RLS change. Fresh evidence: `pnpm lint`, `pnpm typecheck`, and all 413 web unit tests across 65 files pass unchanged (including `shell-state.test.ts`); `pnpm build` compiled, typechecked, and generated all 93 pages before the same pre-existing Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this table; the feature-tracking co-change guard passes. Live browser verification on the restarted `client1-web-1` container at 1440px against two demo Client accounts confirmed: the loans-line home shows no highlights banner, no eyebrow, no metric row, and a populated table with no console errors attributable to this change; the rail starts collapsed, expands in-session, and returns to collapsed after a hard reload; switching the same account to the Real Estate line still shows its "Dashboard highlights" banner unchanged. The empty-state icon removal was verified by code inspection only — both seeded demo Client accounts have existing loan applications, so the empty state was not directly observed live. `pnpm test:e2e` ran the three touched specs plus their sibling tests in the same files against the live Docker stack: the Client scenario in `dashboard-navigation.spec.ts` (carrying the new rail/highlights assertions) and both `personalization.spec.ts` tests (including the one asserting the new heading/highlights gate) pass; five of six other `dashboard-navigation.spec.ts` scenarios and the two non-scenario tests in that file pass, while the Admin scenario fails on a pre-existing, unrelated assertion (`Financial products` nav link visible to Admin) that shares no code path with this change; one `loan-media.spec.ts` test fails on a pre-existing test-data collision in its own `registerLoansClient` helper (`password`/`mobile` both derive from `Date.now()` and occasionally overlap, tripping "Password must not contain your mobile number"), unrelated to the one-line `logIn` gate edited here. Security, design, and maintainer review were not separately requested for this direct user-reported UI change. |
| 0 | Property detail page decluttering, contain-fit gallery, and Similar Properties (direct user-reported public/dashboard UI change; no requirement or completion-percentage change) | **Done — [PR #221](https://github.com/brollysolutions/client1/pull/221)** on `feat/property-detail-ui`: the shared `PropertyDetailView` gallery no longer crops photos, the property-type tag/"Admin-approved facts" line/"Listing checks" box are removed with RERA disclosure relocated into the header, "Property at a glance" reads "Overview", long descriptions get an animated See more/See less toggle, a locality/city-ranked Similar Properties panel sits under the contact card on both the public and dashboard detail pages, and the dashboard contact card drops its now-redundant "guided visit" blurb (kept on the public surface). Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / High | Claude Sonnet 5 / High | Narrow, established-pattern UI change plus one new pure ranking module and two-surface data wiring (no auth/RLS/payment/PII/contract/migration change), one tier above this table's lowest tier for that reason. `PropertyDetailGallery` adds `object-contain` with a blurred backdrop layer and prev/next chevrons (keyboard-operable, wrap-around); the type badge, "Admin-approved facts for this listing.", and the whole "Listing checks" section are deleted from `property-detail-view.tsx`, with RERA verified/exemption disclosure moved into the header pill row so the statutory disclosure is not lost; a new `PropertyDescription` client island (`components/property-description.tsx`) renders a `grid-template-rows` 0fr/1fr animated toggle, reusing the pattern already established in `agent-application-form.tsx`; a new dependency-free `lib/similar-properties.ts` ranks candidates by subtype/category/locality/city/price/area/BHK with a category-only floor and no `Math.random()`/`Date`, structurally shared by both the public `PropertyListing` and dashboard `REListing` shapes with zero casts; `SimilarPropertiesPanel`/`SimilarPropertyCard` render the ranked cards and degrade the stat row to Price-only when the public surface's `area` is absent; the public page parallel-fetches the catalogue via the existing never-throwing `getPublicListings()`, and the dashboard wrapper reuses the existing `useProperties()` hook without gating the primary detail render on its loading/error state; the contact card's "Connect with Dhanadhara for verified next steps and a guided visit." line is now conditional on the existing `dashboard` prop, per direct user follow-up during review. A client/server-boundary defect found during browser verification — a pure helper accidentally trapped behind a `"use client"` directive was invoked directly from the server `PropertyDetailView` — was caught and fixed by extracting the pure structured-details logic into a new boundary-neutral `lib/property-details.ts`. Fresh evidence: 3 new test files (`lib/similar-properties.test.ts` 13 tests including one generic call against each concrete listing shape with no casts; `components/similar-properties-panel.test.tsx` 6 tests; `components/property-description.test.tsx` 2 tests) plus an expanded `property-detail-view.test.tsx` (1 → 5 tests, including a public-vs-dashboard blurb assertion); all 413 web unit tests across 65 files pass; `pnpm lint` and `pnpm typecheck` pass; `pnpm build` compiled, typechecked, and generated all 93 pages before hitting the same pre-existing Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this table. Live browser verification on the restarted `client1-web-1` container at 1440px and 390px confirmed all page-level changes (including the dashboard-only blurb removal, checked on both surfaces after the edit) and the Similar Properties panel (including its correct self-omission when a category has only one catalogue member, and a live click-through of the See more/See less toggle against a temporarily lengthened, then reverted, dev-only seed row) on the public surface; on the authenticated dashboard surface the same page-level changes and the panel's silent no-render-on-fetch-failure behavior were confirmed live, but the panel's populated dashboard rendering could not be directly observed because the dashboard catalogue-list fetch failed under a local dev-environment network condition that reproduces identically on the pre-existing, unmodified `/dashboard/explore` page — an environment limitation, not a defect in this change. `pnpm test:e2e` was not run; no property-detail Playwright spec exists to target, and none was added for a copy/layout change of this size. No backend endpoint, contract, migration, or RLS change was made. |
| 0 | Comprehensive local demo accounts and workflow data (developer experience; no requirement or completion-percentage change) | **Done — [PR #220](https://github.com/brollysolutions/client1/pull/220)** on `claude/20260823-172426-populate-test-data-everywhere-and-provide`: `uv run python -m app.scripts.seed_demo` provisions deterministic credentials for Admin, Sub Admin, Client, Agent, Telecaller, and Employee workspaces, plus representative operational, content, support, notification, and finance-shaped records across their implemented UI journeys. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | `gpt-5.6-sol` / Extra High (`xhigh`) | Claude Sonnet 5 / High | The command is hard-blocked outside `ENV=development`, uses only a self-owned UUIDv5 namespace and synthetic `+919000001xxx`/`*.demo@example.com` identities, preserves unrelated rows and the established Main Admin, stops on identity collisions, and calls no external payment/email/voice/push provider. Media uses only the existing managed local storage/AV pipeline. See `feature-status.md` for full fresh evidence: a live seed run, an idempotent rerun, and a `--verify` run confirming all 11 accounts' login, JWT role/line claims, and RLS-scoped API reads; 14 focused tests; full API Ruff/format; one Alembic head; and two roles (Admin, Client) confirmed end-to-end through the actual local Next dev container. Non-goals delivered as scoped: no production/staging bootstrap, permission change, contract/schema migration, fake KYC/storage reference, or exhaustive combinatorial record set. |
| 0 | Financial Services card and detail-page decluttering (public UI; no requirement or completion-percentage change) | **Done — [PR TBD](https://github.com/brollysolutions/client1/pulls)** on `claude/20260823-001815-remove-16-services-in-search-bar-also`: direct user-reported cleanup removing the catalogue card tag/provider-count/aggregate-count, whitening-card background, the two detail-page eyebrows and provider badge, and the mismatched Apply/Enquire button sizing. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | Claude Sonnet 5 / Medium | Claude Sonnet 5 / Medium | Narrow, established-pattern, low-risk public UI change (no auth/RLS/payment/PII surface), matching this table's lowest tier. Catalogue cards drop the category tag and provider-count text and use the section's cream `var(--nav-bg)` instead of `bg-surface`; the sticky bar's aggregate count is `aria-live`-only; the detail page drops its provider badge and both eyebrows; Apply and Enquire render as an equal-width `size="lg"` pair via a new optional `LeadDialog` `size` prop that defaults to unset for every other consumer. Fresh evidence: all 388 unit tests (with updated catalogue coverage) pass; `pnpm lint` and `pnpm typecheck` pass; all three `e2e/financial-services.spec.ts` tests pass; before/after desktop browser screenshots on the restarted dev container confirm each of the six requested changes. `pnpm build` generated all 93 pages and then hit the same pre-existing Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this table — unrelated to this change. |
| 0 | Homepage information-flow refinement (public UI; no requirement or completion-percentage change) | **Done — [PR #217](https://github.com/brollysolutions/client1/pull/217)** on `feat/configurable-financial-application-forms`: restored the established Loans band, placed calculators after the Properties band, and aligned the calculator section with the shared page background. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | The rendered order is Loans → Properties → Calculators; the calculator eyebrow is absent; its outer band uses `bg-background`; all existing calculator links remain intact; and no catalogue/API/auth/RLS behavior changed. Fresh evidence: focused regression failed before the change and then passed; web lint, strict typecheck, all 383 unit tests, and the focused 390px Playwright journey pass; 390px and 1440px visual review plus design review found no actionable issue. The host `pnpm build` exceeded its 180-second limit without a final report and is inconclusive. |
| 0 | Public property detail and authentication intent handoff (FR-7.1, FR-7.2, FR-17.1 follow-up; no completion-percentage change) | **Done - [PR #216](https://github.com/brollysolutions/client1/pull/216):** approved discovery remains public and curated, every card opens a full-size shareable detail, and login or registration returns to the exact property. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Delivered an explicit active-only public detail contract, managed gallery/panorama, subtype facts, RERA disclosure, responsive action rail, canonical contact identity, authenticated bookmark/compare/enquiry/visit actions, and safe local auth return intent with Real Estate preselected for property-origin registration. Exact detail requests bypass the catalogue ISR cache so deactivation is immediate; inactive and unknown rows remain indistinguishable. No owner/reviewer data, exact minor-unit price, map, external redirect, new table/RLS policy, or Loans-only self-enrollment mutation was added. Fresh evidence: API Ruff/format, 49 focused PostgreSQL tests, one Alembic head, regenerated contracts, web lint/typecheck, all 384 tests plus a 25-test post-hardening rerun, responsive browser/auth review, and the canonical 93-page production builder pass. The repository wrapper timed out after 30 minutes in its full host API phase and is inconclusive. Security, design, and maintainer reviews found no remaining actionable defect. Next priority returns to FR-2.2 controlled correction/audit. |
| 0 | Admin-published Financial Services catalogue, provider offers, and logo library (CS-014 public follow-up; FR-6.1-FR-6.4) | **Done - [PR #215](https://github.com/brollysolutions/client1/pull/215):** public catalogue/detail/Home surfaces now derive from explicit Admin publication, offer and logo curation is reusable, and every application/enquiry action stays inside Dhanadhara. Completion coverage remains 99.4%; next priority returns to FR-2.2 controlled correction/audit. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Delivered card-level and Explore navigation, up to six ordered Home services, the four fixed calculators plus View all, searchable/filterable/sortable/paginated provider offers, informational terms/freshness, internal Apply/Enquire context, managed JPEG/PNG/WebP logos, an exact reviewed-SVG manifest, Admin marketing/provider/offer controls, generated contracts, and additive RLS. No provider URL/off-platform redirect, arbitrary remote image, lender approval claim, live lender sync, inline KYC, lender seed, or operational assignment change exists. Fresh evidence: migration downgrade/re-upgrade and one head; API Ruff/format; 60 focused API tests plus a 43-test final provider/logo rerun; web lint, strict typecheck, all 369 tests, two responsive Playwright journeys, mobile/desktop visual review, and the Docker 93-page production build pass. The monolithic API suite exceeded 40 minutes without a report and is inconclusive. Security, design, and maintainer reviews found no remaining actionable defect. Raw provider identities and logo rights remain an explicit provenance-gated follow-up. |
| 0 | Property-specific listing forms, RERA review, and catalogue freshness (FR-7.3, FR-6.2-FR-6.4 follow-up) | **Done — [PR #212](https://github.com/brollysolutions/client1/pull/212):** new property intake uses professionally ordered, versioned subtype schemas; project amenities require 150–500 words; RERA is optional at intake and independently Admin-reviewed; and Financial Product/lender freshness is server-derived on Admin and Client surfaces. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Delivered closed subtype payloads, digit/contact/link-safe narratives, an Admin-only audited RERA approval gate, public disclosure controls, server timestamps, generated contracts, and no lender seeds/hardcoding or KYC fields. Fresh evidence: migration upgrade→downgrade→upgrade and one head; 183 focused PostgreSQL tests pass with four unrelated sponsor-cap cases deselected; the full API suite completed 1,741 passes and 13 failures, after which three home-queue failures caused by two stale property fixtures were fixed and rerun green, leaving 10 unrelated baseline/shared-state failures; Ruff/format, 18 tracking/migration tests, web lint/typecheck and all 366 unit tests pass; the Linux production image builds all 93 pages; connected Playwright author/review/public/freshness journeys pass, while the broad suite is 8/17 due to OTP exhaustion and stale/cold-route expectations. Security, design, and maintainer reviews found no remaining actionable feature defect. Next priority returns to FR-2.2 controlled correction/audit. |
| 0 | Configurable Financial Products and product-specific Client forms (CS-014; FR-6.2-FR-6.4) | **Done — [PR #211](https://github.com/brollysolutions/client1/pull/211):** one Admin-managed catalogue now publishes professionally ordered, versioned forms to the authenticated Client dashboard. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Admin can create, order, activate, and publish allowlisted product forms; Client submissions are validated against the exact version and retain a schema snapshot; registered identity is server-sourced; loans retain their lifecycle while cards/insurance use immutable enquiries; inline KYC uploads are absent; and lender names/availability remain entirely Admin-managed with no feature seed. Migration round-trip, one head, and lender-row non-mutation pass. Final focused evidence is 47 financial-product/Admin-config tests plus 15 exhaustive Admin-coverage/business-line/RLS contracts, API Ruff/format, 359 web unit tests, lint/typecheck, and the authenticated Playwright submission journey. The full API suite completed 1,741 tests with 1,724 passes and 17 failures; four feature-owned ledger failures were fixed and rerun green, leaving 13 unrelated baseline/shared-state failures. The host build compiled, typechecked, and generated all 93 pages before Windows denied standalone symlinks (`EPERM`); the exact repository wrapper was attempted for ten minutes but remained in the known hour-long API phase. Security, design, and maintainer review found no remaining actionable feature defect. Next priority returns to the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Property listing authority, owner CRUD, and managed 360 panorama (FR-7.3, FR-13.1-FR-13.4) | **Done — [PR #210](https://github.com/brollysolutions/client1/pull/210):** Clients are denied property authoring; real-estate Agents, Sub Admins, and platform Admins can list; owner CRUD, broader Admin management, Admin-only re-review, soft withdrawal, and one managed uploaded panorama replace property MP4. Completion remains 99.4%; next priority remains FR-2.2 controlled correction/audit. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Delivered server/RLS role and ownership gates, full-fact edit and soft-withdraw commands, audit events, stable public facts until reapproval, public deactivation on withdrawal, fail-closed legacy-video migration preflight, one 2:1 JPEG/WebP panorama through the existing managed-media lifecycle, regenerated contracts, role-aware listing UI, destructive confirmation, and accessible pointer/keyboard panorama review/public viewing. Fresh evidence: 69 focused migrated API/schema/media/RLS tests; migration upgrade→downgrade→upgrade and one head; Ruff check/format; current contracts; web lint/typecheck, all 357 unit tests, focused Client/Sub Admin browser gates, and a Linux 93-page production build. The monolithic API command timed out after 15 minutes without a final report and is inconclusive. Security, design, and diff reviews found no actionable defect. |
| 0 | Manual location-search follow-up (FR-17.2-adjacent profile and property-search UX; no completion-percentage change) | **Done — follow-up on [PR #209](https://github.com/brollysolutions/client1/pull/209)** on `codex/20260819-165700-lets-work-on-dhanadhara-logo-and-dhanadhar`: browser current-location capture is removed from every user-facing web surface while manual location search/entry remains. Completion coverage remains 99.4%; next priority remains FR-2.2 controlled correction/audit. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Registration/Profile expose one labelled search-style city/locality field. Dashboard home, Explore, category, Bookmarks, and Filters retain API-backed manual locality/city/PIN/property search. No geolocation permission, reverse-geocoding request, provider configuration, or current-location control remains in the web app. Previously stored personalization coordinates remain removable and expire through existing server safeguards, but cannot be captured/refreshed by the UI. APIs, contracts, schema, RLS, operational addresses, authored audience coordinates, and dependency boundaries remain unchanged. Fresh evidence: the three focused browser regressions failed first; lint, strict typecheck, all 356 unit tests, the 390px registration and authenticated dashboard journeys, and responsive visual review pass. The personalization journey passed before a repeated verification run hit only the development OTP rate limit. The build compiled/typechecked/generated 93 pages before the known Windows standalone `EPERM` tail and Docker-only API-host limitation. Security, design, and maintainer review found no actionable defect. |
| 0 | Readable current-location lookup follow-up (FR-17.2-adjacent profile and property-search UX; no completion-percentage change) | **Superseded by the manual location-search follow-up above — [PR #209](https://github.com/brollysolutions/client1/pull/209), following [PR #208](https://github.com/brollysolutions/client1/pull/208):** this historical slice introduced readable browser-location lookup and removed the redundant catalogue selector, hardcoded production property locations, and four dashboard metrics. The latest explicit decision removes browser-location lookup while preserving the API-backed catalogue/dashboard cleanup. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Historical evidence remains in the linked PRs. Current acceptance criteria are recorded in the manual location-search row above. |
| 0 | Registration/profile location and salaried terminology (FR-17.2, FR-18.1-adjacent profile UX; no completion-percentage change) | **Done — [PR #207](https://github.com/brollysolutions/client1/pull/207)** on `codex/20260819-165700-lets-work-on-dhanadhara-logo-and-dhanadhar`: Postal address is replaced by optional Location in registration, Profile settings, the API, database, privacy notice, and generated contracts; Net salary/`net_salary` is replaced by Salaried/`salaried`. Completion coverage remains 99.4%, and the next priority remains FR-2.2 controlled correction/audit. | `gpt-5.6-sol` / Extra High (`xhigh`) | `gpt-5.6-sol` / Extra High (`xhigh`) | Migration `e4b5c6d7e8f9` preserves address values by renaming the column and migrates the income literal; upgrade→downgrade→upgrade and one applied head pass. Location is a manually entered, editable profile field saved only with the form; no browser geolocation, reverse geocoder, background capture, history, or personalization coupling exists. RLS is unchanged, audit/log/token/Redis payloads exclude location, and deletion scrubs it. Fresh evidence from the original slice: 53 focused API tests, API Ruff/format, byte-stable regenerated contracts, web lint/typecheck, 375 unit tests, and the focused desktop/390px registration Playwright journey pass. Broad Playwright was 11/15 with four unrelated stale-flow failures. The host build compiled/typechecked/generated 93 pages before the known Windows standalone `EPERM`; the Linux workaround and 13-minute monolithic API run were inconclusive. Security, design, and maintainer review found no remaining actionable defect. |
| 0 | DhanaDhara DD logo exploration board (brand design document; no application or requirement change) | **Done - [PR #206](https://github.com/brollysolutions/client1/pull/206)** on `codex/20260819-165700-lets-work-on-dhanadhara-logo-and-dhanadhar`: delivered one self-contained comparison file before any application integration; completion coverage remains unchanged and the next product priority remains the FR-2.2 controlled-correction/audit follow-up. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | `brand/dhanadhara-logo-exploration-board.svg` contains 12 original DD concepts across three visual families, six wordmark/font directions, the current palette, a 16-96 px reduction lab, and a client-shortlist area. Fresh evidence: valid `0 0 1800 2600` SVG with title/description metadata, 12 labeled concept groups, 12 reusable symbols, and zero scripts, inline event handlers, or remote asset references; visually reviewed Playwright renders at 900 x 1300 and 450 x 650; feature tracking passes; application diff is empty. No pages, runtime branding, routes, APIs, contracts, auth/RLS, data, workflows, dependencies, or established UI behavior changed. Follow-ups: client selection, trademark clearance, and final-mark integration. |
| 0 | Starlette HTTP 422 deprecation cleanup (API maintenance; no requirement or completion-percentage change) | **Done — [PR #205](https://github.com/brollysolutions/client1/pull/205)** on `codex/20260819-151825-eplication-no-api-1-py-29-starlettedepreca`: replaced all 68 production accesses to Starlette's renamed HTTP 422 constant across 19 API/service modules, removing the five import-time warnings and preventing request-path warnings without changing the numeric response. | `gpt-5.6-terra` / Medium | `gpt-5.6-terra` / Medium | A source-wide AST regression guard failed first with all 68 offenders and now passes. `app.main` imports with `StarletteDeprecationWarning` promoted to an error; the focused system set passes 5 tests; Ruff check and format pass across 457 files; Alembic reports one head. The full API suite was attempted for about 13 minutes but produced no report and was terminated, so it is inconclusive rather than passed. No response payload, route, OpenAPI, authorization/RLS, service behavior, model, migration, dependency, or web behavior changed. Completion coverage remains 99.4%; next priority remains the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Refreshed bundled artwork delivery for governed banners (FR-12.1-FR-12.3; no completion-percentage change) | **Done — [PR #204](https://github.com/brollysolutions/client1/pull/204)** on `codex/20260819-133550-add-updated-images-to-the-banners`: the already-approved refreshed artwork reaches existing and newly authored banners through version-aware bundled asset URLs, preventing stale browser/CDN/Next image caches from retaining the superseded pixels. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | Bundled template URLs include their immutable template version as a cache key in both the template library and public banner responses; uploaded object-storage URLs remain unchanged; all 32 refreshed section assets retain their governed category mappings; no banner status, approval, upload authority, API schema, migration, RLS, or copy changes. Fresh evidence: 6 catalogue tests, 3 focused PostgreSQL-backed Docker API tests, full Ruff check/format, one Alembic head, web lint/typecheck, focused 23-test web set, all 373 web tests, live 200 image requests on both section pages, and design/security/diff review pass. Build compiled/typechecked/generated all 93 pages before the known Windows `EPERM` standalone tail; the broad Docker API suite was attempted for about 30 minutes but did not report and is not claimed as passed. |
| 0 | Financial Services and Properties campaign-art composition refresh (FR-12.1-FR-12.3; no completion-percentage change) | **Done — [PR #203](https://github.com/brollysolutions/client1/pull/203)** on `codex/banner-composition-refresh`: replaced all 32 governed 1440x576 section-banner WEBPs with distinct editorial scenes following the supplied composition reference—calm copy space on the left, scene detail entering the middle, and focal subjects primarily on the right—without changing categories, CMS authority, public rendering, APIs, contracts, or RLS. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | All 16 Financial Services and 16 Properties assets are text/logo/watermark-free 1440x576 WEBPs, cover every governed category exactly once, and have zero exact duplicate hashes. Fresh evidence: contact-sheet and representative final-WEBP review, focused two-test asset contract, lint, strict typecheck, all 373 web tests, feature tracking, metadata and duplicate scans, plus design/security/diff review pass. `/loans` SSR returned 200; the browser connector blocked port 3001. Build compiled/typechecked/generated all 93 pages before the known Windows standalone-symlink `EPERM` tail and Docker-only API-host limitation. |
| 0 | Sponsor spotlight distinction and responsive creative fitting; section-banner scroll cue; Loans category declutter (FR-2.3, FR-6.1; no completion-percentage change) | **Done — [PR #202](https://github.com/brollysolutions/client1/pull/202)** on `codex/20260819-113333-701-b-out-418-b-xact-25145`: the single governed sponsor now has a disclosure-led inset spotlight and source-faithful 16:9 rails; the Financial Services and Properties banner gap hosts one reduced-motion-safe overview anchor; requested Loans category descriptions/count pills are removed. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | CMS/API/RLS/upload authority, template dimensions, and no-autoplay invariant remain unchanged. Fresh evidence: lint, strict typecheck, focused 22-test render suite, full 372-test web suite, tracking check, and design/security/diff review pass. Build compiled/typechecked/generated 93 pages, then hit the known Windows standalone-symlink `EPERM` tail and Docker-only API host fetch limitation; no result is claimed for that tail. |
| 0 | Governed homepage sponsor themes and public banner presentation refinement (FR-2.3, FR-12.1-FR-12.3; no completion-percentage change) | **Done — [PR #201](https://github.com/brollysolutions/client1/pull/201)** on `codex/20260819-060544-reconnect-mcps`: the generic white sponsor treatment is now a compact split card (16:9 image at left, campaign copy and CTA at right), with six unique 960x540 governed themes; Sub Admins select artwork without receiving upload authority; the CMS preview and artwork guidance are placement-aware; and Financial Services/Properties banners render at a restrained 224-520px responsive height with a small hero gap and no newly added scroll animation. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Migration `d3a9b72c5e41` adds five templates and a placement-wide partial unique index; one live sponsor remains database-enforced across themes and scheduler replacement cannot displace an unnamed campaign. Admin approval/upload authority, public/API contracts, RLS, and personalization are unchanged. Fresh evidence: migration upgrade/downgrade/re-upgrade succeeded on the existing dev database; one Alembic head; 7 focused Docker API tests, 18 tracking/migration checks, Ruff check/format across 456 files, web lint, strict typecheck, and all 370 web tests pass; the build compiled and generated 93 pages before the known Windows standalone-symlink `EPERM` tail; desktop/phone browser checks passed on `/`, `/loans`, and `/real-estate`; 44 governed banner WEBPs and 127 total public visual files contain zero exact duplicate groups. `./scripts/verify.sh --ci` was attempted twice but the broad API phase did not return within one hour and the longer run became detached on user input, so it is reported as incomplete rather than passed. Design, security, and diff review found no actionable issue. |
| 0 | Cross-line banner/offer authoring 500 (defect fix, no requirement change) | **Done** on `claude/20260819-052311-fix-it-then`: creating a banner or offer with `business_line: "both"` returned a 500. Content rows may legitimately be cross-line, but the services forward the entity's line into `audit_log.record()` and `ck_audit_log_business_line_optional_operational` permits only a concrete line or NULL. Normalized in `record()` — an audit entry's line is a scope, so a cross-line action is line-neutral (NULL) — rather than repeating a ternary at ~40 call sites. No schema, contract, RLS or endpoint change; the Admin read filter was already correctly typed. | `claude-opus-5` / Extra High | `claude-opus-5` / Extra High | Both new tests confirmed RED against the unfixed code and green after. Ruff check/format pass across 455 files; 137 audit/banner/offer/classification tests plus 36 admin-suite audit-writing tests pass. Operational tables are DB-constrained to a concrete line, so the normalization cannot mask a mis-scoped operational row. |
| 0 | Homepage sponsor ad slot (FR-2.3, FR-12.1) | **Done** on `feat/homepage-ad-strip`: the Home page gains a sponsored ad above the hero carousel, as a full-bleed leaderboard band: creative flush to the leading edge, the sponsor's copy beside it, the CTA at the trailing edge, a "Sponsored" disclosure and a session-only dismiss. The same pass makes the homepage hero carousel full-bleed and full-screen (it was a centred peek-coverflow card): `variant="hero"` -- used only by the homepage -- now fills the viewport below the sticky header, drops the peek scale/opacity/blur, pins its arrows to the container edges, hides them at phone width where they overlapped the headline, and overlays its dots on the slide instead of adding a strip beneath it. `/loans` and `/real-estate` are untouched because they use `variant="section"`. It is a new `homepage_ad` value on the existing `banner_placement` enum, so the whole authored → Admin-approved → scheduler-activated lifecycle, RLS, audit and artwork governance are inherited rather than rebuilt: no new table, endpoint, policy or dependency. **Exactly one sponsor runs at a time and the next is queued behind it** — the placement seeds a single `sponsor` category key, so `uq_banners_live_placement_category` makes single-occupancy a database guarantee, and the successor is the existing replacement flow (`replaces_banner_id` + `cms_activation`, which refuses to displace a banner the newcomer does not name). The server cap for this placement is therefore 1, not 7. Because only one ad shows, the renderer is a plain component with no carousel, autoplay or arrows. | `claude-opus-5` / Extra High | `claude-opus-5` / Extra High | No new table, route, RLS policy, grant or dependency; `dashboard` remains unreachable anonymously (the public literal was widened by exactly one value). The migration adds the enum label inside `op.get_context().autocommit_block()` before seeding the template that references it — without that block it would pass on a fresh database and fail on every existing one, so **a green CI run is not evidence for it**. Fresh evidence: applied to the already-migrated dev database, seeds verified, downgrade removes exactly the seeded row, re-upgrade clean, single head `c2f8a91b4d73`. Ruff check and format pass across 455 files; 69 focused banner API/RLS/catalog tests plus 33 route-authorization/RLS-coverage/scheduler tests pass, including new tests that a second concurrent live sponsor raises an integrity error while an approved successor stays unserved, that `?placement=dashboard` still 422s, and that the placement forces no business line and cannot promote a property. Regenerated OpenAPI and TypeScript contracts contain only the two expected additions. Web lint, strict typecheck and all 367 unit tests pass. Live browser verification at 1440px and 390px covered the image-left/content-right layout, the disclosure, the dismiss (and the hero returning flush beneath it), and one live sponsor served while a queued one is withheld. Hardening carried along the way: `CATEGORIES_BY_PLACEMENT` now raises at import if a placement is missing, `PUBLIC_BANNERS_LIMIT_BY_PLACEMENT` is derived over the enum, the CMS placement list is a `Record<Placement, …>` so tsc catches an omission, `PublicBannerPlacement` is derived from the generated contract, and the artwork-size test uses an explicit per-placement map instead of a ternary that silently swallowed new placements. |
| 0 | Public offers strip removal and navbar/section polish (public UI, not FR-numbered) | **Done** on `claude/20260818-195255-1-remove-liveoffers-entire-section-as-if`: per direct user instruction, the public "Live offers / Offers running right now" strip is removed from both `/loans` and `/real-estate` — promotional offers will reach the public site through Sub Admin banner campaigns instead, and the authenticated Client offers surfaces are untouched. `components/offer-strip.tsx`, `lib/offers.ts`, `lib/public-offers.ts`, and their three test files are deleted with no remaining consumers (`lib/public-content-blocks.ts` comments updated); the anonymous `GET /api/v1/public/offers` endpoint is left in place (API surface unchanged). The desktop navbar's "Financial Services" and "Properties" mega-menu triggers now navigate to `/loans` / `/real-estate` on pointer click (the panel already opens on hover, and keyboard activation — `event.detail === 0` — still opens the panel so its items stay keyboard-reachable). The /loans products heading is now "Explore our financial services" with the eyebrow removed (`ProductPage.productsEyebrow` deleted as dead code), and the Credit Cards feature card drops its "In the spotlight" chip. | `claude-fable-5` / High | `claude-fable-5` / High | No route, API, contract, migration, or RLS change. Fresh evidence: web ESLint, strict typecheck, and all 361 unit tests pass (three offers test files removed with their modules); the production build compiles, typechecks, and generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. Live browser checks against the dev stack verified the new heading without eyebrow, the chip-free Credit Cards card, both pages rendering without the offers section, click-to-navigate on both nav triggers, and hover still opening both thumbnail mega-menus; all four console errors are pre-existing local dev-data artifacts (homepage-closing content-block timeout, three MinIO test-listing image 500s). |
| 0 | /loans "Explore our services" redesign: real-color illustration family, band layout, Credit Cards spotlight, trust strip relocation (public UI, not FR-numbered) | **Done** on `feat/loans-services-redesign`: all 16 product-card SVGs under `apps/web/public/illustrations/products/` were redrawn as one cohesive real-color family on a shared scaffold (soft halo, ground shadow, sky sparkles, gold rupee accents) after direct user feedback rejected an initial all-blue duotone pass. The products section gains an eyebrow/subheading header; each band gets an intro line, accent bar, and product-count chip; cards get a tint-gradient illustration band with restrained hover motion. The "Cards and insurance" band renders its four insurance cards in one row and presents Credit Cards as a full-width spotlight card at sm+, collapsing to a standard stacked product card on phones (user feedback). The "Why people trust us" content moved out of that band into the existing section-level `TrustStrip` below the whole grid (user feedback), retiring `ProductBand.trust` in favor of a new `ProductPage.productsTrust` prop and a `ProductBand.featureProductId` field. A legacy-anchor defect that made the Home Loan card's illustration sit 24px lower than its siblings (the empty `property-loan` anchor span participated in the Card's `gap-6` flex column) is fixed by absolutely positioning anchor spans. The offers strip's hide-when-empty behavior was confirmed already implemented and is now locked by `components/offer-strip.test.tsx`. A same-PR follow-up adds miniature illustration thumbnails to both desktop mega-menus: Financial Services items reuse their product's spot illustration (one art source for menu and page) and Properties gets nine purpose-drawn 96x72 subtype miniatures under `public/illustrations/menu/properties/` (the catalog landscapes are unreadable at thumbnail size); the mega-menu renderer shows a 48x36 tint tile when `illustration` is set, and the mobile drawer deliberately keeps Lucide icons per the illustrations-lg+ rule. | `claude-fable-5` / High | `claude-fable-5` / High | No route, API, contract, migration, or RLS change; mega-menu/footer `#` anchors keep resolving (`credit-cards` id stays on the spotlight card, legacy `property-loan` anchor preserved). Fresh evidence: web ESLint, strict typecheck, and all 392 unit tests pass (new offer-strip component test; `lib/products.test.ts` updated to the feature-card contract; menu tests now assert every dropdown item's thumbnail exists on disk); the production build compiles, typechecks, and generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. Live browser review at 1440px and 390px against the running dev stack verified band layout, real-color art, card alignment, spotlight vs stacked credit-card behavior, anchor scrolling, trust strip placement, a live offers strip, and both mega-menus rendering all 25 thumbnails, with no console errors attributable to this change (the only error is the pre-existing missing `homepage-closing` content block 404 in the dev database). |
| 0 | Property-backed public banners, property taxonomy, and full-bleed carousel polish (FR-2.3, FR-7.3, FR-11.2, FR-12.1-FR-12.3) | **Done — [PR #195](https://github.com/brollysolutions/client1/pull/195)** on `feat/starter-banner-ctas`: Homepage no longer carries the dark scrim; Financial Services and Properties banners are full-bleed at the accepted heights, flush to the header and permanent hero, use edge chevrons without dots, and rotate every five idle seconds without a visible pause control. Sub Admins can promote an active approved property through a validated relationship. Property intake and public navigation share Residential (individual house, standalone apartment, gated-community apartment, villa), Plots (plot, farmland, agriland), and Commercial (locked or unlocked space), displayed as one desktop row, with distinct governed artwork per subtype. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | Two additive migrations add nullable property and property-subtype relationships without changing RLS authority, dashboard personalization, or Admin approval. New submissions require a category-compatible subtype; legacy listings retain broad-category compatibility. Server validation permits only active subtype-compatible approved listings, derives the safe enquiry destination and RERA badge, uses subtype-specific 1440×576 governed Properties artwork, and suppresses inactive linked listings. The CMS has a searchable/clearable compatible-property picker and truthful preview. Fresh evidence: the 113-test affected API set, 11 banner RLS tests, and final two subtype-cap tests pass; Ruff check/format pass across 454 files; one applied Alembic head; regenerated contracts are byte-identical. Web lint, strict typecheck, 386 unit tests, and Linux production build (93 pages) pass. Browser checks cover desktop/390px layout, autoplay, controls, three equal menu columns, and all nine human-free assets. Broad E2E is 9/14 with five unrelated pre-existing flow failures recorded in `feature-status.md`. Security, design, and diff review found no remaining actionable issue. Requirement completion is unchanged; next priority is FR-2.2 controlled correction/audit. Non-goals remain a public property-detail route, relaxing mandatory RERA data, arbitrary Sub Admin image upload, dashboard-targeting changes, or unrelated artwork replacement. |
| 0 | Template-governed public banner campaigns (FR-2.3, FR-12.1-FR-12.3, FR-13.2) | **Done** on `claude/20260817-183438-scheduler-1-info-apscheduler-executors-def`: the approved banner lifecycle now extends into fixed Homepage, Financial Services, and Properties placements with Admin-managed versioned artwork and shared Sub Admin campaign CRUD. Admin approval (FR-12.3) is preserved unchanged. | `claude-opus-5[1m]` / Extra High | `gpt-5.6-sol` / High | Migration `ee56ff78aa90` adds the `banner_placement` enum, a `banner_templates` catalogue (RLS-enabled, platform-Admin-write, publish-immutable via `trg_banner_template_version_immutable`, one active version per category via a partial unique index), five additive `banners` columns, a campaign-identity immutability trigger, a partial unique index enforcing one live campaign per placement/category, a `banners_delete` grant+policy scoped to Sub Admin drafts, and 29 deterministically seeded `uuid5` template rows pointing at reviewed, text-free artwork committed under `apps/web/public/banner-templates/{placement}/{key}.webp` (1.5 MB total). Existing rows backfill to `homepage`, except `personalized` which backfills to the internal `dashboard` placement, so authenticated personalization is unchanged. **The public endpoint's `?placement=` is typed as a narrow three-value literal, not the raw enum**, so the internal `dashboard` placement is unreachable anonymously — verified live: no param → 200, `?placement=bogus` → 422, `?placement=dashboard` → 422. Nine `audit_action` values close the previously tracked `banners` audit gap across router, service, and scheduler paths, so FR-2.2's audit-family list drops from seven to six. `banner_templates` was added to both the business-line classification ledger (`PLATFORM_CONFIG` — line-neutral shared asset) and the Admin operational coverage registry; without those two entries the exhaustive structural gates failed, which is exactly what they exist to catch. Fresh evidence: 55 focused banner API/RLS/catalog tests, 39 personalization/scheduler/orphan-purge/route-authorization/RLS-coverage tests, and 18 classification/database/Admin-coverage contract tests pass; Ruff check and format pass across 452 API files; Alembic reports the single head `ee56ff78aa90`, already applied to the running stack; regenerated OpenAPI/TypeScript contracts are byte-identical to the committed tree (no drift). Web lint, strict typecheck, and all 376 unit tests pass (up from 368, including new `lib/banner-template-assets.test.ts` and `components/hero-carousel.test.tsx`); the build compiles, typechecks, and statically generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. Residual risks: the monolithic API suite was not run (it has historically reached its 30-minute bound without a report), and no browser pass was possible — no web dev server was running this session and no live approved banner was seeded, so the rendered appearance of a template campaign on the three public pages is **unverified**, as is the `design-review` pass. |
| 0 | Financial Services navbar mega-menu (public UI, maintenance — not FR-numbered) | **Done** on `claude/20260817-125827-which-skill-to-use-to-design-frontend`: the public navbar's "Financial Services" item was a plain link to `/loans`, which now carries 16 products (11 loan types, 4 insurance types, credit cards) with no way to browse them from the navbar without landing on the page and scrolling. This reverses the "dropdown children removed, dedicated pages only" decision from commit `45d9573`. A same-branch follow-up then redesigned the Credit Cards mega-menu tile and moved the /loans trust content per direct user feedback. See `.agent-workflow/DECISIONS.md` DEC-20260817-01 and DEC-20260817-02. | `claude-sonnet-5` / Medium | `claude-sonnet-5` / Medium | Desktop renders a 2-column mega-panel — Loans alone in column 1; Insurance and Credit Cards stacked as two headed sections in column 2 (Credit Cards previously had its own single-item "highlight tile" column, which read as a rendering bug and was merged in per user feedback) — from a new `components/navbars/financial-services-menu.ts` join layer against `lib/products.ts`; mobile flattens the same groups into a native `<details>` disclosure per group. `lib/products.ts`'s `LOAN_PRODUCTS` grew 7 → 16 with a `group`/`navLabel` field each; `/loans` renders them as two labeled bands (`LOAN_PRODUCT_BANDS`) instead of one flat grid, and the "Cards and insurance" band's final tile is now a wide `ProductBand.trust` banner (`lg:col-span-3`) beside the Credit Cards card — replacing the standalone `TrustStrip` that used to sit below the whole grid, per user feedback that it should instead cover the row beside Credit Cards. `property-loan` was retired as a product id, split into `home-loan` (carrying `legacyAnchorId: "property-loan"` so old `/loans#property-loan` links still resolve) and `loan-against-property`; `footer-links.ts`'s `FOOTER_LOAN_IDS` was updated to match. 9 new SVG illustrations were authored in the existing hand-coded style so all 16 `/loans` cards keep the illustrated band (no icon-tile fallback mixed in). `components/ui/navigation-menu.tsx`'s `NavigationMenuViewport` wrapper was recentered so the mega-panel does not clip off-screen at the 1024px `lg` breakpoint. The public `/contact` form's topic selector now says "Financial Services" instead of "Loans" (display label only; the `LeadTopic`/`business_line` wire value stays `"loans"`), matching the navbar/footer rename. No route, API, contract, migration, or RLS change. Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (368/368, including new `lib/products.test.ts` and `components/navbars/financial-services-menu.test.ts`, and updated `nav-items.test.ts`/`footer-links.test.ts`) pass; `pnpm build` compiles, typechecks, and statically generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. No browser automation tool was connected this session, so the interactive manual pass (panel layout/clipping at 1024/1280/1440px, keyboard walk, focus return, reduced motion, mobile drawer) is unverified — flagged as a residual risk. |
| 0 | Dev-stack `web` cold-start SSR fetch timeouts against `api` (dev tooling) | **Done** on `claude/20260817-123618-web-1-invalid-character-err-5-pgbouncer`: cold `docker compose up` let `web` start (and its Server Components begin firing SSR fetches at `api`) as soon as the `api` container process started, not once `api` was actually healthy/reachable — `web`'s `depends_on` used the plain list form while `scheduler`'s already used `condition: service_healthy`. Reproduced live: the homepage's `content-blocks/homepage-closing` SSR lookup hit `serverFetchJson`'s 5s client timeout during a cold boot. | `claude-sonnet-5` / Medium | `claude-sonnet-5` / Medium | `docker-compose.yml`'s `web.depends_on.api` moved from a bare `- api` entry to `condition: service_healthy`, matching `scheduler`. No application, contract, migration, or RLS change. A full cold `down`/`up -d` of the stack (`docker-compose.yml` + `docker-compose.dev.yml`) shows `api` reach `Healthy` before `web`/`scheduler` begin `Starting` in the compose event log, and `web`'s fresh container logs contain zero `serverFetchJson` timeout/network errors across the boot. A separate, dev-only Turbopack first-compile latency artifact (page still returns 200, section gracefully absent, self-heals on the next request, does not occur in a production build) is documented but out of scope for a code fix. |
| 0 | Web `nanoid` audit patch (dependency security) | **Done** on `security/web-nanoid-audit-patch`: CI's `pnpm audit --prod --audit-level high` failed on high-severity GHSA-2v37-7h3g-55p8 in `nanoid` (transitive via `next > postcss > nanoid` and `nuqs > next > postcss > nanoid`), patched `>=3.3.18`. | `claude-sonnet-5` / Medium | `claude-sonnet-5` / Medium | `pnpm update nanoid` in `apps/web` bumped the single deduped lockfile resolution `3.3.16` → `3.3.18`; `postcss` `8.5.23` → `8.5.26` and `rollup` `4.62.2` → `4.62.4` moved incidentally, both within their dependents' existing semver ranges — no `package.json` range changed. `pnpm audit --prod --audit-level high` now clean; web lint, strict typecheck, and all 347 unit tests pass; build generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. |
| 0 | Dev-stack api healthcheck start_period widened (dev tooling) | **Done — [PR #190](https://github.com/brollysolutions/client1/pull/190)** on `claude/20260817-114642-container-client1-redis-1-running-0-0s`: local `docker compose up` intermittently aborted `scheduler` with `dependency failed to start: container client1-api-1 is unhealthy`, stranding it in `Created` even after `api` recovered. | `claude-sonnet-5` / Medium | `claude-sonnet-5` / Medium | `docker-compose.yml`'s `api.healthcheck.start_period` moved 20s → 90s so the cold `alembic upgrade head` (90 migrations) + FastAPI boot path fits inside the grace window before `scheduler`'s one-shot `api: condition: service_healthy` check evaluates; `interval`/`timeout`/`retries` unchanged. No application, contract, migration, or RLS change. A full cold `down`/`up -d` of the stack reached `healthy`/`Started` on every service including `scheduler` in ~4m41s. |
| 0 | Executable coverage gates for RLS, route authorization, and client env exposure (engineering hygiene) | **Done — [PR #188](https://github.com/brollysolutions/client1/pull/188)** on `chore/executable-workflow-gates`: four security invariants that were previously held up by per-feature memory and review attention are now enumerated and enforced by tests. | `claude-opus-5[1m]` / High | `claude-opus-5[1m]` / High | The 37 hand-written `*_rls.py` suites prove existing policies are correct but cannot prove a new table got one; likewise a new route wired to plain `get_db` runs as the `app` SUPERUSER with RLS off and fails silently. Added: `test_route_authorization_coverage.py` (enumerates all 232 routes, asserts each reaches `get_current_user` or sits in a 28-entry reviewed public allowlist; needs no database); `test_rls_coverage.py` (enumerates 49 `pg_class` tables, asserts RLS enabled, declares the two zero-policy deny-all cursor tables, and asserts `api_user` holds neither SUPERUSER nor BYPASSRLS); `middleware-matcher-coverage.test.ts` (enumerates 53 `(app)` pages against the real `config.matcher`, the hazard `middleware.ts` documents in its own comment); `client-env-exposure.test.ts` (rejects secret-shaped `NEXT_PUBLIC_*` names and server-only env reads inside `"use client"` modules); and `scripts/check_migration_rls.py` (+11 unit tests) wired into pre-commit and PR CI so a new `op.create_table` without RLS fails in the diff. Every coverage test carries a vacuous-pass floor, because a walker that silently enumerates nothing is worse than no test — the route walker initially found 2 of 232 routes. Each assertion was mutation-tested red before being accepted. No product behavior, route, contract, migration, or policy changed. `alembic check` was left informational with its `|| true`: all 105 findings are "removed" objects created by migrations without mirrored model metadata, so gating it would be a false-positive wall. Contract drift is already gated by `ci.yml`. Next priority returns to FR-2.2 controlled correction/audit work. |
| 0 | Security-audit remediation: password/session, web-push, and Employee task-document hardening | **Done — [PR #187](https://github.com/brollysolutions/client1/pull/187)** on `security/audit-remediation`: four confirmed reachable findings are remediated without changing role authority or RLS. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Suspended/deleted recovery is neutral and cannot reactivate the account; password change/reset row-lock the identity, preserve suspension, increment the access-session generation, and revoke refresh tokens. Web push accepts configured HTTPS provider hosts only, revalidates legacy rows, refuses redirects, and uses a 10-second timeout. Employee task documents use a signed 5 MiB POST policy, per-account hourly presign budget, single-use owner/task/type-bound upload claim, bounded canonical copy, serialized 12-document quota, and no-store responses. No migration, RLS/grant, role, or general media-pipeline change. Fresh evidence: 128 focused API tests plus final 39-test push/upload, 18-test canonical-upload, and 1-test reset-refresh reruns pass; Ruff and format pass across 447 API files; generated contracts are current; one Alembic head; web lint/typecheck and all 338 tests pass. The build compiles, typechecks, and generates all 93 pages before the known Windows standalone `EPERM`; Docker-only `api` fetches are unavailable on the host. The monolithic API suite reached 30 minutes without a final report and is inconclusive. Security and diff review found and remediated confirmation-budget bypass and post-confirm object replacement; no remaining reachable finding in this slice. Next priority returns to FR-2.2 controlled correction/audit work. |
| 0 | Replace Admin home Audit log frequent action (maintenance) | **Done — [PR #186](https://github.com/brollysolutions/client1/pull/186)** on `codex/20260813-111851-what-does-correct-details-mean-in-admin`: replaced the stale home quick action with the existing Lead assignments workspace. | `gpt-5.6-terra` / Medium | `gpt-5.6-terra` / Medium | The Admin home links to Lead assignments instead of Audit log; no route, API, contract, data, or authorization/RLS behavior changes. Focused regression, lint, strict typecheck, and all 338 unit tests pass. The build compiled, typechecked, and generated all 93 pages before the known Windows standalone `EPERM` symlink failure. Next priority returns to FR-2.2 controlled-correction/audit follow-up. |
| 0 | Hide Admin Website content and Audit log navigation (maintenance) | **Done — [PR #185](https://github.com/brollysolutions/client1/pull/185)** on `codex/20260813-103019-admin-credentials`: removed these two links from the Admin dashboard only, without changing their existing guarded routes, APIs, contracts, data, or authorization. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | Admin navigation omits both links; Sub Admin retains Website content; Admin direct access to both existing routes remains guarded and available. Focused navigation test, lint, strict typecheck, and all 337 unit tests pass. The rebuilt live Admin browser scenario passed the two link assertions but later failed at an unrelated Operational Records search-control expectation; production build compiled, typechecked, and generated all 93 pages but Windows standalone packaging hit known `EPERM` symlink failures. Next priority returns to the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Sub Admin CMS workspace redesign (FR-2.3, FR-9.5, FR-12.1-FR-12.3) | **Done — [PR #184](https://github.com/brollysolutions/client1/pull/184)** on `codex/20260812-203339-bugs-1-for-waiting-on-you-in`: the Sub Admin home approval queue now matches Admin's floating review pattern, and referral rules, banners, offers, and website content use bounded filters, paging, summary metrics, large create/edit workspaces, guidance, and truthful UI previews. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | The home panels align at an increased 310px height; floating editors confirm before discarding populated work; banner/offer previews cover public and authenticated-dashboard presentation; content uses an escaped plain-text public preview and authoring guide. Existing generated contracts, API/RLS authority, banner approval, offer/content lifecycle, and Admin-only payout execution remain unchanged. Fresh evidence: web lint and strict typecheck pass; all 337 unit tests pass; focused live-stack Playwright verifies the four floating authoring workspaces and content guide, while the existing five-route Sub Admin authoring test also passes. The production build compiles, typechecks, and generates all 93 pages before the known Windows standalone `EPERM` symlink failure; host-side public fetches cannot resolve the Docker-only `api` hostname. Security and maintainer review found no actionable defect. Next priority returns to the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Remove Admin unassigned-lead queue UI (maintenance) | **Done — [PR #183](https://github.com/brollysolutions/client1/pull/183)** on `codex/20260812-203339-bugs-1-for-waiting-on-you-in`: removed the read-only capacity queue from the Admin Lead assignments page and repointed its home signal to staffing. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | Assigned-lead oversight remains available, while the unassigned queue component/hook no longer exposes customer data in the browser. The home capacity metric now links to Users & staff and explicitly directs an Admin to add or activate a matching Telecaller. Automatic same-line round-robin/retry, the internal unassigned-list API, route authorization, RLS, contracts, and assignment authority remain unchanged. Fresh evidence: focused 1-test routing regression, nav tests, lint, strict typecheck, and all 330 web unit tests pass. The production build compiles/typechecks and statically generates 93 routes, but Windows standalone packaging fails on required `EPERM` symlink operations with the Docker-only `api` hostname unavailable. Next priority remains the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Admin home review-queue ergonomics (maintenance) | **Done — [PR #182](https://github.com/brollysolutions/client1/pull/182)** on `codex/20260812-203339-bugs-1-for-waiting-on-you-in`: "Waiting on you" and Operational load now share a 270px panel height; the review preview scrolls internally and offers a full-screen filter workspace. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | The accessible dialog filters only the existing Admin-authorized loaded preview by text, review kind, line, and inclusive date range; it clears filters and provides a light-blue-hover close control. The unassigned-lead queue stays read-only because durable same-line Telecaller round-robin plus bounded retry is authoritative; no client assignment authority, API/RLS, or PII projection changes. Fresh evidence: focused 2-test regression, web lint, strict typecheck, and 329-test unit suite pass. The production build compiles/typechecks and statically generates 93 pages but its Windows standalone packaging fails on required `EPERM` symlink operations while the Docker-only `api` host is unavailable; no local authenticated browser stack is running. Next priority remains the FR-2.2 controlled-correction/audit follow-up. |
| 0 | Admin user-list legacy-email resilience (maintenance) | **Done — [PR #181](https://github.com/brollysolutions/client1/pull/181)** on `chore/reset-local-test-data`: an `.test` development seed no longer makes the strict `AdminUserRead.email` response validation return 500 for the whole list. | `gpt-5.6-terra` / Medium | `gpt-5.6-terra` / Medium | The platform-Admin list remains `private, no-store` and returns 200 when a legacy or direct-seeded malformed email is present, redacting that value instead of leaking it or failing the page. The dev Admin seeder rejects malformed input; valid-email behavior, account-deletion redaction, auth/RLS, and the generated contract remain unchanged. Fresh evidence: 16 focused container tests, full API Ruff/format, and one Alembic head. `uv run pytest -q` reached the 30-minute local bound without a final report and is inconclusive. Next priority: retain FR-2.2 Admin operational coverage audit follow-up. |
| 1 | Admin operations filters and table experience | **Done — [PR #180](https://github.com/brollysolutions/client1/pull/180)** on `codex/20260812-112811-yeah-create-pr-for-dev-seed` | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | Replaced the append-only Audit and Operational Records views with page controls, added generated-contract-backed Audit business-line/date/entity filters, and added bounded, accessible filters/paging to the requested Admin, property-review, content, and payout queues. Broadcast is a visual-only two-step composer; it preserves preview, rate limiting, same-origin links, and irreversible confirmation. Users & staff now has matched cards, thin Staff Access scrolling, and a compact paginated account table with reasoned suspension confirmation. Fresh evidence: API Ruff/format, regenerated contract, web lint/typecheck and 327 Vitest tests; database-backed API tests are blocked locally by the missing native `greenlet` DLL, and the Windows production build exceeded the three-minute cap. |
| 0 | Fail-closed operational identity and automatic Employee assignment (FR-2.1-FR-2.8, FR-4.1-FR-4.6, FR-7.1, FR-17.3-FR-17.4) | **Done** in [PR #175](https://github.com/brollysolutions/client1/pull/175): later product direction removes Admin assignment actions, excludes operational identities from customer lead queues, makes field-task and pickup assignment automatic per concrete line, and requires deleted/orphaned identities to terminate rather than fall back to Client. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Deleted or profile-less operational identities fail closed and leave the dashboard for `/`; active staff/Agents never enter assignable lead queues; Lead assignment remains durable per-line round-robin without Admin mutation; Telecaller-raised field tasks and real-estate pickups use concurrency-safe active-Employee round-robin with no-capacity retry and dual-line eligibility; Admin sees assignment relationships read-only; authorization, RLS, PII minimization, audit, notifications, and generated contracts remain safe. |
| 1 | Notification unread-state synchronization (FR-17.1) | **Done** in [PR #176](https://github.com/brollysolutions/client1/pull/176): one dashboard-scoped client source now reconciles page, bell, and preview snapshots; stale count responses cannot overwrite a newer mutation. Fresh evidence: focused state regressions, 324 web unit tests, lint, strict typecheck, and the live nine-scenario role/navigation suite. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | The bell, preview, and notification page reconcile immediately after single/all read mutations; failures roll back or refetch; all roles share the same behavior; notification ownership remains enforced by the existing API/RLS boundary. |
| 1 | UI-only Settings, Operational Records, filters, and form navigation | **Done** in [PR #177](https://github.com/brollysolutions/client1/pull/177): Settings now limits personal-profile fields to Clients, removes Operational Records from the sidebar while retaining the existing guarded Admin route, filters already-loaded records locally, and gives dashboard form return links a dedicated back affordance. Fresh evidence: 327 web unit tests, lint, strict typecheck, focused Admin/Employee/Sub Admin Playwright coverage, and `git diff --check`; the local production build exceeded the five-minute execution cap without a result. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | Client personal fields remain available only to Clients; staff retain account controls; no endpoint, contract, or authorization changes; Operational Records data stays Admin-only and minimized; filters operate only on already-returned data; form return links stay accessible and deterministic. |
| 0 | Dev-seed Indian mobile-number correctness (maintenance) | **Done** in [PR #174](https://github.com/brollysolutions/client1/pull/174): one shared synthetic-number helper corrects the Agent-application, Telecaller, and affected test generators. | `gpt-5.6-terra` / Medium | `gpt-5.6-terra` / Medium | Ten-digit, 6–9-prefixed Indian local numbers are generated; 52 focused container API/RLS tests plus focused Ruff/format checks pass. Public E.164 validation, authorization, RLS, and production intake behavior are unchanged. |
| 0 | AWS-inspired multi-role dashboard experience (FR-2.1-FR-2.7, FR-17.1) | **Done** in [PR #167](https://github.com/brollysolutions/client1/pull/167): the delivered role homes, Admin Users & staff, and Sub Admin forms now extend across the complete Client Loans and Real Estate workspace plus a universal notification preview. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / High | Staff/Agent desktop navigation is expanded without a `PanelLeft` control; Client persistence and every mobile drawer remain intact; the same concept uses one icon across navigation and home surfaces; all named Client loan/property workflows use shared accessible operational patterns; referral copy/share feedback and the all-role notification preview are keyboard-accessible; location selection reuses existing catalog facets without GPS/Map/GMB; API/RLS, ownership, upload, payout, and safe-link authority remain intact. |
| 0 | Delegated payout operations and Admin hierarchy (FR-2.2, FR-2.3, FR-10.3) | **Done** in [PR #165](https://github.com/brollysolutions/client1/pull/165): one durable Main Admin, bounded additional Admin provisioning, an explicit Sub Admin payout-request grant, immediate session invalidation, and the approved standalone Main Admin payout exception are implemented across API, RLS, audit, contracts, and web UI. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | One immutable Main Admin can create at most three additional active Admins and grant/revoke the closed payout-request feature for active Sub Admins; granted Sub Admins may create/list payout requests but never approve, reject, issue, clear, fail, or reverse them; Main Admin-created payouts proceed without another approval while every other maker still requires a different Admin; self-payout, caps, idempotency, provider, audit, RLS, and ledger controls remain intact. |
| 1 | Staff line access and payout workflow corrections (FR-1.4, FR-2.5, FR-2.6, FR-10.3, FR-11.x) | **Done** in [PR #164](https://github.com/brollysolutions/client1/pull/164): Admin can provision Telecallers and Employees for Loans, Real Estate, or Both; selected-line RLS isolation, payout handoff UX, notification verification, and the hidden-but-scrollable Admin sidebar track are implemented and tested. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Both-line staff remain assignment-scoped and never receive platform bypass; payout maker/checker, caps, idempotency, audit, and ledger invariants remain intact; notification behavior is freshly tested; sidebar scrolling remains usable without a visible scrollbar. |
| 1 | Analytics verification (FR-16.1–FR-16.3) | **Done** in [PR #156](https://github.com/brollysolutions/client1/pull/156): a Linux PostgreSQL/Redis run passed the reporting service/API/RLS suite, and the web production build completed. | `gpt-5.6-terra` / High | `gpt-5.6-terra` / High | No defect was proven; retain the existing authorization, RLS, export-safety, and team-dimension invariants. |
| 2 | Media controls completion (FR-13.1–FR-13.4) | **Done** in [PR #159](https://github.com/brollysolutions/client1/pull/159): purpose-bound property and Loans MP4, assigned-Employee property-visit feedback attachments, fail-closed malware scanning, metadata removal/transcoding, and explicit retention complete the approved scope without a universal asset library. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Preserve the delivered purpose, assignment, line, private/public promotion, processing-state, retention, and account-deletion invariants. |
| 3 | Role-aware dashboard navigation (FR-2.1–FR-2.7, FR-17.1) | **Done** in [PR #162](https://github.com/brollysolutions/client1/pull/162): one typed capability catalogue now drives grouped navigation and direct-route UX for all 52 dashboard page entry points; 9 focused unit tests, all 310 web tests, an 8-case live-stack Playwright role/mobile matrix, and the canonical Linux production build pass. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Preserve the single capability source, explicit route inventory, Client held-line checks, single-line staff scope, fixed local redirects, and server-side dependency/RLS authority whenever dashboard routes change. |
| 4 | Round-robin Telecaller assignment (FR-4.2, FR-4.3) | **Done** in [PR #163](https://github.com/brollysolutions/client1/pull/163): workload-sensitive selection is replaced by the explicitly requested durable rotation while preserving the delivered assignment lifecycle. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / Extra High | Each business line advances independently through active same-line Telecallers in stable creation order; concurrent automatic assignments cannot duplicate or skip a turn; inactive-staff repair, no-capacity retry, RLS, audit, and notification behavior remain safe. |
| 5 | Provenance-based edit ownership (FR-2.8) | **Done** in [PR #169](https://github.com/brollysolutions/client1/pull/169): lead name and journey notes retain their Agent/Client creator, Agent edits remain open through assignment until work begins, Client edits remain open until terminal state, Admin corrections require an audited reason, and Telecaller qualification data stays in activities. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / Extra High | Preserve immutable ownership, row locking, lifecycle cutoffs, no-store least-data responses, and service plus RLS/trigger denial coverage. |
| 6 | Admin operational coverage audit (FR-2.2) | **Visibility remediation delivered; follow-up queued** in [PR #173](https://github.com/brollysolutions/client1/pull/173): [PR #172](https://github.com/brollysolutions/client1/pull/172) delivered the exhaustive 47-table/68-policy contract, and this slice closes all eight confirmed read gaps without adding generic CRUD. | `gpt-5.6-sol` / Extra High | `gpt-5.6-sol` / Extra High | Next, add the typed approved-listing correction command and seven missing append-only audit-event families. Preserve protected secret/location/media fields, immutable ledgers, command-bound mutation, RLS, and FR-2.2 Partial status until those eight remaining gaps are closed. |
| 7 | Business-line classification hardening (FR-1.1) | **Done** in [PR #160](https://github.com/brollysolutions/client1/pull/160): every mapped table and managed-media purpose has an explicit classification mode; operational rows, fixed domains, staged referrals, global content, staff scope, and audit exceptions are database-constrained. | `gpt-5.6-sol` / High | `gpt-5.6-sol` / Extra High | Preserve the exhaustive classification ledger, exact-line lead intent, count-only deployment preflight, immutable tags, and parent/provenance checks as schemas evolve. |

**Final banner acceptance update (2026-08-18; supersedes the residual-risk sentence in the banner row above):** Homepage, Financial Services, and Properties now share a server-enforced maximum of seven live slides and the same automatic horizontal carousel behavior. Homepage retains its approved hero proportions; the Financial Services and Properties carousels sit at the top of their pages in a shorter 5:2 format, with copy-safe left artwork and category-specific property/finance advertising. Desktop and 390px mobile browser passes verified fit, blending, controls, and responsive copy with no relevant console errors; temporary review data was removed. The post-review security hardening also excludes linked Offers with non-empty audience rules from anonymous serving and scheduled activation. The focused final API/RLS/scheduler/coverage gate passes 106 tests. A monolithic API run completed with 1,683 passes and eight failures on the long-lived shared stack; its one feature-owned policy-ledger failure was corrected and is green in the 106-test rerun, while the other seven are unrelated pre-existing shared-state failures. Web lint, strict typecheck, and all 376 unit tests pass; production compilation, typechecking, and generation of all 93 pages pass before the known Windows standalone symlink `EPERM` packaging failure. Security, design, and diff review found no remaining actionable banner defect.

**Delivery:** [PR #194](https://github.com/brollysolutions/client1/pull/194). Next priority remains the FR-2.2 controlled-correction and remaining audit-family follow-up.

### Delivered feature brief - Admin operational coverage contract

- **Branch / PR:** `security/admin-operational-coverage-contract` /
  [PR #172](https://github.com/brollysolutions/client1/pull/172).
- **Success:** one explicit registry classifies every one of the 47 SQLAlchemy
  tables by operational domain, sensitivity, safe Admin view mode, supported
  update command, API/UI surface, RLS expectation, audit expectation, and
  coverage state. Every noun named by FR-2.2 maps to current storage, and a
  structural test fails whenever a future mapped table has no decision.
- **Measured outcome:** 16 tables have a confirmed gap: eight view gaps
  (`auth_events`, `auth_users`, `client_profiles`, `enquiries`,
  `lead_activities`, `loan_txn_history`, `site_visits`, `transactions`), one
  controlled-correction gap (`properties`), and seven append-only audit gaps
  (`banners`, `content_blocks`, `loan_applications`, `offers`,
  `property_deals`, `referral_bonus_config`, `tasks`). Intentional prohibitions
  for secrets, precise location, private media, and internal state are recorded
  as protected decisions rather than false missing-CRUD findings.
- **Security and compatibility:** no route, response contract, grant, RLS
  policy, migration, UI, or runtime authorization changes. Mutation claims are
  restricted to named workflow/status/configuration commands; raw refresh
  tokens, push endpoints, storage keys, and personalization coordinates remain
  unavailable to Admin. The PostgreSQL policy test ledger now exhaustively
  matches all 68 current `platform_scope` policies and still rejects every
  bare scope bypass.
- **Fresh evidence:** 20 focused Docker-network PostgreSQL/Redis tests pass,
  including platform-Admin success plus Client and line-scoped Admin denial for
  suspend/reactivate, read-only notification oversight, and listing
  publish/hide; audit details and target session invalidation are asserted.
  The run also exposed and recorded a real user-list defect: a soft-deleted
  account's `deleted.invalid` tombstone email fails response validation. Eight
  registry invariants and the three platform-policy invariants pass. FR-2.2
  remains Partial because this PR inventories and proves the work; it does not
  close the 16 identified behavior/audit gaps. Full Ruff and formatting checks
  pass across 436 API files and Alembic reports the single current head.
  Security review tightened reusable session/push-secret tables to a mandatory
  prohibited/no-surface posture and found no remaining reachable issue. The
  monolithic API regression reached its 30-minute command bound without
  emitting a pytest report, so that aggregate run is inconclusive.
- **Non-goals:** generic Admin CRUD, arbitrary identity/financial/ownership
  edits, new endpoints or screens, exposing protected values, changing payout
  or document authority, or claiming FR-2.2 complete from an inventory alone.

### Delivered feature brief - Admin operational visibility remediation

- **Branch / PR:** `security/admin-operational-coverage-contract` /
  [PR #173](https://github.com/brollysolutions/client1/pull/173).
- **Success:** the platform-Admin Users & staff surface lists soft-deleted
  accounts safely and shows minimized per-line Client profile context. A
  dedicated Operational records workspace pages through authentication events,
  enquiries, lead activities, loan transaction history, site visits, and the
  transaction ledger using generated response contracts.
- **Authorization and privacy:** every new route requires `role=admin` and
  `platform_scope=true` before querying through the request's RLS-bound async
  session. Projections exclude IP addresses, user agents, authentication detail,
  enquiry/visit contact fields and messages, vehicle pickup locations, external
  or retained transaction references, and deleted-account tombstone emails.
- **Compatibility:** no migration, grant, RLS-policy, producer, workflow-state,
  or mutation-authority change. Existing owner/staff endpoints and account
  status commands retain their contracts except for additive Client profile
  context and nullable redacted mobile/email values on deleted accounts.
- **Acceptance evidence:** focused API tests cover platform-Admin reads,
  pagination, exact minimized keys, and Client/Sub Admin/line-Admin denial;
  account-deletion regression coverage proves the user list remains valid.
  Generated OpenAPI/TypeScript contracts, explicit Admin navigation/route rules,
  accessible loading/error/empty states, and the applicable API/web/repository
  gates must pass before shipping.
- **Non-goals:** generic record CRUD, exports, raw authentication metadata,
  reusable secrets, exact pickup locations, private media/storage keys,
  arbitrary identity or financial edits, and the later approved-listing
  correction or seven missing audit-event families.
- **Fresh evidence:** Ruff and formatting pass across 440 API files; 29 focused
  API, authorization, lifecycle, and exhaustive platform-scope RLS tests pass;
  generated OpenAPI/TypeScript contracts are current; web ESLint, strict
  TypeScript, and all 321 Vitest tests pass; and the canonical Linux production
  image build packages all 93 routes. Security and PR self-review remediated a
  missing valid `pending` Client-profile state, missing sensitive-response
  no-store headers, and tab-panel semantics; no reachable finding remains. The
  Windows host build exceeded its command bound without a report, while the
  Linux build passed. The repository-wide verifier likewise reached its
  30-minute command bound without emitting a report, so that aggregate run is
  inconclusive.

### Delivered feature brief - provenance-based edit ownership

- **Branch / PR:** `codex/20260810-161623-ps-d-dhanadhara-client1-docker-compose-f` /
  [PR #169](https://github.com/brollysolutions/client1/pull/169).
- **Success:** lead names and journey notes carry immutable creator descriptors.
  Agent-owned values remain editable by that Agent while the lead is `new` or
  `assigned`; Client-owned values remain editable by that Client until the
  journey becomes terminal. Platform Admin may correct either with a required
  audit reason while preserving the original owner.
- **Architecture and UI:** additive JSONB provenance is initialized on every
  lead-creation/binding path and conservatively backfilled for legacy rows.
  One row-locked service powers Agent, Client, and Admin edits. Client Settings
  exposes only creator-editable journey fields; both Admin lead queues expose a
  correction dialog with ownership labels. Generated OpenAPI types remain the
  web contract.
- **Security and compatibility:** command-specific RLS plus a database trigger
  enforce role, line, lifecycle, immutable-owner, and allowed-column rules.
  Ownership descriptors cannot be planted without a newly supplied value.
  Employee/Sub Admin status progression remains intact but cannot alter detail
  fields; Telecaller qualification notes are accepted only through append-only
  activities. Responses include only name/notes and use `private, no-store`;
  audit records contain changed field names and the bounded reason, not values.
- **Non-goals:** generic provenance for every domain model, Client mobile-number
  edits, arbitrary Telecaller requirement mutation, Agent ownership transfer,
  or a new review workflow. Support-assisted mobile change remains authoritative.
- **Fresh evidence:** all 85 affected ownership, public capture, Agent,
  Telecaller, and lead-RLS tests pass on the final tree; Ruff passes across all
  433 API files. The migration
  repeatedly downgrades/upgrades and Alembic reports one head. Generated
  contracts, full web ESLint, strict TypeScript, all 320 Vitest tests, and a
  Linux production image packaging all 92 pages pass. Security review remediated
  descriptor planting, stale-row races, superuser capture/claim overwrites,
  direct-insert provenance spoofing, response overexposure/cacheability, and
  silent Telecaller extras; no finding
  remains. The repository-wide verifier reached its 30-minute bound without
  emitting a report, so that aggregate run is inconclusive rather than passing.

### Delivered feature brief - AWS-inspired multi-role dashboard experience

- **Branch / PR:** `feat/aws-inspired-dashboards` /
  [PR #167](https://github.com/brollysolutions/client1/pull/167).
- **Success:** Clients retain an optional desktop rail (later changed to always
  start collapsed by the loans-client home decluttering follow-up below) while
  every operational role receives a stable, always-expanded desktop workspace; all
  six landing pages make priority work, status, and frequent actions scannable
  without duplicating the entire sidebar. The follow-up extends that hierarchy
  to Admin Users & staff while preserving its existing provisioning and access
  controls, plus the banner, offer, content-block, property-submission, and
  referral-rule authoring workflows.
  The active Client follow-up covers loan detail, Explore, loan application,
  loan media, offer comparison, loan-officer, transaction, referral,
  notification, enquiry, site-visit, property comparison, assigned-agent,
  bookmark, and listing-submission surfaces, plus an all-role notification
  preview in the shared shell.
- **Behavior and architecture:** derive desktop rail behavior from the signed
  session role inside the existing shell; preserve the role/line capability
  catalogue and mobile sheet; introduce one semantic icon registry and small
  shared dashboard presentation primitives; adapt existing home data without
  inventing metrics or adding fetches solely for decoration.
- **Compatibility and security:** browser navigation remains a UX hint only;
  API dependencies and PostgreSQL RLS remain authoritative. Preserve dual-line
  switching, short-viewport navigation,
  loading/error/empty behavior, reduced-motion support, keyboard focus, and
  light-only/blue-only accepted visual decisions. Do not expose new PII or
  render unauthorized counts.
- **Non-goals:** copying AWS branding, adding Cloudscape or another dependency,
  changing routes, permissions, API schemas, payout behavior, database/RLS,
  form validation/business logic, GPS collection, Map/GMB integration, or
  configurable drag-and-drop dashboards.
- **Verification matrix:** sidebar state and icon-registry unit tests; existing
  role/line navigation matrix; targeted home tests where practical; lint,
  strict typecheck, full Vitest, production build, and Playwright coverage for
  all six roles plus Client and staff mobile behavior; accessibility and
  responsive browser review at desktop, short-desktop, and phone widths.
- **Fresh evidence:** 15 focused sidebar/navigation tests and all 319 web unit
  tests pass; full ESLint and strict TypeScript pass; the Linux production image
  compiles and packages all 92 routes; and eight live-stack Playwright cases
  pass across all six roles, Sub Admin authoring, and Client mobile navigation.
  The Employee case asserts its Real Estate Vehicle arrangements card. The
  native Windows build compiled, typechecked, and generated all routes before
  the known standalone symlink `EPERM`; the Linux image is authoritative.
  The follow-up reran full ESLint, strict TypeScript, all 319 unit tests, the
  eight-case live-stack Playwright matrix (including Admin Users & staff and all
  five Sub Admin authoring routes), and a Linux production image that compiled
  and packaged all 92 routes.
  The Client-workspace follow-up adds a real application-backed loan-detail
  journey, all named Loans and Real Estate route headers, in-code referral copy
  confirmation, a WhatsApp glyph, catalog location selection, and a shared
  notification preview for every role. Full ESLint, strict TypeScript, all 319
  unit tests, and a nine-case live-stack Playwright matrix pass; the matrix
  covers all six roles, every Sub Admin form, Client mobile navigation, all
  named Client surfaces, clipboard feedback, WhatsApp rendering, and structured
  location selection. The exact final-tree native production build compiled,
  passed its internal lint/type phase, and generated all 92 routes before the
  known Windows standalone symlink `EPERM`; a separate Linux image attempt
  reached its 15-minute bound without a final report after Docker Desktop became
  unresponsive, so artifact export is inconclusive rather than passing.

### Delivered feature brief - staff line access and payout workflow corrections

- **Branch / PR:** `feat/staff-lines-payout-workflow` /
  [PR #164](https://github.com/brollysolutions/client1/pull/164).
- **Success:** Admin can provision Telecallers and Employees for Loans, Real
  Estate, or Both; dual-line staff can work only records assigned to their
  identity in either permitted line; and a payout raised by one Admin reaches a
  different eligible Admin for approval without allowing self-approval.
- **UI behavior:** hide the Admin sidebar's visual scrollbar while preserving
  wheel, touch, keyboard, and short-viewport reachability. Display both-line
  staff scope and line-aware queues. Make a creator-owned pending payout read as
  waiting for another Admin rather than presenting a failing approval action.
- **Architecture:** represent dual-line line staff with the existing `both`
  business-line enum while retaining `scope=line`; update trusted JWT context,
  API contracts, role-aware navigation, assignment eligibility, and only the
  current RLS policies that authorize Telecaller/Employee assigned workflows.
  Notify other active platform Admins after a payout request commits.
- **Security and compatibility:** `both` must never set platform scope or grant
  Admin/Sub Admin/Agent capabilities. Telecallers remain limited to assigned
  leads and Employees to assigned tasks/arrangements. Preserve immutable record
  line tags, independent round-robin cursors, maker != checker, maker/checker !=
  recipient, amount/daily caps, deduplication, row-locked transitions, provider
  separation, masked destinations, ledger consistency, and PII-free audit and
  notification payloads.
- **Non-goals:** Agent dual-line access, unassigned staff-wide data access,
  weakening payout approval, changing payment providers, real-time notification
  transport, redesigning the dashboard, or changing existing notification
  producers unless fresh tests prove a defect.
- **Verification matrix:** notification API/RLS/link/push tests; sidebar
  short-viewport accessibility; staff-create schema/API/UI cases for all three
  scopes; dual-line automatic/manual lead and task assignment; per-line cursor
  behavior; same-user and cross-role/cross-assignment RLS denial; payout creator
  UX and API denial; different-Admin approval and notification; concurrent
  approval/ledger idempotency; migration round-trip and one head; generated
  contract diff; full API/web gates; security and PR review.

### Delivered feature brief - round-robin Telecaller assignment

- **Branch / PR:** `feat/lead-round-robin` /
  [PR #163](https://github.com/brollysolutions/client1/pull/163).
- **Success:** for each business line, consecutive automatically assigned leads
  cycle through active Telecallers in stable creation order: 1, 2, 3, 1, 2,
  3, independently of whether earlier leads remain active.
- **Behavior:** only active same-line Telecallers participate. Inactive staff
  are skipped and rejoin when reactivated; a newly created Telecaller joins the
  stable order. The cursor advances only after a successful automatic
  assignment. Manual Admin assignment or reassignment does not consume a turn,
  and missing capacity leaves the lead in the existing bounded retry queue.
- **Architecture:** persist one internal cursor per operational business line
  and update it in the same transaction as the lead assignment. Reuse the
  existing per-line advisory lock so direct capture, Agent introduction,
  registration binding, client journey creation, and the scheduler serialize
  selection consistently under concurrency.
- **Security and failure invariants:** preserve exact-line server-side
  selection, the database assignee-validation trigger, existing lead and staff
  RLS, OTP ownership binding, PII-free audit/notification payloads, post-commit
  notifications, terminal-state exclusions, and idempotent no-capacity retry.
  The cursor is internal operational state and is not exposed through an API.
- **Non-goals:** workload balancing, shifts or quotas, changing manual Admin
  controls, Agent ownership or expiry, lead statuses, UI/API/contract changes,
  notification content, or cross-line staff access.
- **Verification matrix:** stable 1-2-3 rotation and wraparound; independence
  from assigned/working workload; separate Loans and Real Estate cursors;
  inactive/reactivated/new Telecaller behavior; no-capacity retry; idempotency;
  concurrent assignment ordering; database cross-line rejection; migration
  upgrade/downgrade and one head; focused and full API gates; security and diff
  review; feature-tracking checks.
- **Fresh evidence:** all 188 affected lead, auth, Admin, Agent, expiry, RLS,
  classification-contract, and database-contract tests pass after the final
  concurrency hardening; the focused assignment/classification group passes 25
  tests. Ruff lint and formatting pass across 423 API files. The migration
  downgrade/re-upgrade succeeds and Alembic reports one head. Security review
  added row locks around eligible Telecallers plus direct zero-grant/RLS and
  cross-line cursor-tampering denial tests; no actionable finding remains. The
  monolithic full API command reached its explicit 30-minute bound without a
  final pytest report and is inconclusive rather than passing. No API schema,
  generated contract, web surface, dependency, or external integration changed.

### Delivered feature brief - role-aware dashboard navigation

- **Branch / PR:** `security/business-line-classification` /
  [PR #162](https://github.com/brollysolutions/client1/pull/162).
- **Success:** after login, Client, Agent, Telecaller, Employee, Sub Admin, and
  Admin users land on their existing role home and see a complete, responsive
  sidebar containing only the current features authorized for that role and,
  where applicable, its business line.
- **Behavior and architecture:** replace overlapping navigation booleans with a
  typed, declarative role/line capability map. Use the same map for sidebar
  filtering and a dashboard-level direct-route UX guard, including nested
  routes. Group large Admin and Sub Admin menus without changing destinations;
  preserve the existing Client line switcher and line-specific feature sets.
- **Acceptance criteria:** Client Loans/Real Estate items remain isolated by the
  active line; Agent, Telecaller, and Employee items remain single-line; Sub
  Admin receives its current CMS, property-submission, and referral-rule
  surfaces; Admin receives all currently guarded operational surfaces; shared
  notification/settings/support destinations remain intentionally common; and
  mobile, expanded, collapsed, tooltip, active-state, and keyboard behavior
  remain usable.
- **Security and compatibility:** browser role/JWT checks remain navigation
  hints only. Existing API dependencies, service ownership checks, PostgreSQL
  RLS, platform-scope requirements, and record/business-line predicates remain
  authoritative and unchanged. A hidden item or UX redirect must never be
  treated as authorization, and the map must not advertise any route whose API
  currently denies that role.
- **Non-goals:** new features, API/schema/contract/migration changes, permission
  expansion, changing login credentials or session storage, replacing role
  home content, redesigning the dashboard visual system, or completing the
  broader FR-2.2 view/update coverage gap.
- **Verification matrix:** pure role/line navigation tests for all six roles;
  Client-only and cross-line negative cases; shared and nested-route access
  tests; sidebar expanded/collapsed/mobile rendering and accessible labels;
  targeted Vitest; web lint, typecheck, full unit suite, production build, and
  role-based Playwright where the existing fixtures permit it; security review,
  diff review, and repository feature-tracking checks.
- **Delivered evidence:** every one of the 52 checked-in dashboard pages has an
  explicit route rule; 9 focused Vitest cases cover exact navigation matrices,
  nesting, shared pages, held Client lines, and negative routes; all 310 web
  tests pass; 8 Playwright cases pass against disposable Client, Agent,
  Telecaller, Employee, Sub Admin, and Admin sessions, including mobile and
  authoring behavior; lint and typecheck pass; and the canonical Linux Docker
  builder completes the production build. The native Windows build completed
  compilation, type validation, and all 92 static pages before the known host
  EPERM symlink limitation in standalone packaging. Security and diff reviews
  found no remaining actionable issue; no API, contract, database, RLS, or
  permission change was made. Completion coverage remains 98.7% because this
  hardens already-complete role-dashboard requirements.

### Delivered feature brief - business-line classification hardening

- **Branch / PR:** `security/business-line-classification` /
  [PR #160](https://github.com/brollysolutions/client1/pull/160).
- **Success:** every operational lead, workflow, content artifact, upload, and
  report row is classified as exactly `loans` or `real_estate` at creation;
  platform/identity records and deliberately global content are explicit,
  allowlisted exceptions rather than accidental nullable rows.
- **Behavior:** login and password-recovery attempts no longer create sales
  leads without service intent. Public lead capture requires an operational
  line; a dual-line Client still has independent per-line journeys, while
  platform Admin/Sub Admin identity scope remains separate from record tags.
- **Architecture:** add a maintained classification contract for every mapped
  table and managed-media purpose; derive child tags from fixed domains or
  owning rows; enforce operational-only values, lifecycle-specific nullable
  states, parent/child equality, and immutability in an additive migration and
  service validation.
- **Security and failure invariants:** reject `both`, missing, mismatched, and
  post-creation line changes on operational records even through bypass paths;
  preserve owner checks and Admin-only platform bypass; use count-only migration
  preflight, deterministic backfill, and fail closed on ambiguous legacy data;
  never log row PII while diagnosing classification failures.
- **Compatibility:** preserve CS-001 dual-line Clients, current platform-scoped
  Admin/Sub Admin behavior, global CMS content, historical audit records,
  payout idempotency/retention, and purpose-specific media privacy. Request
  payloads may express intent but never override a profile, route, source, or
  parent-derived line.
- **Non-goals:** record reclassification UI, changing RLS ownership semantics,
  merging Client journeys, introducing a universal media library, adding a new
  telemetry/dependency surface, or rewriting historical audit events.
- **Verification matrix:** structural classification-contract coverage; public
  and auth capture behavior; direct SQL null/`both`/mutation rejection; staged
  lifecycle first-assignment checks; parent/child mismatch rejection; every
  role's same-line/cross-line RLS outcomes; payout/referral provenance; all
  managed-media purposes; migration upgrade/downgrade and one head; focused and
  full API/web/contract/repository gates; security and PR review.
- **Fresh evidence:** all 1,602 current API tests are covered across four clean,
  isolated PostgreSQL/Redis groups; obsolete fixture expectations found by the
  grouped run were corrected and every affected file rerun with no remaining
  failure. Ten structural/direct-database classification tests, a migration
  downgrade/re-upgrade, four clean installs, Ruff lint/format, one Alembic head,
  generated contracts, web lint/typecheck, all 301 web tests, and a Linux
  92-page production build pass. The shared development database remains
  intentionally blocked by count-only preflight because it contains 424
  ambiguous legacy leads; deployment requires authoritative operational
  classification rather than an inferred or lossy backfill. Security and diff
  review found no remaining reachable vulnerability or correctness defect.

### Delivered feature brief - workflow-bound Loans media gallery

- **Branch:** `feat/media-controls-completion`.
- **Success:** a Client can view private loan media grouped by its owning loan
  application, preview supported images, download PDFs, upload from the device,
  and capture a photo while retaining the existing review status and notes.
- **Architecture:** extend the existing `loan_documents` purpose-bound model and
  generated contract. New confirmations copy verified staging objects to an
  immutable owner/application/media canonical key; legacy stored and in-flight
  keys remain readable so the change is additive and deploy-safe.
- **Security invariants:** server-side ownership and business-line checks,
  PostgreSQL RLS, private storage, declared-type plus magic-byte verification,
  the existing 5 MiB/file and 12 files/application limits, per-owner presign
  throttling, opaque API responses, deletion, and orphan cleanup remain
  mandatory. A replay or copy/database failure must not replace or expose an
  accepted object.
- **Non-goals:** video, public Loans media, site-visit feedback attachments, a
  universal asset library, new reviewer roles, and an external malware scanning
  provider. Video and feedback need separate purpose, retention, and access
  policy decisions.
- **Verification:** focused service/API/storage-failure and web behavior tests;
  owner, cross-user, cross-line, replay, quota, and cleanup denial coverage;
  generated contracts; 39 Loans/storage API tests; 23 RLS/Admin-verification
  tests; 298 web unit tests; one seeded Playwright journey; full web lint,
  typecheck, and an isolated Linux 92-page production build; feature-tracking
  checks; and one Alembic head all pass. Security review remediated response
  caching and private-key logging. The repository-wide API suite reached its
  20-minute command bound without a final report and is inconclusive rather
  than passing.

### Approved integrated feature brief - media controls finalization

- **Branch / PR:** `feat/media-controls-finalization` /
  [PR #159](https://github.com/brollysolutions/client1/pull/159).
- **Success:** complete FR-13.1 through FR-13.4 with purpose-bound Real Estate
  and Loans video, private Employee site-visit feedback attachments, safe
  playback/download behavior, and a documented lifecycle for every managed
  media purpose.
- **Architecture:** extend the existing property-submission and loan-application
  media boundaries; add a dedicated property-visit feedback-media child rather
  than overloading `task_documents`; process attacker-controlled assets into
  immutable canonical objects before they become previewable or public. Keep
  generated contracts owned by FastAPI and storage keys out of API responses.
- **Security invariants:** server-stamped business line, owner/assignment and
  platform-Admin authorization, PostgreSQL RLS, signed upload size/type policy,
  content verification, self-hosted fail-closed malware scanning, metadata
  removal, bounded video validation/transcoding, quotas and rate limits,
  no-store private links, row-locked idempotency, account-deletion cleanup, and
  scheduled orphan/retention cleanup. Pending, failed, or unscanned media must
  never be public or playable.
- **Compatibility:** preserve existing image/PDF rows, legacy/canonical object
  keys, Admin-only property review, verified-document behavior, catalogue image
  projection, and current deletion semantics. Deploy additive schema and
  processing support before exposing new controls.
- **Non-goals:** a universal media library, public Loans media, new reviewer
  roles, marketing/user-generated feeds, client-visible internal visit
  feedback, live streaming, and any third-party scanner/transcoder that exports
  private media outside the deployment.
- **Verification:** focused schema/service/storage/processor tests; owner,
  assignment, role, cross-user, and cross-line denial; MIME/signature, malware,
  codec/duration/dimension, quota, rate-limit, replay, concurrency, processing
  outage, deletion, retention, and orphan cleanup; generated contracts; RLS and
  migration upgrade/downgrade/one-head checks; accessible responsive web flows;
  seeded Client/Employee/Admin browser journeys; full applicable API/web gates;
  security review; PR review; and repository verification.

### Delivered feature evidence - media controls finalization

- **Behavior:** Real Estate submissions accept one MP4 and Loans applications
  accept up to two MP4 assets within their existing per-application quota.
  Assigned Real Estate Employees can add private image/PDF feedback to active
  property-visit tasks; platform Admin can review it without exposing it to
  Clients, Agents, Telecallers, or unrelated Employees.
- **Processing and lifecycle:** ClamAV scanning fails closed outside the
  explicitly disabled development mode; Pillow rewrites accepted images; and
  FFmpeg emits bounded H.264/AAC MP4 without submitted metadata or subtitle
  streams. Row-locked jobs recover stale work, preserve retriable staging data
  on scanner outages, remove known-malicious or irreparably invalid objects,
  and enforce the approved 7/90-day private retention windows. Account deletion
  and orphan cleanup include feedback media.
- **Security and review:** private signed links are no-store; server-side
  ownership, assignment, role, business-line, quota, and state checks are
  backed by RLS and database ready-video invariants. Security review fixed
  feedback-uploader account-deletion cleanup. PR review fixed immediate malware
  cleanup, ready-video metadata constraints, Admin review polling, and bounded
  Admin task queries; no actionable finding remains.
- **Fresh verification:** Ruff lint/format pass across 418 API files; 117
  affected PostgreSQL/RLS/media tests pass after the earlier 1,589-test full API
  regression; the migration downgrade/re-upgrade passes with exactly one head;
  generated contracts are current; web lint/typecheck and all 301 Vitest tests
  pass; the Linux production image builds all 92 routes; and all four Playwright
  journeys pass against that production image. The mandated
  `./scripts/verify.sh --ci` wrapper was also run, but its monolithic API phase
  reached the 30-minute command bound without a final pytest report; it is
  inconclusive rather than passing, and its later web stages did not run inside
  that wrapper.

## Delivered and historical backlog

Admin field visibility and contact controls are **Done** in
[PR #145](https://github.com/brollysolutions/client1/pull/145). Agent-lead expiry was delivered earlier
from the same branch in [PR #144](https://github.com/brollysolutions/client1/pull/144).
Vehicle arrangements are **Done** in
[PR #149](https://github.com/brollysolutions/client1/pull/149). Analytics,
notification/email redirect completion, and Lead assignment completion are
merged. Payment-method completion is merged in
[PR #154](https://github.com/brollysolutions/client1/pull/154).

| Priority | Feature / requirements | Status | Recommended model / effort | Decision gate and acceptance summary |
| ---: | --- | --- | --- | --- |
| 1 | Agent-lead expiry (FR-4.6, OI-001) | **Done** — [PR #144](https://github.com/brollysolutions/client1/pull/144) | `gpt-5.6-sol` / High | Delivered fixed 30-day first-attribution deadlines, converted/closed exclusions, indexed idempotent release, audit/notifications, RLS/deadline write denial, Agent countdown/history, seven-day legacy grace, and deferred constraint race protection. |
| 2 | Admin field visibility and contact controls (FR-2.9, FR-15.1, FR-15.4) | **Done** — [PR #145](https://github.com/brollysolutions/client1/pull/145) | `gpt-5.6-sol` / Extra High | Delivered a closed server-owned catalogue, server-side least-data projection, locked Agent/Telecaller mobile rules, Employee allow/deny/provider-neutral invitation modes, policy audit, RLS, and lifecycle/race denial tests. |
| 3 | Support-assisted mobile-number change (FR-3.4, FR-14.3) | **Done** — [PR #146](https://github.com/brollysolutions/client1/pull/146) | `gpt-5.6-sol` / Extra High | Delivered replacement-number OTP, structured identity-proof attestation, distinct active platform-Admin maker/checker approval, enumeration-safe intake, collision-safe linked-record updates, immediate race-safe session revocation, PII-minimized audit, and user notification. |
| 4 | Managed property/media submissions (FR-7.3, FR-13.1 through FR-13.4, OI-002) | **Done** — [PR #147](https://github.com/brollysolutions/client1/pull/147) | `gpt-5.6-sol` / Extra High | Delivered Client/Lead, Agent, and Sub Admin submission; Admin-only approval; canonical private review uploads; approved public images; bounded image/PDF quotas; content verification; ownership/RLS; account-deletion cleanup; and scheduled lifecycle cleanup. |
| 5 | Registration/profile requirement alignment (FR-3.3, FR-17.2) | **Done** — [PR #148](https://github.com/brollysolutions/client1/pull/148) | `gpt-5.6-sol` / Extra High | Delivered mobile-first account creation, a skippable post-account profile step, optional editable/clearable identity details, verified-email-only recovery, owner/Admin RLS, deletion scrub, generated contracts, and accessible forms. |
| 6 | Vehicle arrangements (FR-7.1, OI-003) | **Done** — [PR #149](https://github.com/brollysolutions/client1/pull/149) | `gpt-5.6-sol` / High | Delivered the dedicated 1:1 site-visit arrangement, direct Admin-to-Employee assignment, safe Client read visibility, row-locked state machine, atomic parent cancellation, PII-safe audit/notifications, and real-estate-only RLS. |
| 7 | Analytics completion (FR-16.1 through FR-16.3) | **Done** — [PR #150](https://github.com/brollysolutions/client1/pull/150), verified by [PR #156](https://github.com/brollysolutions/client1/pull/156) | `gpt-5.6-terra` / High | Linux PostgreSQL/Redis verification passed all 30 reporting service/API/RLS tests with one Alembic head. Web lint, strict typecheck, 294 unit tests, and the 92-page production build passed. The full API suite reached its 20-minute bound without a final report, so it remains inconclusive rather than passing. |
| 8 | Notification/email redirect completeness (FR-11.2) | **Merged** — [PR #151](https://github.com/brollysolutions/client1/pull/151) | `gpt-5.6-terra` / High | All producer, broadcast, push, and banner paths accept only same-origin destinations; verified-email transactional copies use the same safe page; PII-prone notification copy is removed; focused API/web safety checks pass. |
| 9 | Authenticated banner personalization (FR-12.1 through FR-12.4, FR-18.1) | **Done** — [PR #152](https://github.com/brollysolutions/client1/pull/152) | `gpt-5.6-sol` / Extra High | Delivered the closed audience grammar, server-proven Client/Agent line context, separate activity/coarse-location consent, private authenticated banner/offer placements, public non-leakage, safe fallbacks, 30-day retention/deletion, and negative targeting/RLS tests. Focused API (122), full web (287), seeded Client/Agent Playwright (2), production build, generated contracts, and migration upgrade/downgrade/head checks pass; the full API suite exceeded the local execution window. |
| 11 | Lead assignment completion (FR-4.2, FR-4.3) | **Merged** — [PR #153](https://github.com/brollysolutions/client1/pull/153) | `gpt-5.6-sol` / Extra High | Delivered explicit per-line intent, the initial least-loaded same-line assignment policy, bounded retry, OTP-proven Agent-lead binding, generic registration links, Admin fallback, audit/notifications, account-deletion closure, and database/RLS isolation. The assignment policy is superseded by the current round-robin feature above. |
| 12 | Payment-method completion (FR-10.3) | **Merged** — [PR #154](https://github.com/brollysolutions/client1/pull/154) | `gpt-5.6-sol` / Extra High | Delivered UPI, bank-transfer, and audited manual-cheque disbursement; retained RazorpayX as the sole automated provider behind an explicit provider seam; excluded RuPay/card data, principal-payment collection, a second live provider, and automatic failover. |

### Approved feature brief — Payment-method completion

- **Success:** cashback, referral bonuses, and commissions can be disbursed by
  UPI VPA, bank transfer, or manual cheque while emitting exactly one paid
  recipient-ledger credit and preserving reversal accounting. FR-10.3 is
  interpreted by payout outcome rather than treating provider, rail, card
  network, and offline instrument as equivalent concepts.
- **Online behavior:** preserve the existing RazorpayX maker/checker, cap,
  idempotency, webhook, reconciliation, and reversal behavior. UPI and bank
  transfer remain compatible with existing clients and stored rows; provider
  selection is persisted explicitly so another provider can be added later
  without changing the payout domain.
- **Cheque behavior:** a different platform Admin approves the maker's request;
  an authorized Admin records issuance with only a masked reference and
  deduplication fingerprint; the payout remains processing until an Admin
  records clearance. Only clearance emits the paid ledger row. A void or bounce
  fails the payout, while a post-clearance reversal emits one compensating
  ledger row.
- **Security invariants:** raw VPA, bank-account, and cheque references are not
  persisted or returned; platform-Admin authorization and payout RLS remain
  server-side; maker/checker and self-payout denials, integer-minor-unit caps,
  compare-and-swap transitions, idempotency, audit, and mock/live isolation
  remain fail-closed. An ambiguous gateway result is reconciled before any
  retry and never fails over automatically to another provider.
- **Compatibility:** add an additive migration and backfill existing VPA/bank
  payouts to the RazorpayX provider and matching delivery method. Keep current
  API response fields during the transition, regenerate OpenAPI/client output,
  and preserve existing transaction and account-deletion retention behavior.
- **Verification:** cover migration upgrade/downgrade and one head; schema
  validation; API authorization/RLS; all three methods; cheque issue, clear,
  fail, reversal, duplicate, and concurrent transitions; existing RazorpayX
  live/mock/webhook/reconciliation paths; masked API/UI output; generated
  contracts; Admin forms; full API and web gates; security and PR review.
- **Non-goals:** RuPay or any card-number handling, customer checkout, property
  or loan-principal collection, recipient-saved payout credentials, a second
  live gateway, configurable routing, and automatic cross-provider failover.

### Delivered feature evidence — Payment-method completion

- **Behavior:** payout rows now persist a provider independently from the
  destination rail. Existing UPI VPA and bank-account payouts remain on the
  RazorpayX adapter. Cashback, referral-bonus, and commission requests can also
  create credential-free manual-cheque payouts; approval leaves them awaiting
  issuance, issuance stores only a safe masked hint plus keyed fingerprint,
  clearance emits the single paid ledger credit, pre-clearance failure emits no
  credit, and post-clearance reversal emits one compensating negative row.
- **Security and compatibility:** all money-moving manual actions require a
  full platform Admin at the API boundary and retain maker/checker and
  self-payout denials. Row locks serialize issue/clear/fail/reverse races;
  provider-scoped uniqueness and webhook lookup prevent cross-provider
  collisions; payout caps fail closed for real manual payouts; RLS and grants
  remain unchanged; existing rows backfill to RazorpayX. The security review
  found and fixed a short-reference masking edge case, and the correctness
  review added nonblank audit reasons and an accessible reason control. No
  remaining actionable finding was found.
- **Fresh verification:** the migrated Docker database passes 55 payout API
  tests, 30 provider/live/webhook/RLS tests, and 47 linked referral,
  commission, and fee-cashback tests. Two focused masking regressions pass.
  Ruff check/format pass across all 409 API files, and Alembic upgrade,
  downgrade, re-upgrade, current, and one-head checks pass in a fresh temporary
  database. Web lint/typecheck and all 294 unit tests pass. The canonical Linux
  production builder compiled, typechecked against the generated contract,
  rendered all 92 static pages, and packaged standalone output before the final
  accessibility-only label refinement; the final source then passed lint,
  strict typecheck, the full web tests, and the canonical cache-only production
  build layer. A final image-export retry exhausted its 20-minute Docker Desktop
  limit, while the host build reaches successful compile/typecheck/static
  generation before Windows blocks standalone symlink creation with `EPERM`.
  OpenAPI and the generated TypeScript schema reproduce from the final API
  source. A complete API-suite attempt exited under its 29-minute in-container
  bound after the host lost the output attachment; without a final pytest report
  it is not counted as passing or failing, while all 134 changed-path API tests
  have observed passing reports.

### Historical approved feature brief — Lead assignment completion

- **Success:** every Agent-introduced lead and every explicitly requested
  direct Client journey is assigned to one active same-line Telecaller without
  Admin intervention when capacity exists. A missing eligible Telecaller leaves
  the lead in the existing Admin queue for bounded idempotent retry.
- **Client behavior:** preserve CS-001 account creation with both Client
  profiles and no enrollment picker. Capture service intent separately so a
  Loans, Real Estate, or both selection creates only the requested operational
  journeys and never treats profile existence alone as consent to outreach.
- **Agent onboarding:** the Agent shares a generic same-origin registration
  link containing no lead identifier or mobile. Successful OTP registration
  binds a matching active Agent lead to the verified account's same-line Client
  profile; the link itself grants no authority and normal registration with the
  same mobile performs the identical binding.
- **Assignment:** choose only active same-line Telecaller profiles, ordered by
  the smallest assigned/working workload and a stable profile-ID tie-breaker.
  Lock assignment candidates and the lead so concurrent capture/retry paths do
  not double-assign or skew one visible transition into multiple notifications.
- **Data compatibility:** support one live journey per mobile and business line,
  one unresolved capture per mobile, and no `both`-line operational lead.
  Preserve existing lead IDs, downstream FKs, Agent origin/deadline history,
  terminal states, manual Admin release/reassign, and line-scoped RLS.
- **Failure and security:** serialize same-mobile registration/Agent-introduction
  races; prevent registered or already Agent-attributed mobiles from being
  claimed by another Agent; keep PII out of audit/notification/log payloads;
  notify only after commit; and fail closed on inactive, wrong-role, or
  cross-line assignees.
- **Non-goals:** cloud telephony, persistent team membership, quotas or shifts,
  Agent transfer, changing the 30-day Agent expiry, or automatically assigning
  both teams merely because both Client profiles exist.
- **Verification:** additive migration upgrade/downgrade and one head; direct
  RLS tests; per-line uniqueness and legacy-row checks; assignment fairness,
  concurrency, no-capacity, retry, terminal, inactive, and cross-line tests;
  OTP binding and duplicate-ownership tests; generated contracts; accessible
  registration/Agent UI tests and seeded browser flow; full API/web/repository
  gates; security review; and PR review.

### Historical delivered feature evidence — Lead assignment completion

- **Behavior:** registration keeps both Client profiles but requires explicit
  Loans/Real Estate follow-up intent. Direct and Agent-introduced journeys are
  assigned to the active same-line Telecaller with the smallest
  assigned/working workload and stable UUID tie-breaking; a bounded scheduler
  retries the oldest queued rows every 15 minutes. OTP verification is the sole
  authority for Client binding, and the Agent shares only the generic
  same-origin `/register` route.
- **Compatibility and lifecycle:** the additive migration replaces the former
  mobile-only live uniqueness with per-line, unresolved, and global active-Agent
  invariants; normalizes legacy `both` leads without deleting history; backfills
  exact-line registered Clients; and preserves Agent attribution/deadlines,
  terminal states, Admin release/reassignment, and downstream lead IDs. Account
  deletion atomically closes profile-bound and same-mobile unresolved journeys
  before identity tombstoning.
- **Security review:** automatic paths serialize mobile ownership and acquire
  line locks before row locks; retry acquires both line locks canonically. A
  fixed-search-path database trigger rejects inactive, wrong-role, and
  cross-line Telecaller links and mismatched Client profiles. The account-close
  helper independently authorizes only the owner or platform Admin. Public
  capture cannot rewrite an assigned workflow; audit and notification payloads
  contain line and UUID metadata but no name, mobile, requirement, or OTP data;
  notifications occur only after commit. Review found no remaining actionable
  high- or medium-severity issue.
- **Fresh verification:** Ruff check/format pass. The final lead, public-capture,
  Admin assignment/reassignment, and direct-RLS regression set passes 53 tests;
  together with the immediately preceding unchanged neighboring groups, all 187
  changed-path API tests pass. A full split API run passed 1,542 tests before
  the final lock-order refinement, and the affected concurrency/security paths
  were rerun afterward. A final monolithic `uv run pytest -q` produced no
  failure trace but exceeded the explicit 30-minute local limit, so it is not
  counted as passing. Migration downgrade/upgrade, `current`, and the single
  Alembic head pass. Web lint, typecheck, and all 288 unit tests pass; three
  seeded Playwright journeys and the production Docker builder pass. The host
  standalone build reaches successful compile/typecheck/static generation (92
  pages) before Windows rejects Next.js standalone symlink creation with
  `EPERM`; the Linux production builder completes. The live OpenAPI document
  and pinned generated TypeScript schema reproduce the committed contracts
  exactly. The Bash-only `./scripts/verify.sh --ci` wrapper is unavailable on
  this Windows host; its applicable constituent gates above were run directly.

### Approved feature brief — Authenticated banner personalization

- **Success:** authenticated Clients see a default, personalized, and action
  banner stack for their active dashboard line; authenticated Agents see their
  own line's default/action content plus incentive-targeted personalized
  banners; matching offers can use the same consented context. Anonymous
  catalog responses never contain personalized banners or targeted offers.
- **Audience contract:** retain JSONB storage but replace free-form dictionaries
  with a versioned, closed Pydantic grammar. Supported dimensions are user type,
  normalized Client journey stage, bounded Agent activity signals, and bounded
  geographic circles. Populated dimensions are ANDed and values within a
  dimension are ORed. Unknown keys, invalid role/signal combinations, and
  malformed legacy rules fail closed. Default/action banners have no audience
  rules; personalized banners require at least one supported user type.
- **Line and precedence:** the browser supplies only placement context. The API
  proves a Client owns the requested line and forces an Agent to the active
  profile/JWT line. Eligible rows are line-specific or `both`; one banner per
  layer is selected by highest priority, exact-line before `both`, then the
  existing oldest-first stable order from the settled banner-precedence decision.
- **Consented signals:** activity personalization and location personalization
  are separate opt-ins. Matching uses only existing first-party workflow facts
  (loan applications, property enquiries/deals, Agent-owned leads, and
  commissions); no clickstream, browsing history, inferred demographics, or
  new activity ledger is introduced. Without activity consent, only
  default/action banners and generic offers are eligible.
- **Location privacy:** the current web app does not request browser geolocation
  or capture/refresh personalization coordinates. For backward compatibility,
  any previously saved coarse point is never logged or audited, expires after
  30 days, is cleared immediately on revocation/account deletion, and is omitted
  from matching when stale. No reverse geocoder, map provider, IP-location
  inference, or location history is part of the current web flow.
- **Serving boundary:** add a private, no-store authenticated placement response
  with display-only banner/offer projections. Keep the current positive
  anonymous banner allowlist and make public offers exclude non-empty targeting
  rules. Offers remain Client-facing; Agents receive their own benefits and
  incentives through the personalized banner layer, not customer discounts.
  Because banner RLS intentionally excludes Clients/Agents, candidate
  content is read through a narrowly-contained bypass service only after the
  request-session dependency proves the caller and line; user-owned context is
  read under normal RLS.
- **Failure behavior:** invalid rules and unavailable signals never broaden an
  audience; stale/no location cannot satisfy a location rule; a failed
  personalization request must not block the operational dashboard; safe
  role/line fallbacks preserve the default/action layers; CTA destinations and
  image hosts keep their existing same-origin/allowlist validation.
- **Non-goals:** public-homepage session hydration, anonymous personalization,
  raw or historical location retention, IP geolocation, maps/GMB/geocoding,
  marketing analytics or impression/click tracking, machine-learned segments,
  arbitrary JSON/SQL rule expressions, staff dashboard targeting, or changes to
  operational authorization and business-line RLS.
- **Verification:** schema and approval fail-closed tests; Client/Agent positive,
  cross-role, cross-user, and cross-line API tests; public endpoint non-leakage;
  preference owner-only/direct-RLS tests; consent/revocation/staleness/deletion
  and coarse-location tests; deterministic layer/offer ranking; regenerated
  contracts; CMS and dashboard Vitest coverage; seeded Client/Agent Playwright
  journeys; migration upgrade/downgrade and one head; full API/web gates;
  security review; PR review; and repository verification.

### Approved feature brief — Vehicle arrangements

- **Success:** a Client booking a real-estate site visit can optionally request
  pickup, a platform Admin can arrange transport and assign one active
  real-estate Employee, that Employee can complete or cancel their own assigned
  arrangement, and the owning Client can follow the company-managed status and
  safe driver/vehicle details from Site Visits.
- **Architecture:** create a dedicated `vehicle_arrangements` entity with a
  unique FK to `site_visits`; do not add logistics columns to `site_visits` and
  do not add a fourth `task_type`. A property deal may already point at the same
  site visit, so logistics remain attached to that workflow without a second
  nullable deal FK or duplicate ownership source.
- **Lifecycle:** the Client request creates `requested`; Admin-supplied vehicle
  and driver details permit `arranged`; assigning an active real-estate
  Employee permits `assigned`; `completed` and `cancelled` are terminal.
  Cancelling the parent visit cancels a non-terminal arrangement in the same
  transaction. Every transition is row-locked and validated server-side.
- **Write split:** Clients set pickup location/time only during site-visit
  creation and thereafter read the arrangement. Platform Admin lists all,
  enters bounded logistics fields, assigns/reassigns an eligible Employee, and
  progresses or cancels. Employees list only their own assigned arrangements
  and may complete or cancel them. Telecaller, Sub Admin, and Agent access is
  outside this slice.
- **Security and privacy:** stamp `real_estate` server-side; enforce owner,
  platform-Admin, and own-assignment access in dependencies, service queries,
  grants, and PostgreSQL RLS; reject cross-line or inactive assignees; never put
  pickup location, driver contact, or other PII in audit details,
  notifications, logs, analytics, or URLs; reveal driver contact only to the
  owning Client and assigned Employee/Admin after assignment.
- **Failure behavior:** create the visit and optional arrangement atomically;
  enforce one arrangement per visit in the database; return non-disclosing 404s
  for inaccessible rows; reject invalid or concurrent transitions without
  partial writes; and keep notifications best-effort after the durable action.
- **Non-goals:** vehicle fleet inventory, third-party transport integrations,
  payments/fares, live tracking, maps/geocoding, multiple pickups per visit,
  recurring trips, Telecaller/Sub Admin/Agent fulfilment, or redesigning the
  existing site-visit/property-deal/task workflows.
- **Verification:** migration upgrade/downgrade and one head; API schema and
  transition tests; Client ownership and cross-user denial; Employee
  own-assignment and cross-line denial; platform-Admin assignment validation;
  direct RLS denial; cancellation/concurrency/audit/notification checks;
  regenerated contracts; accessible responsive Client/Admin/Employee web
  flows; focused web tests; full applicable API/web/repository gates; security
  review; and PR review.

### Delivered feature evidence — Vehicle arrangements

- **Delivery:** [PR #149](https://github.com/brollysolutions/client1/pull/149).
- **Behavior:** Clients optionally request pickup while booking a site visit;
  platform Admin enters bounded vehicle/driver details and assigns or reassigns
  an active real-estate Employee; the assignee completes or cancels their own
  pickup; and the owning Client follows a read-only status with driver details
  withheld until assignment. Cancelling a visit atomically closes active
  logistics without granting the Client arrangement UPDATE rights.
- **Boundaries:** the dedicated 1:1 entity remains real-estate-only and outside
  Employee tasks. PostgreSQL RLS separates owner, own-assignment, and platform-
  Admin access; the service row-locks transitions and validates assignees;
  notifications and audit details exclude pickup/contact PII.
- **Verification:** Ruff lint/format, web lint/typecheck, the 274-test web suite,
  four schema tests, feature tracking, diff checks, and the one-head Alembic
  check pass. Four PostgreSQL/Redis-backed API/RLS tests are explicitly skipped
  locally because those services are unavailable. The production web build
  compiled, type-checked, and generated all 92 pages before failing when the
  configured `api` hostname could not resolve; migration execution, database-
  backed tests, and the service-connected build remain PR-CI gates.
- **Security review:** async relationship reload, cross-line Employee
  navigation, transition invariants, security-definer cancellation, assignment
  ownership, and pre-assignment driver-data exposure were reviewed. The first
  two were hardened before delivery; no actionable high- or medium-severity
  issue remains in the reviewed diff.

### Approved feature brief — Registration/profile requirement alignment

The postal-address and geolocation non-goals below record the scope delivered
in PR #148. Later 2026-08-20 decisions replace postal address with optional
Location, then remove browser geolocation in favor of a manual search-style
field without map/GMB or personalization coupling.

- **Success:** an ordinary Client can create an account with name and an
  OTP-verified mobile without supplying email or additional PII; after password
  creation, registration offers a skippable profile step for optional email,
  gender, income, occupation, and postal address, and the same details remain
  editable and clearable from Profile settings.
- **Behavior:** keep first and last name, mobile OTP, password, and the existing
  optional referral code in the core registration flow. Create and authenticate
  the account before attempting optional profile persistence so a failed or
  skipped profile save never strands registration. Do not gate dashboards,
  applications, inquiries, support, or either Client business line on profile
  completion.
- **Data and API:** relax `auth_users.email` to nullable while preserving
  uniqueness for supplied values; keep new identity-wide fields on
  `auth_users`, not duplicated across line profiles; model optional income as a
  consistent source/amount/period group using integer minor units; use bounded
  occupation and postal-address text; expose nullable values only through the
  owner-scoped `GET/PATCH /auth/me` contract with explicit clearing semantics.
- **Compatibility:** preserve CS-001 dual-line Client creation, CS-003 profile
  and RLS scope, existing users and supplied emails, mandatory email in Admin
  staff provisioning and Agent applications, password login, referral
  attribution, generated-contract ownership, and current mobile-change proof
  rules.
- **Security and failure invariants:** prove mobile possession without sending
  a registration OTP to a self-asserted email; permit email recovery only for a
  verified account email; never place new PII in Redis registration state,
  registration JWTs, access/refresh tokens, leads, audit detail, notifications,
  logs, or analytics; preserve owner/platform-Admin RLS; reject inconsistent or
  unbounded values; scrub every new field immediately during account deletion;
  and keep optional profile-save failures retryable without undoing the account.
- **Retention:** existing rows require no demographic backfill. Supplied values
  remain until the user clears them or the account is deleted; deletion removes
  them during the immediate identity-scrub phase while already de-linked legal
  financial records retain their existing seven-year lifecycle.
- **Non-goals:** business-line selection, mandatory profile-completion gates,
  KYC/address proof, geolocation or map personalization, income underwriting or
  analytics, staff/Agent onboarding redesign, Admin profile-edit expansion,
  field-visibility catalogue expansion, and changes to loan/property
  application-specific data.
- **Verification matrix:** registration with omitted and supplied optional
  email; mobile-only OTP delivery; verified-email-only recovery; absent-email
  verification denial; duplicate and concurrent email updates; optional
  profile submit, skip, retry, edit, and clear; income-group and field-bound
  validation; owner, cross-user, staff, and platform-Admin RLS behavior;
  immediate deletion scrub and re-registration; migration upgrade/downgrade and
  one Alembic head; regenerated contracts; accessible responsive registration
  and settings flows; focused API/web/browser tests; full applicable gates;
  security review; PR review; and repository verification.

### Delivered feature evidence — Registration/profile requirement alignment

The PR #148 evidence below is historical. Migration `e4b5c6d7e8f9` and the
2026-08-20 delivery replace Postal address with Location and `net_salary` with
`salaried` while preserving the rest of this evidence.

- **Delivery:** [PR #148](https://github.com/brollysolutions/client1/pull/148).
- **Behavior:** ordinary Clients register with first and last name, an
  OTP-verified mobile, password, and optional referral code. After account
  creation they may skip or save optional email, gender, income source/amount/
  period, occupation, and postal address; Profile settings supports later edit
  and explicit clearing without any completion gate.
- **Data and compatibility:** nullable identity-wide fields live on
  `auth_users`; supplied emails remain unique; income uses bounded integer minor
  units and a consistent group constraint. Staff provisioning and Agent
  applications retain mandatory email, including when either role is attached
  to a mobile-only Client identity; dual-line Client creation is unchanged, and
  FastAPI remains the generated-contract source.
- **Security and privacy:** registration and initial reset prove mobile control
  without falling back to self-asserted email. Email reset is explicit and
  verified-only; verification codes are bound to a keyed, non-reversible target
  fingerprint and a locked identity row. Public reset initiation, resend, and
  verification responses do not disclose account or verified-email existence.
  New profile PII is absent from Redis registration state, JWTs, audit detail,
  logs, leads, and analytics; existing owner/platform-Admin RLS applies;
  deletion immediately scrubs the fields and verification cache.
- **Fresh local evidence:** full API Ruff check/format, one Alembic head, 10
  database-independent profile-schema tests, and collection of all 1,478 API
  tests pass. Offline SQL generation passes for this revision's upgrade and
  downgrade. OpenAPI and TypeScript contracts were freshly regenerated from
  FastAPI and the pinned generator. Web lint/typecheck and all 272 tests pass.
  A fresh production-build attempt timed out after five minutes without a
  diagnostic on this Windows host. Database-backed API tests, live migration
  upgrade/downgrade, browser E2E, the production build, and the repository-wide
  CI gate remain delegated to Linux PR CI because the local Docker engine is
  unresponsive and the host has no working Bash runtime.
- **Security review:** automatic email fallback, verification-target swap,
  public recovery enumeration, absent-email resend invalidation/status parity,
  deletion-cache gaps, mobile-only staff/Agent email attachment, and malformed
  partial profile updates were remediated with regression coverage. Repeat
  static review found no remaining reachable high- or medium-severity defect;
  datastore-backed execution remains the residual verification risk.

### Approved feature brief — Managed property/media submissions

- **Success:** authenticated Clients/Leads, real-estate Agents, and Sub Admins
  can submit an existing RERA-registered property with managed media; only a
  platform Admin can approve it; pending assets remain private and approved
  listing images become public without exposing reviewer-only documents.
- **Behavior:** require one to ten JPEG, PNG, or WebP images of at most 5 MiB
  each; allow up to two reviewer-only PDFs of at most 5 MiB each; support
  browser camera capture; preserve image order; show upload and review state to
  the owner; and keep existing catalogue image behavior for legacy rows.
- **Architecture:** store private submission assets separately from approved
  public property media, bind staging storage keys to the authenticated owner,
  copy verified uploads into opaque server-only canonical private snapshots,
  copy approved images to a public property prefix, and project public URLs
  server-side. Keep generated contracts owned by FastAPI.
- **Compatibility:** preserve existing property submissions, properties, and
  legacy catalogue images; retain immutable real-estate classification; do not
  change property inquiries, visits, deals, payments, or Agent attribution.
- **Security and failure invariants:** enforce signed storage-side size caps,
  server-side object existence/size and magic-byte checks, count and rate
  limits, owner/reviewer RLS, Admin-only approval, non-public pending keys,
  immutable canonical snapshots, retryable row-locked approval, PII-free audit
  details, account-deletion cleanup, and scheduled orphan, rejected-media, and
  promoted-source cleanup. Storage failure must fail closed without publishing
  the submission.
- **Retention:** purge unreferenced uploads after one hour, rejected private
  media after 30 days, and private originals after successful public
  promotion; retain public images only while their listing remains active.
- **Non-goals:** video upload/transcoding, platform-wide Loans/Real Estate media
  galleries, feedback attachments, content moderation providers, listing edit
  or resubmission, and changes to payment or vehicle-arrangement workflows.
- **Verification matrix:** Client/Agent/Sub Admin positive submission; role,
  owner, cross-user, and cross-line denial; Admin-only review; quota, MIME,
  magic-byte, missing-object, duplicate-key, and rate-limit failures; private
  before approval and public after approval; copy failure and concurrent review;
  rejection and cleanup; audit safety; migration upgrade/downgrade and one
  Alembic head; generated contracts; accessible responsive web flows; focused
  API/RLS/storage/scheduler/web/browser tests; full applicable gates; security
  review; PR review; and repository verification.

### Delivered feature evidence — Managed property/media submissions

- **Delivery:** [PR #147](https://github.com/brollysolutions/client1/pull/147).
- **Behavior:** Clients/Leads, real-estate Agents, and Sub Admins submit one to
  ten ordered images and up to two reviewer-only PDFs through signed uploads.
  Owners can inspect their private media and review state; only a platform
  Admin can approve or reject. Approval publishes managed image URLs while
  preserving legacy property images and keeping PDFs private.
- **Storage and privacy:** opaque staging names are owner-bound, rate-limited,
  size-constrained, and checked by MIME and magic bytes. Submission copies each
  asset into a newly generated server-only canonical key and revalidates it,
  closing signed-upload replacement races. Promotion revalidates source and
  destination; failures remain pending and remove partial public copies.
- **Authorization and lifecycle:** private rows use owner/platform-Admin RLS;
  public media requires an active listing; Sub Admin review is denied. Scheduled
  cleanup removes old unreferenced staging objects, rejected private media,
  promoted image sources, and inactive public images. Account deletion rejects
  pending submissions and removes their private media while preserving approved
  public listing records.
- **Fresh local evidence:** Ruff check/format over 382 files, Python compilation,
  and all 24 database-independent schema/storage tests pass. Alembic reports one
  head, the feature revision's upgrade/downgrade offline SQL passes, generated
  OpenAPI/TypeScript hashes are deterministic, and the feature-tracking guard
  passes. Web lint/typecheck and all 265 tests pass; after the final hardening,
  typecheck and the 24 focused property tests pass again. The production build
  compiled, type-checked, and generated all 91 pages before Windows denied
  Next's final standalone symlink copy (`EPERM`). The database-backed property
  suite timed out after 60 seconds and `./scripts/verify.sh --ci` after 120
  seconds because the local Docker PostgreSQL/Redis control path is unresponsive;
  Linux PR CI remains authoritative for those gates.
- **Security review:** upload-replacement, canonical-key replay, filename
  disclosure, public-copy failure, audit free-text, and account-deletion gaps
  were found and remediated. Repeat review found no remaining actionable high-
  or medium-severity defect.
  Residual product risks are malware scanning/content moderation for PDFs,
  public-image metadata normalization, and an explicit retention period for
  approved reviewer-only PDFs; these remain part of the broader FR-13 work.

### Approved feature brief — Support-assisted mobile-number change

- **Success:** a user who no longer controls their registered number can prove
  possession of a replacement number, pass Admin-only identity review, and use
  the replacement for login and password recovery; the old number and every
  pre-change session stop working immediately after completion.
- **Behavior:** provide public locked-out and authenticated dashboard intake.
  Verify the replacement number with the existing hashed, expiring,
  attempt-limited OTP rails, create a structured request linked to a
  `lost_mobile` support ticket, require one platform Admin to attest an approved
  proof method and a different platform Admin to complete the change, then
  resolve the ticket. Platform-Admin target accounts remain out of scope.
- **Identity proof:** approved proof methods are verified-email confirmation,
  review of already-held KYC, staff HR/manager confirmation, or in-person
  verification. Store only the method and a bounded, PII-free attestation; do
  not add knowledge-question recovery or a new document-upload path.
- **Compatibility:** preserve the immutable account UUID, roles, profiles,
  business-line/RLS claims, lead provenance, Agent-expiry history, referrals,
  and generated-contract ownership. Update the canonical mobile plus only the
  linked operational contact copies required for current workflows; never
  merge accounts or transfer unrelated lead/referral attribution.
- **Security and failure invariants:** keep public responses enumeration-safe;
  rate-limit by trustworthy IP and both numbers; bind OTP proof to a signed,
  purpose-scoped challenge and burn the OTP on successful use; require
  target, maker, and checker to differ; lock the request and user and revalidate
  all collision checks at completion; commit the mobile,
  linked-record, ticket, refresh-token, access-session-generation, push-device,
  and audit changes atomically; keep phone values, OTPs, proof material, and
  ticket free text out of logs/audit details; scrub active request PII on
  terminal state and account deletion.
- **Non-goals:** self-service completion, platform-Admin account recovery,
  account merge/swap, reassignment of unrelated leads or referrals, new
  WhatsApp/SMS/email integrations, new KYC uploads, password/email change in
  the same workflow, and rewriting historical auth events or terminal contact
  snapshots.
- **Verification matrix:** public/authenticated initiation; known/unknown and
  conflict response parity; OTP expiry/attempt/rate/replay/purpose isolation;
  Admin/Sub Admin/client/RLS denial; maker-checker and target separation;
  state-machine and concurrent completion; auth/lead/referral/application
  collision rollback; linked live-contact updates; old access/refresh/reset
  denial and new login/reset success; account-deletion scrub; PII-free audit
  and notifications; generated contract and accessible responsive UI;
  migration upgrade/downgrade and one head; focused, full API/web/E2E, security,
  and repository gates.

### Delivered feature evidence — Support-assisted mobile-number change

- **Delivery:** [PR #146](https://github.com/brollysolutions/client1/pull/146).
- **Behavior:** public locked-out and authenticated users verify a replacement
  number with the purpose-scoped OTP rails. Eligible requests create a
  structured `lost_mobile` ticket; one active platform Admin records a bounded,
  PII-free proof attestation and a different active platform Admin completes
  the canonical identity change after password reauthentication.
- **Identity safety:** completion preserves the account UUID and updates only
  linked live contact copies. It locks the request and user, revalidates account,
  proof, and replacement conflicts, translates uniqueness races into an atomic
  409 rollback, increments the access-session generation, revokes refresh
  tokens and push subscriptions, and serializes concurrent refresh rotation on
  the same user row.
- **Authorization and privacy:** platform-Admin targets and Sub Admins are
  excluded; the bypass service re-checks the live Admin profile. PostgreSQL
  grants only `SELECT` to `api_user`, with owner/platform-Admin RLS. Audit and
  notification details contain no phone values, free text rejects contact-like
  PII, and raw old/new numbers are scrubbed on terminal state and account
  deletion.
- **Fresh local evidence:** Ruff check/format, Python compilation, 36-test
  collection, one Alembic head, migration-only offline SQL, deterministic
  OpenAPI/TypeScript regeneration, web lint/typecheck, and all 261 web tests
  pass. The web production build previously compiled, type-checked, and
  generated all 91 pages before Windows denied the final standalone symlink
  copy (`EPERM`). Database-backed API execution is delegated to Linux PR CI
  because the local Docker PostgreSQL/Redis control path is unresponsive.
- **Post-merge CI repair:** the three failures in main run
  [31129957083](https://github.com/brollysolutions/client1/actions/runs/31129957083)
  are repaired by freezing the employee-home date fixture and reconciling the
  platform-policy ledger with the split task-document and loan-document
  policies. That run otherwise reported 1,404 passing API tests.
- **Security review:** refresh-rotation and registration collision races plus
  stale-Admin token reachability were found and remediated. Remaining local
  uncertainty is limited to database-backed execution and the Windows-only
  build packaging restriction; PR CI is the authoritative gate.

### Approved feature brief — Admin field visibility and contact controls

- **Success:** a platform Admin can change supported field visibility for
  Agent, Telecaller, and Employee responses without a deploy; the API, not the
  browser, removes denied values; changes take effect on the next request and
  appear in the append-only audit log.
- **Behavior:** use a closed server-owned catalogue and role/entity/field
  overrides. Preserve existing visibility by default. Agent-owned and
  Telecaller-assigned mobile numbers are locked visible by FR-15.1/FR-15.2;
  Employee lead contact supports `allow`, `deny`, and `share_link`. A share link
  is an opaque, expiring, revocable platform invitation with no PII in its URL
  or public response.
- **Compatibility:** keep row ownership, business-line RLS, operational status
  fields, and write permissions unchanged. Optional projected fields remain
  generated-contract owned. Existing `tel:` and `wa.me` browser links may only
  render when the raw number is already allowed; no WhatsApp API, messaging
  provider, dependency, or telemetry is added.
- **Security and failure invariants:** fail closed for unknown catalogue keys,
  invalid modes, expired/revoked tokens, and policy-read failures; require a
  platform-scoped Admin for policy writes; expose only a caller's already
  authorized rows; store only invitation-token hashes; keep audit detail free
  of contact values; revoke outstanding links when Employee contact leaves
  `share_link` mode.
- **Non-goals:** field-level write authorization, record reassignment, number
  masking, cloud telephony, WhatsApp API integration, arbitrary Admin-defined
  JSON paths, and new email/SMS delivery.
- **Verification matrix:** catalogue validation and locked rows; Admin-only and
  platform-scope denial; default/allow/deny/share-link projection for each
  affected role; Agent/Telecaller mobile invariants; Employee ownership and
  cross-line denial; token hash/expiry/revocation/single-use behavior; no-PII
  audit detail; generated contract and accessible Admin UI; migration
  upgrade/downgrade and one head; full API, web, and repository gates.

### Delivered feature evidence — Admin field visibility and contact controls

- **Behavior:** platform Admins manage a closed role/entity/field catalogue from
  the dashboard. Agent and Telecaller lead-mobile access remains locked to the
  SRS ownership rules; supported lead and financial fields are projected out of
  API responses when denied. Employees can receive raw contact, no contact, or
  a provider-neutral invitation according to the active policy.
- **Contact privacy:** invitation URLs contain a 256-bit random token and no
  PII; only SHA-256 token hashes are stored. Links expire after 24 hours, are
  single-use and revocable, and fail closed when the policy changes, the task
  closes or is reassigned, or the issuing Employee is no longer active. The
  public validation response exposes only `valid`.
- **Security:** Admin writes require platform scope and are audit logged without
  contact values. PostgreSQL RLS restricts catalogue reads by target role and
  link rows by current Employee task ownership/business line; link inserts also
  require an active task and explicit `share_link` policy. A transaction lock
  serializes policy changes with link creation, and a partial unique index
  prevents multiple active links for one Employee/task.
- **Compatibility and non-goals:** existing null response fields remain stable;
  generated OpenAPI/TypeScript contracts own all optional shapes. There is no
  WhatsApp API, messaging provider, cloud telephony, arbitrary JSON-path policy,
  new dependency, or telemetry.
- **Fresh local evidence:** Ruff check/format and generated-contract refresh
  pass; the migration downgrade/upgrade and one-head check passed before the
  final RLS/index hardening; 5 new API integration tests passed, and 105 of 106
  related regression tests passed before one legacy-null compatibility defect
  was fixed and its focused 6-test rerun passed. Web lint/typecheck and all 257
  tests pass; Next compiled and generated all 90 pages, then Windows denied the
  standalone symlink-copy step (`EPERM`). Final database-backed lifecycle,
  concurrency, full API, and hardened-migration reruns are delegated to PR CI
  because the local Docker Redis/PostgreSQL processes stopped responding.

### Delivered feature evidence — Agent-lead expiry

- **Success:** every overdue agent-attributed lead that is not converted or
  closed returns to the open same-line Telecaller pool once, within one 15-minute
  scheduler interval; attribution and line remain unchanged.
- **Behavior:** stamp an immutable 30-day deadline when Agent attribution is
  first established; do not reset it on edits, calls, assignment, or
  reassignment. Expiry clears the Telecaller assignment, records the expiry,
  preserves Agent history, and prevents Agent edits or re-introduction. Existing
  eligible rows receive at least seven days of deployment grace.
- **Compatibility:** keep the existing operational lead statuses for Admin and
  Telecaller flows; project expired Agent ownership on Agent APIs/UI. Preserve
  current direct-lead behavior and generated-contract ownership.
- **Security and failure invariants:** enforce post-expiry write denial in both
  service logic and RLS; preserve business-line isolation; use one conditional,
  idempotent database transition so concurrent converted/closed updates are not
  overwritten; keep audit details free of PII; make notifications best-effort
  only after the business transition commits.
- **Non-goals:** automatic Telecaller assignment, Agent transfer, deadline
  extensions/pauses, reminder emails, and Admin-configurable duration UI.
- **Verification matrix:** creation and no-reset behavior; new/assigned/working/
  released expiry; converted/closed/direct/future exclusions; legacy grace;
  idempotency and terminal-race behavior; queue reassignment; API/RLS lockout;
  duplicate/re-introduction prevention; audit/notification delivery; generated
  contract; Agent countdown/history rendering; scheduler registration; one
  Alembic head; full API, web, and repository gates.

- **Fresh evidence:** 42 focused API/system tests pass, including real
  two-session scheduler/Agent and cross-Agent RLS invariant checks; Ruff,
  migration downgrade/upgrade, and one
  Alembic head pass; web lint/typecheck and all 254 unit tests pass; a seeded
  browser session verified expired counts, countdown/history copy, and
  read-only detail behavior. Security review found and remediated the
  attribution/expiry race and due-before-marker write window; no findings
  remain. The full API regression completed with 1,397 passing tests and three
  unrelated failures: the import-time payout grace fixture passes fresh, while
  two pre-existing platform-policy ledgers still expect the superseded
  `task_documents_rls` name and omit `loan_documents_select`. The isolated
  production-build limitation is recorded in the PR verification summary.

## Delivery sequence

The next active item is the **Admin controlled-correction and audit remediation**
(FR-2.2): add the typed approved-listing correction command and seven missing
append-only audit-event families. The delivered 47-table contract, 68-policy
ledger, and eight newly covered view decisions must stay exhaustive. The next
slice must not expand document, payout, secret, precise-location, immutable
ledger, or cross-line access.
Provenance-based edit ownership (FR-2.8) is delivered in
[PR #169](https://github.com/brollysolutions/client1/pull/169).

For each item:

1. **Decide**: resolve its decision gate with `brainstorm`/`grillme` when needed.
2. **Design**: record acceptance criteria, non-goals, threat considerations,
   compatibility, and test matrix.
3. **Implement**: make the smallest end-to-end change on a fresh task branch.
4. **Verify**: run targeted checks and the full applicable repository gate.
5. **Review and ship**: run security review where required, review the diff,
   update both living files, commit, push, and open/update the PR.

## Completed foundations

The backlog builds on these delivered foundations:

- six role-aware dashboards with server-side authorization and PostgreSQL RLS;
- OTP/password/refresh authentication and dual-line client profiles;
- lead capture, Agent introduction, Admin assignment, Telecaller follow-up,
  fixed Agent expiry, and Employee tasks/documents;
- loan applications, product/bank configuration, transactions, document
  verification, and processing-fee cashback;
- property catalog, submissions/review, inquiries, visits, bookmarks, and deal
  progression;
- Agent applications/KYC, commissions, referrals, maker-checker payouts,
  reconciliation, and retained/de-linked ledgers;
- CMS banners/offers/content, public serving, images, notifications/web push,
  Admin broadcast/audit, support triage, and analytics/CSV reporting; and
- self/Admin account deletion plus seven-year retention purge.

## Change log

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-08-22 | Redesigned public Financial Services discovery: removed the section eyebrow and the "Show results" gate, made the filter rail sticky and non-white, filtered results live as the reader types, added exact per-category pill counts, and fixed the broken catalogue artwork with a reviewed `equipment-financing` illustration plus a designed unmapped-slug plate. | [PR TBD](https://github.com/brollysolutions/client1/pulls); presentation-only web change with no API/migration/contract/authorization surface touched; 388 web tests including new sticky-rail, no-eyebrow, no-JS category-link, and illustration-resolution coverage; lint and typecheck pass; 3 financial-services Playwright tests pass including new sticky/live-typing coverage; desktop 1440x900 and mobile 390x844 browser verification of sticky behaviour, live typing, category filtering, live counts, and the empty state. Unverified: `pnpm build` compiled, type-checked, and generated all 93 static pages, then failed in `Collecting build traces` with Windows `EPERM ... symlink` while writing `.next/standalone/node_modules`; re-run on Linux or an elevated shell before merge. |
| 2026-08-22 | Delivered the Admin-published Financial Services catalogue, product detail and provider explorer, curated Home services, fixed calculator links, internal Apply/Enquire context, and the reusable verified provider-logo library without external lender redirects or unapproved lender/logo seeds. | [PR #215](https://github.com/brollysolutions/client1/pull/215); migration round-trip/one head, generated contracts, API Ruff/format, 60 focused API tests plus a 43-test final rerun, 369 web tests, lint/typecheck, two responsive Playwright journeys, visual review, Docker 93-page production build, and security/design/diff review. The monolithic API suite exceeded 40 minutes without a report and is inconclusive. |
| 2026-08-21 | Delivered Admin-configured Financial Products and versioned product-specific Client forms without inline KYC uploads or feature-seeded lender data; restored FR-2.2 controlled correction/audit as the next priority. | [PR #211](https://github.com/brollysolutions/client1/pull/211); migration round-trip/one-head/lender non-mutation, generated contracts, 47 focused product/config tests, 15 exhaustive ledgers/RLS contracts, API/web checks, 359 web tests, authenticated Playwright, security/design/maintainer review. |
| 2026-08-17 | Broadened the public navbar's `Loans` label to `Financial Services` so the entry describes the whole consumer-finance line (loans, credit cards, insurance) that `/loans` already serves. Label-only: route, sitemap, canonical, breadcrumb JSON-LD, and footer column unchanged. | `apps/web/components/navbars/nav-items.ts`; new `components/navbars/nav-items.test.ts` locking the label-to-`/loans` mapping; web lint, strict typecheck, full web unit suite, and production build. |
| 2026-08-16 | Completed the four-finding security-audit remediation for password/session lifecycle, web-push SSRF/DoS, and Employee task-document abuse controls. | [PR #187](https://github.com/brollysolutions/client1/pull/187); focused PostgreSQL/Redis upload/auth/push tests, API Ruff/format, generated contracts, one Alembic head, web lint/typecheck/338 tests, 93-page compilation/static generation, and security/diff review. The full API suite timed out without a report and Windows standalone symlink packaging remains host-limited. |
| 2026-08-11 | Delivered Admin operational visibility remediation (FR-2.2), closing all eight confirmed read gaps and leaving one controlled-correction plus seven audit gaps. | [PR #173](https://github.com/brollysolutions/client1/pull/173); minimized paginated API/UI, deleted-contact redaction, per-line Client profile context, generated contracts, 29 focused API/RLS tests, 321 web tests, strict checks, Linux 93-route build, and security/PR self-review. |
| 2026-08-11 | Delivered the first Admin operational coverage-audit slice (FR-2.2): exhaustive table and platform-scope policy contracts, fresh PostgreSQL authorization evidence, and an actionable 16-table remediation ledger. | [PR #172](https://github.com/brollysolutions/client1/pull/172); 47 mapped tables, 68 current platform-scope policies, 20 focused PostgreSQL/Redis tests, and the observed soft-deleted-account list defect recorded as a gap. |
| 2026-08-11 | Completed provenance-based lead-detail ownership (FR-2.8) and promoted the remaining Admin operational coverage audit (FR-2.2). | [PR #169](https://github.com/brollysolutions/client1/pull/169); additive ownership migration/trigger/RLS, Agent/Client/Admin APIs, Client/Admin UI, generated contracts, migration round-trip/one-head, focused API/RLS/static/web tests, and security review. |
| 2026-08-10 | Replaced least-loaded automatic Telecaller selection with durable per-line round-robin assignment while preserving FR-4.2/FR-4.3 completion. | [PR #163](https://github.com/brollysolutions/client1/pull/163); exact 1-2-3 wraparound, inactive/reactivated staff, separate line cursors, manual isolation, no-capacity retry, concurrent turn consumption, migration round-trip/one-head, 188 affected tests, Ruff, RLS/grant and cross-line cursor denial, security review. The monolithic API suite exceeded 30 minutes without a final report. |
| 2026-08-09 | Completed media controls finalization (FR-13.1 through FR-13.4) and promoted provenance-based edit ownership as the next priority. | [PR #159](https://github.com/brollysolutions/client1/pull/159); property/Loans MP4, assigned-Employee visit feedback, scanning/sanitization/transcoding, retention/account deletion, generated contracts, 117 focused API tests after the 1,589-test split regression, 301 web tests, Linux 92-route build, four Playwright journeys, migration round-trip/one-head, security and PR review. The repository wrapper was attempted but its monolithic API phase exceeded 30 minutes without a report. |
| 2026-08-09 | Removed Map/GMB integration (FR-18.2) completely from the active product baseline and recalculated coverage over 79 requirements. | Explicit user direction; CS-010; `feature-status.md`; all 7 feature-tracking tests pass with a denominator-aware status assertion. |
| 2026-08-08 | Initially excluded Map/GMB integration (FR-18.2) from the active roadmap; this narrower decision was superseded by the complete scope removal recorded on 2026-08-09. | User direction and the later CS-010 amendment. |
| 2026-08-07 | Completed FR-11.2 implementation pending review: same-origin notification/broadcast/push/banner destinations, verified-email transactional copies, PII-minimized notification copy, and API/web safety tests. | [PR #151](https://github.com/brollysolutions/client1/pull/151); focused Ruff/pytest and Vitest evidence. |
| 2026-08-07 | Completed FR-7.1 vehicle arrangements, resolved OI-003, and promoted analytics completion as the next priority. | [PR #149](https://github.com/brollysolutions/client1/pull/149); migration/RLS/API/web/contract changes; focused and regression tests; security review. |
| 2026-08-06 | Completed FR-2.9, FR-15.1, and FR-15.4 field visibility/contact privacy; promoted support-assisted mobile-number change as the next priority. | [PR #145](https://github.com/brollysolutions/client1/pull/145); migration/RLS/API/web/contract changes; focused and regression tests; security and PR review. |
| 2026-08-06 | Completed FR-4.6 Agent-lead expiry and promoted Admin field visibility/contact controls as the next priority. | [PR #144](https://github.com/brollysolutions/client1/pull/144); migration/job/API/RLS/web/contract changes; 42 focused API tests; 254 web tests; seeded browser verification; security review. |
| 2026-08-06 | Created living plan, model/effort policy, prioritized gaps, and co-change enforcement. | Static code/test/history assessment at `ecf6e2a`; `feature-status.md`; tracking checker tests. |
