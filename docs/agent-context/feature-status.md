# Feature implementation status

Status: **Derived living implementation ledger**

As of: **2026-08-20**

Evidence baseline: `abcc1fd`
([PR #175](https://github.com/brollysolutions/client1/pull/175)), plus the
verified Admin operational-visibility work in
[PR #173](https://github.com/brollysolutions/client1/pull/173).

**Done — registration/profile Location and Salaried terminology
(delivery PR pending; FR-17.2 and FR-18.1-adjacent profile UX; completion
coverage unchanged):** Postal address is removed from registration, Profile
settings, the API, and generated contracts. The preserved database column is
renamed to `location`; existing `net_salary` rows are migrated to `salaried`.
Users can enter a locality or explicitly ask the browser for current location;
that point is rounded to two decimals, placed into the editable field, and not
sent until the form is saved. Permission denial, timeout, and unsupported
browsers leave manual entry available. This profile value is separate from the
consented 30-day personalization signal, creates no location history, is absent
from logs/audit details/tokens/Redis, remains owner/platform-Admin RLS scoped,
and is cleared with account deletion.

Fresh evidence: 53 focused API auth/profile/deletion tests pass; Ruff check and
format pass; migration upgrade→downgrade→upgrade and the single applied head
`e4b5c6d7e8f9` pass; regenerated OpenAPI/TypeScript contracts are byte-stable;
web lint, strict typecheck, and all 375 unit tests pass. The production build
compiled, typechecked, and generated all 93 pages before the known Windows
standalone symlink `EPERM` tail; a Linux builder workaround was inconclusive.
The focused registration browser journey passes at desktop and 390px widths,
and broad Playwright is 11/15 with four unrelated stale-flow failures. The
monolithic API suite produced no report within 13 minutes and is inconclusive.
Next priority remains the FR-2.2 controlled-correction/audit follow-up.

**Done - DhanaDhara DD logo exploration board
([PR #206](https://github.com/brollysolutions/client1/pull/206); brand design
document; completion coverage unchanged):** added one self-contained SVG board
with 12 original DD constructions across three visual families, six wordmark/font
directions, the current palette, a 16-96 px reduction lab, and a client-shortlist
area. The SVG parses with a `0 0 1800 2600` view box, exposes 12 labeled concept
groups and 12 reusable mark symbols, includes title/description metadata, and has
no scripts, inline event handlers, or remote asset references. Playwright renders
at 900 x 1300 and 450 x 650 were visually reviewed; the feature-tracking check
passes. Per the client's revised direction, application pages and runtime branding
remain unchanged, as do routes, APIs, contracts, authorization/RLS, data,
workflows, dependencies, and business-line behavior. Selection, trademark
clearance, and application integration remain follow-up work; the next product
priority remains the FR-2.2 controlled-correction/audit follow-up.

**Done — Starlette HTTP 422 deprecation cleanup
([PR #205](https://github.com/brollysolutions/client1/pull/205); maintenance;
completion coverage unchanged):** all 68 production references across 19 API
route/service modules now use Starlette's current
`HTTP_422_UNPROCESSABLE_CONTENT` name. Both names resolve to numeric 422, so
response codes, payloads, routes, OpenAPI, authorization/RLS, service behavior,
models, migrations, dependencies, and the web app are unchanged. A source-wide
AST regression guard prevents the deprecated identifier from returning.

Fresh evidence: the new guard failed first with all 68 offenders and now
passes; `app.main` imports with `StarletteDeprecationWarning` promoted to an
error; five focused system tests pass; Ruff check and format pass across 457
files; and Alembic reports the single head `d3a9b72c5e41`. The full API suite
was attempted for about 13 minutes but returned no report before clean
termination, so it is recorded as inconclusive rather than passed. Completion
coverage remains 99.4%, and the next priority remains the FR-2.2
controlled-correction/audit follow-up.

**Done — refreshed bundled artwork delivery for governed banners
([PR #204](https://github.com/brollysolutions/client1/pull/204);
FR-12.1-FR-12.3; completion coverage unchanged):** bundled template artwork
now carries its immutable database template version in the served URL, for
example `/banner-templates/financial_services/personal-loan.webp?v=1`. This
forces browsers, CDNs, and Next's image optimizer to request the refreshed
pixels instead of retaining an older response at the stable public path. The
same version-aware URL is returned by the Admin/Sub Admin template library and
the anonymous public-banner API, so existing approved campaigns and newly
authored banners use one delivery rule. Canonical uploaded template objects
remain unchanged because their object keys are already unique.

No artwork, category mapping, banner copy/status, approval workflow, upload
authority, API schema, generated contract, migration, RLS policy, dependency,
or business-line behavior changed. All 32 refreshed Financial Services and
Properties images remain the governed files delivered by the banners.

Fresh evidence: the regression test failed first against the unversioned URL;
the six-test banner catalogue suite and three focused PostgreSQL-backed Docker
API tests pass, as do Ruff check/format over all 456 API files, one Alembic head,
web lint, strict typecheck, the focused 23-test web set, and all 373 web tests.
Live browser checks on `/loans` and `/real-estate` observed versioned section
artwork requests returning HTTP 200. The production build compiled,
typechecked, and generated all 93 pages before the known Windows standalone
symlink `EPERM` tail; host-side builds also cannot resolve the Docker-only
`api` hostname. The broad Docker API suite was attempted but remained active
without a report for about 30 minutes and was terminated cleanly, so it is
recorded as incomplete rather than passed. Design, security, and diff review
found no actionable issue. The work is committed and published in PR #204.
Next priority: return to the highest-ranked incomplete feature.

**Done — Financial Services and Properties campaign-art composition refresh
([PR #203](https://github.com/brollysolutions/client1/pull/203); FR-12.1-FR-12.3;
completion coverage unchanged):** all 32 governed
section-banner templates (16 per placement) have been replaced with distinct,
text-free 1440x576 editorial WEBPs following the supplied composition system:
calm copy space on the left, environmental detail entering the middle, and the
category’s focal subject primarily on the right. Financial scenes now separate
personal, business, vehicle, education, funding, insurance, and card narratives;
property scenes distinguish individual subtypes, occupancy states, single and
plural category campaigns, land uses, offers, commercial property, and general
guidance. Homepage hero and 960x540 sponsor artwork are intentionally unchanged.

CMS artwork guidance now records the middle-flow requirement. The asset contract
also rejects ungoverned files and exact duplicate hashes, protecting both the
closed category catalogue and the no-unused/duplicate-media requirement. The
public visual ledger remains 127 files (81 SVG, 44 WEBP, 2 PNG), with zero exact
duplicate groups; all generated sources were normalized without carried source
metadata and the largest final banner is about 193 KB against the 2 MB limit.
No category, template row, upload authority, API, contract, migration, RLS rule,
or public rendering component changed.

Fresh evidence: dual visual contact-sheet review and final-WEBP inspection pass;
the focused two-test asset contract, web lint, strict typecheck, and all 373 web
tests pass. Branch-specific `/loans` SSR returned 200 from the isolated dev
server; the browser connector rejects non-default port 3001, so responsive
browser screenshots are recorded as unavailable rather than passed. Production
build compiled in 56 seconds, typechecked, and generated all 93 pages before the
known Windows standalone-symlink `EPERM` tail; host-side public fetches also
cannot resolve the Docker-only `api` hostname. Design review found no actionable
issue, and security and final diff reviews found no actionable defect. The work
is committed and published in PR #203. Next priority: return to the
highest-ranked incomplete feature.

**Done — sponsor spotlight, section scroll cue, and Loans category declutter
([PR #202](https://github.com/brollysolutions/client1/pull/202); FR-2.3,
FR-6.1; completion coverage unchanged):** The public
sponsor remains a single, clearly disclosed and non-autoplaying campaign, but
now uses a bordered inset spotlight stage, restrained transform/opacity accent,
and source-faithful sponsor-art composition. The governed 960x540 creative is
contained on phones and occupies exact 16:9 rails at tablet/desktop widths,
rather than being forced into a wider cover crop. No artwork, template,
Sub-Admin authority, API, RLS, migration, or generated contract changed.

Financial Services and Properties section banners now present one functional,
focusable two-chevron cue in their existing gap. It is a real `#page-overview`
anchor with scroll margin and a visible focus ring; the previous permanent-hero
cue is suppressed only when a section banner provides the new cue. All new
motion is transform/opacity-only and static under `prefers-reduced-motion`.
On Loans, only the descriptions below “Loans” and “Cards and insurance”, plus
their 11/5-product pills, were removed; product content and the section-level
supporting copy remain intact.

Fresh evidence: focused sponsor/carousel/product rendering tests and the full
web suite pass (52 files, 372 tests); web lint and strict typecheck pass. The
production build compiled, typechecked, and generated all 93 pages, then
failed in its known Windows standalone-symlink `EPERM` tail; host-side public
fetches also cannot resolve the Docker-only `api` hostname. Design, security,
and final diff review found no actionable issue. The branch is published as
`codex/20260819-113333-701-b-out-418-b-xact-25145`; next priority is the
highest-ranked incomplete feature in the implementation plan.

**Done — governed homepage sponsor themes and public banner presentation
refinement ([PR #201](https://github.com/brollysolutions/client1/pull/201);
FR-2.3, FR-12.1-FR-12.3; completion coverage unchanged):**
`codex/20260819-060544-reconnect-mcps` refines the existing sponsor
slot into the user-selected compact split composition: text-free artwork fills
the left panel and authored campaign copy/CTA occupies the right. The card is
152px on phones, 176px at tablet width, and 208px on desktop, retains the
explicit Sponsored disclosure and session-only dismiss, and is reused exactly
in the CMS preview. Six unique 960x540 WEBPs now cover generic sponsorship,
personal finance, business finance, cards/rewards, insurance/protection, and
verified property. The previous wide variants were replaced in place; the
public media ledger contains 44 governed banner WEBPs and 127 visual files in
total (81 SVG, 44 WEBP, 2 PNG), with zero exact duplicate groups.

Sub Admin authority is deliberately unchanged: authors can select an active
governed theme and write campaign copy, while platform Admins continue to
upload/version artwork and approve campaigns. Migration `d3a9b72c5e41` seeds
the five additional template rows and adds a placement-wide partial unique
index so all six categories still share exactly one LIVE sponsor slot. The
activation job locks that shared live scope and still requires a due
cross-theme replacement to name its incumbent. No endpoint, generated
contract, RLS policy, grant, dependency, personalization rule, or upload
validation changed.

The Financial Services and Properties carousels now use a responsive 224-520px
height with a 16-24px gap before the permanent hero. The newly introduced
section-banner scroll cue was removed after direct user feedback; pre-existing
page behavior outside that cue remains untouched. Production and preview
aspect guidance stays 1440x576 for those banners, while sponsor guidance is
960x540 for its left media panel.

Fresh evidence: migration upgrade, downgrade, and re-upgrade succeeded against
the already-migrated Docker dev database; Alembic reports the single head
`d3a9b72c5e41`. Seven focused Docker API catalog/public/scheduler tests pass,
including cross-theme uniqueness and named replacement. The 18 repository
tracking/migration tests pass; Ruff check/format pass across 456 API files; web
lint, strict typecheck, and all 370 unit tests pass. The production build
compiled, typechecked, and generated all 93 pages before the known Windows
standalone symlink `EPERM` tail; local API-hostname timeouts were handled by the
existing public fallbacks. Browser checks at desktop and phone widths covered
`/`, `/loans`, and `/real-estate`. `./scripts/verify.sh --ci` was attempted
twice, but its broad API phase did not return within the first one-hour command
window and the longer run became detached when user input arrived; neither run
is claimed as passed. Design, security, and final diff review found no
actionable issue. Residual operational note: artwork dimensions remain an Admin
CMS guidance/preview contract rather than a new server-side pixel-dimension
rejection rule.

**Done — cross-line banner and offer authoring no longer 500s (defect fix, no
requirement change):** creating any banner or offer with `business_line: "both"`
returned a 500. `ck_banners_business_line_content_audience` (and its offers
twin) deliberately allow cross-line content rows, but the services forward the
entity's own line into `services/audit_log.py::record`, and
`ck_audit_log_business_line_optional_operational` allows only a concrete line or
NULL — migration `a3b4c5d6e7f8` even asserted zero pre-existing `both` audit
rows. Every existing banner/offer test used a concrete line, so the path was
unexercised until the sponsor-ad work hit it.

Fixed in `record()` rather than at the ~40 call sites: an audit entry's line is
a SCOPE, so a cross-line action is recorded as line-neutral (NULL), which is the
honest value when neither line is true. The alternative is the same ternary
repeated at every caller with a 500 waiting behind whichever one is forgotten.
Operational tables are constrained to a concrete line in the database, so the
normalization cannot mask a mis-scoped operational row, and the Admin read
filter was already typed `Literal["loans", "real_estate"] | None`, so no
read-side change was needed. No schema, contract, RLS or endpoint change.

Fresh evidence: both new tests were confirmed RED against the unfixed code and
green after (a unit test asserting `both` is stored as NULL and a concrete line
is untouched, plus an end-to-end test authoring a cross-line banner through the
real API). Ruff check and format pass across 455 files; 137 audit / banner /
offer / classification-contract tests and a further 36 admin-suite tests that
write audit rows all pass.

**Done — homepage sponsor ad slot (FR-2.3, FR-12.1; extends already-Complete
requirements, so completion coverage is unchanged):** `feat/homepage-ad-strip`
adds a sponsored ad above the Home page hero as a full-bleed leaderboard band:
creative flush to the leading edge, the sponsor's copy beside it, the CTA at the
trailing edge, a "Sponsored" disclosure and a session-only dismiss. The same
pass makes the homepage hero carousel itself full-bleed and full-screen — the
`hero` variant, whose only caller is the homepage, now fills the viewport below
the sticky header instead of rendering a centred peek-coverflow card, with the
peek blur removed, arrows pinned to the container edges (hidden at phone width,
where they sat on the headline) and dots overlaid on the slide rather than
adding a strip beneath it. `/loans` and `/real-estate` are unaffected: they use the
`section` variant. It is a fourth value on
the existing `banner_placement` enum (`homepage_ad`), so Sub Admin authoring,
the Admin approval gate, the activation scheduler, RLS, audit and the governed
artwork catalogue are all inherited: no new table, endpoint, policy, grant or
dependency.

**One sponsor at a time, with the next queued behind it.** The placement seeds
exactly one category key (`sponsor`), which turns
`uq_banners_live_placement_category` into a database guarantee of single
occupancy rather than a convention; the successor uses the existing replacement
flow (`replaces_banner_id`, promoted by `cms_activation` at its `starts_at`,
which refuses to displace a banner the newcomer does not name). The public cap
for this placement is 1 rather than 7, and because nothing rotates the renderer
is a plain component with no carousel, autoplay or arrows.

Privacy posture is unchanged and deliberate: no third-party ad script, no
impression or click beacon, and the dismissal lives in React state only —
`app/(public)/privacy/page.tsx` publishes "We do not use advertising or
tracking cookies", and the announcement bar is the precedent for session-only
dismissal. Ad CTAs stay same-origin; the `isSafeLocalHref` guard was not
touched. Sponsors cannot be linked to a property listing, because
`property_category_matches_campaign` falls through to `False` for this
placement — pinned by a test so it cannot open silently.

The migration adds the enum label inside `op.get_context().autocommit_block()`
before seeding the template row that references it. Without that block it would
pass on a fresh database and fail on every existing one (PostgreSQL forbids
using a label added by the same transaction, except for a type created there,
which is exactly the path CI takes) — so **a green CI run is not evidence for
this migration**. Fresh evidence: applied to the already-migrated dev database,
the label and seed verified, downgrade removed exactly the seeded row,
re-upgrade clean, single head `c2f8a91b4d73`. Ruff check and format pass across
455 files; 69 focused banner API/RLS/catalog tests and 33
route-authorization/RLS-coverage/scheduler tests pass, including new coverage
that a second concurrent live sponsor raises an integrity error while an
approved successor is withheld from visitors, that `?placement=dashboard` still
422s, and that the placement forces no business line. Regenerated contracts
contain only the two expected additions. Web lint, strict typecheck and all 367
unit tests pass. Browser verification at 1440px and 390px covered the image-left/content-right
layout, the disclosure, the dismiss and the hero returning flush beneath it.

Four latent traps were closed while passing through: `CATEGORIES_BY_PLACEMENT`
now fails at import if a placement is missing (it was indexed with `[]`),
`PUBLIC_BANNERS_LIMIT_BY_PLACEMENT` is derived over the enum (a missing entry
was a 500 on an anonymous route), the CMS placement list is a
`Record<Placement, …>` so tsc catches an omission instead of silently hiding a
placement from authors, and the artwork-size test uses an explicit
per-placement map rather than a ternary that dropped new placements into the
wrong size band.

**Done — public offers strip removal and navbar/section polish (public UI, no
requirement change):** on
`claude/20260818-195255-1-remove-liveoffers-entire-section-as-if`, per direct
user instruction the "Live offers / Offers running right now" strip is removed
from `/loans` and `/real-estate`: public promotional offers will be carried by
Sub Admin banner campaigns, so the strip and its supporting modules
(`components/offer-strip.tsx`, `lib/offers.ts`, `lib/public-offers.ts`, plus
their three test files) are deleted with no remaining consumers. The anonymous
`GET /api/v1/public/offers` endpoint and all authenticated Client offer
surfaces are unchanged. The desktop navbar's "Financial Services" and
"Properties" triggers now navigate to their pages on pointer click while the
mega-panel keeps opening on hover; keyboard activation (`event.detail === 0`)
still opens the panel so dropdown items remain keyboard-reachable. The /loans
products heading reads "Explore our financial services" with the eyebrow
removed (the `productsEyebrow` prop is deleted as dead code), and the Credit
Cards feature card drops its "In the spotlight" chip. Fresh evidence: web
ESLint, strict typecheck, and all 361 unit tests pass; the production build
compiles, typechecks, and generates all 93 pages before the known Windows
standalone `EPERM` symlink failure. Live browser checks verified all four
changes on the dev stack; the only console errors are pre-existing local
dev-data artifacts (homepage-closing content-block timeout and three MinIO
test-listing image-proxy 500s).

**Done — /loans "Explore our services" redesign (public UI, no requirement
change):** on `feat/loans-services-redesign`, all 16 product-card
illustrations were redrawn as one cohesive real-color family (shared
halo/shadow/sparkle scaffold; leather browns, note greens, terracotta roofs,
and gold rupee accents), replacing a first all-blue duotone pass the user
rejected mid-review. The section now carries an eyebrow/subheading header,
per-band intro copy with an accent bar and product-count chip, and refined
card hover states. The "Cards and insurance" band shows its four insurance
products in one row with Credit Cards as a full-width spotlight card at sm+
that collapses to a standard stacked product card on phones, per user
feedback; the "Why people trust us" content moved from inside that band to
the section-level `TrustStrip` below the whole grid (`ProductBand.trust`
retired; `ProductPage.productsTrust` and `ProductBand.featureProductId`
added). A real alignment defect was fixed: the Home Loan card's empty legacy
`property-loan` anchor span was a child of the Card's `gap-6` flex column and
pushed that card's illustration 24px below its siblings; anchor spans are now
absolutely positioned. The offers strip already returned `null` with no
matching live offers — behavior confirmed and locked by a new
`components/offer-strip.test.tsx` (the explicit namespace React imports added
to `offer-strip.tsx`/`lead-dialog.tsx` only serve the vitest classic-JSX
setup, matching `hero-carousel.tsx`). No route, API, contract, migration, or
RLS change. A same-PR follow-up brings the same visual language into both
desktop mega-menus: Financial Services dropdown items reuse their product's
spot illustration as a 48x36 tint-tile thumbnail (one art source for menu and
page), and the Properties dropdown gets nine purpose-drawn 96x72 subtype
miniatures under `public/illustrations/menu/properties/` because the catalog
landscape scenes are unreadable at thumbnail size. The `NavChild`/
`FinancialServiceLink` types gain an optional `illustration`; the mega-menu
renderer falls back to the Lucide icon when it is absent, and the mobile
drawer deliberately keeps Lucide icons (illustrations stay lg+ only). Menu
tests now assert every dropdown item's thumbnail exists on disk. Fresh
evidence: web ESLint, strict typecheck, and all 392 unit tests pass; the
production build compiles, typechecks, and generates all 93 pages before the
known Windows standalone `EPERM` symlink failure. Live browser checks at
1440px and 390px against the running dev stack verified band layout,
illustration fidelity and alignment, spotlight/stacked credit-card behavior,
anchors, trust strip placement, the live offers strip, and both mega-menus
rendering all 25 thumbnails; the only console error is the pre-existing
missing `homepage-closing` content block 404 in the local dev database.

**Done — property-backed public banners, property taxonomy, and full-bleed
carousel polish:** `feat/starter-banner-ctas`
([PR #195](https://github.com/brollysolutions/client1/pull/195)) preserves the
completed FR-12 authoring/Admin-approval lifecycle while adding a validated
active-property relationship for public Homepage/Properties campaigns. Public
projection now derives the same-origin enquiry destination, managed media, and
gold RERA VERIFIED badge from the approved listing and suppresses inactive
linked properties. Property intake, public filtering, and the desktop/mobile
navigation share the nine-value taxonomy; the desktop menu presents
Residential, Plots, and Commercial in one three-column row. Properties
campaigns use nine distinct, visually reviewed 1440×576 WebP assets with no
people; legacy listings and broad-category campaign edits remain compatible.
The shared carousel now rotates after five idle seconds without a visible
pause/resume control, keeps reduced-motion and hover/focus safeguards, removes
the Homepage dark scrim, and renders Financial Services/Properties full-bleed,
flush to the header and following hero, with edge chevrons and no dots.

Fresh evidence: the 113-test affected API integration set and 11-test banner
RLS suite are green, followed by a green two-test subtype-cap rerun; Ruff check
and format pass across 454 API files; Alembic is applied at the single head
`a178bb90cc12`; regenerated OpenAPI and TypeScript contracts are byte-identical.
Web lint, strict typecheck, all 386 unit tests, and the Linux production build
(all 93 pages) pass. Live desktop and 390px browser checks verified header/hero
adjacency, full-width sizing, five-second autoplay, controls, the three equal
dropdown columns, and responsive layout; all nine raster assets were inspected
for subtype fidelity and absence of people. The broad Playwright suite passed
9/14; its five failures are pre-existing flows outside this change (login
fixture, unrelated Admin search, referral-rules form assumption, loan-offers
heading, and a loan-media registration password rejected for containing the
mobile number). Security, design, and complete-diff review found and fixed the
only authoring defect (an optional property selection could not be cleared) and
found no remaining actionable issue. Requirement completion is unchanged; the
next priority returns to the FR-2.2 controlled-correction/audit backlog.

**Done — dev-stack `web` cold-start SSR fetch timeouts against `api` (dev
tooling, no requirement change):** `docker-compose.yml`'s `web` service
depended on `api` with the plain list form (`depends_on: - api`), which only
waits for the `api` container process to start, not for its healthcheck to
pass. `api`'s own healthcheck carries a 90s `start_period` specifically
because cold start runs `alembic upgrade head` (90 migrations) before
`uvicorn` binds the port (see the healthcheck `start_period` entry below) —
so on a full cold `docker compose up`, `web`'s Server Components began
firing SSR fetches at `http://api:8000` (`lib/api/server.ts`'s
`serverFetchJson`, 5s `AbortSignal.timeout`) before `api` was reachable at
all. Some raced through while others — e.g. the homepage's
`content-blocks/homepage-closing` lookup — hit the client-side timeout and
logged `serverFetchJson.network_error`, reproduced live in this session's
container logs. `scheduler` already avoided this with a hard `api:
condition: service_healthy` dependency; `web` was the one service still
using the start-only form. Fixed by moving `web`'s `api` dependency to
`condition: service_healthy`, matching `scheduler`. No application code,
route, contract, migration, or RLS change — `docker-compose.yml` only.
Fresh evidence: `docker compose config` validates; a full cold `down` + `up
-d` of the whole stack (`docker-compose.yml` + `docker-compose.dev.yml`, the
documented dev-overlay invocation in `scripts/init-dev.sh`) shows `api`
reach `Healthy` before `web`/`scheduler` begin `Starting` in the compose
event log, and `web`'s logs contain zero `serverFetchJson` timeout/network
errors across the cold boot (`grep -i "timeout\|error\|abort"` on the fresh
container log: no matches). One separate, pre-existing, dev-only artifact is
out of scope for a code fix: `next dev --turbopack`'s on-demand first
compile of a route (observed 65.7s for `/`) can still push a single
first-ever SSR fetch past the 5s timeout while the event loop is busy
compiling; the page still returns `200`, the affected section simply
doesn't render (the module's documented "never throw" contract), the very
next request succeeds in well under a second, and `next build`'s production
output has no on-demand compile step, so this cannot occur outside `next
dev`.

**Done — web `nanoid` audit patch (dependency security, no requirement
change):** CI's `pnpm audit --prod --audit-level high` (`.github/workflows/security.yml`)
failed on a high-severity `nanoid` advisory (GHSA-2v37-7h3g-55p8: custom
generators can loop indefinitely when size is zero; patched `>=3.3.18`),
reached transitively via `next > postcss > nanoid` and
`nuqs > next > postcss > nanoid`. The repo already pins `postcss` directly to
`>=8.5.10` in `apps/web/package.json`, and `postcss@8.5.23`'s own
`nanoid ^3.3.16` range already permitted the patched `3.3.18` — the lockfile
simply hadn't picked it up. `pnpm update nanoid` in `apps/web` bumped the
single deduped `nanoid` resolution `3.3.16` → `3.3.18` in
`apps/web/pnpm-lock.yaml`; pnpm's re-resolution incidentally also picked up
in-range `postcss` `8.5.23` → `8.5.26` and `rollup` `4.62.2` → `4.62.4` (both
transitive, both satisfy their dependents' existing semver ranges — no
`package.json` range changed). No application code, route, or contract
changed. Fresh evidence: `pnpm audit --prod --audit-level high` now reports
no known vulnerabilities; web lint and strict typecheck pass; all 347 unit
tests pass; the production build generates all 93 pages before the known
Windows standalone `EPERM` symlink trace-copy failure (pre-existing, present
before this change, Docker/Linux CI-only path unaffected).

**Done — [PR #190](https://github.com/brollysolutions/client1/pull/190) —
dev-stack api healthcheck start_period widened (dev tooling, no
requirement change):** local `docker compose up` intermittently aborted
`scheduler` mid-startup with `dependency failed to start: container
client1-api-1 is unhealthy`, leaving it stuck in `Created` even though `api`
recovered seconds later. Root cause: `api`'s healthcheck window (20s
`start_period` + 5 retries × 15s `interval` = 95s total grace) was tighter
than the cold-start path — `uv run alembic upgrade head` against 90
migrations, then FastAPI boot — regularly takes; `api` got marked unhealthy
once during that window, and `scheduler` (which has a hard `api: condition:
service_healthy` dependency) evaluates that condition only once during
`docker compose up` and does not retry after the dependency later recovers.
Only `docker-compose.yml`'s `api.healthcheck.start_period` changed, 20s →
90s; `interval`/`timeout`/`retries` (steady-state failure detection) are
unchanged. No application code, route, contract, migration, or RLS change.
Fresh evidence: `docker compose config` validates; a full cold
`down` + `up -d` of the whole stack (`postgres`, `pgbouncer`, `redis`,
`minio`, `clamav`, `api`, `scheduler`, `web`) completed in ~4m41s with every
service, including `scheduler`, reaching `healthy`/`Started` — the prior
failure mode did not reproduce.

**Done — public navbar label broadened (copy change, no requirement change):**
the public header's `Loans` entry is now `Financial Services`. The `/loans` page
already carries the whole consumer-finance line — the five loan products plus
the `credit-cards` and `insurance` cards in `apps/web/lib/products.ts`, both
live anchor targets — so the old label under-described the destination. Only
`apps/web/components/navbars/nav-items.ts` changed; the desktop header and
mobile drawer both read that single config, and active-state matching keys off
`href`, which is unchanged. The route, sitemap entry, canonical URL, breadcrumb
JSON-LD, page metadata, and footer `Loans` column were deliberately left alone:
renaming an indexed public path costs SEO for no user-facing gain. Requirement
completion stays at 99.4%. Fresh evidence: a new
`components/navbars/nav-items.test.ts` (3 assertions, including that the
broadened label still resolves to the live `/loans` route — the drift a later
"consistency" edit would introduce), plus web lint, strict typecheck, and all
347 web unit tests pass after merging the PR #188 coverage gates from `main`.
The production build compiles and generates all 93 pages before the known
Windows standalone `EPERM` symlink failure. No Playwright run: the public header
has no e2e coverage today and this change adds no user journey to cover.

**Done — [PR #188](https://github.com/brollysolutions/client1/pull/188) — executable
coverage gates (engineering hygiene, no requirement change):**
four security invariants that previously depended on someone remembering to
write a per-feature test are now enumerated and enforced. New route
authorization coverage asserts that each of the 232 routes either reaches
`get_current_user` — the only thing that runs `SET LOCAL ROLE api_user` and
turns RLS on — or appears in a 28-entry reviewed public allowlist. New schema
coverage asserts RLS is enabled on all 49 tables, declares the two zero-policy
deny-all cursor tables, and asserts `api_user` holds neither SUPERUSER nor
BYPASSRLS. On the web side, middleware-matcher coverage checks all 53 `(app)`
pages against the real `config.matcher`, and a client-env test rejects
secret-shaped `NEXT_PUBLIC_*` names and server-only env reads inside
`"use client"` modules. `scripts/check_migration_rls.py` fails a staged or
pull-request migration that creates a table without RLS. No route, contract,
migration, policy, or user-visible behavior changed, so requirement completion
stays at 99.4%. Fresh evidence: 8 new API tests pass in the API container
against the live schema, 6 new web tests and all 338 existing web unit tests
pass, 11 new plus 6 existing script unit tests pass, and every new assertion was
mutation-tested red before acceptance. The API integration suite cannot run on
this Windows host at all (the `greenlet` DLL fails to load and the database
hostname is Docker-internal), so API tests were executed inside
`client1-api-1`. The full API suite completed there at **13 failed, 1665
passed** in 38 minutes. Six of those failures pass when their file is run alone
(cross-test ordering and the shared Redis that `conftest.py` documents as never
flushed). The other seven also reproduce alone — a run in which pytest collects
only that one file and never imports the two test files added here, which is
what rules this change out as the cause; they trace to accumulated rows in this
long-lived dev container's database, such as
`test_loan_types_returns_seeded_labels` expecting the seeded `Personal Loan`
label that test-created loan types have displaced. CI provisions a fresh
database, so these are not expected to reproduce there, but that is a
prediction rather than evidence and needs confirming on the pull request.

**Done — [PR #184](https://github.com/brollysolutions/client1/pull/184) — Sub Admin CMS workspace redesign:** the Sub Admin home now presents a 310px matched "Waiting on Admin"/referral-payout row and a filtered full-screen approval workspace. Referral rules, banners, offers, and website content now provide summary metrics, bounded local filters and paging over already-authorized records, full-screen create/edit lifecycle workspaces, and discard confirmation. Banners and offers preview their public and authenticated-dashboard presentations; website content has an escaped plain-text public preview plus a placement/lifecycle guide. Existing API/RLS authorization, business-line isolation, audience grammar, banner approval, offer/content lifecycle, safe-link rules, and Admin-only payout execution remain unchanged, so requirement completion stays at 99.4%. Fresh evidence: lint, strict typecheck, all 337 web unit tests, the existing five-route Sub Admin authoring browser test, and a new live-stack four-workspace/guide Playwright journey pass. The production build compiles, validates types, and generates all 93 pages before the known Windows standalone `EPERM` symlink failure; host-side public fetches cannot resolve the Docker-only `api` hostname. Security and maintainer review found no actionable defect.

## Purpose and authority

This file answers what is implemented and what remains against the 79 active
functional requirements. The supplied SRS v1.2 contains 80 historical
requirements, but CS-010 removes FR-18.2 Map/GMB integration from the product
scope. This ledger is derived from current
code, migrations, tests, recent history, and
[`current-implementation-state.md`](current-implementation-state.md). It does
not rewrite or replace the approved SRS or feature list.

Status meanings:

- **Complete**: the current repository has end-to-end implementation and
  relevant automated evidence for the requirement, subject to normal release
  verification.
- **Partial**: a usable slice exists, but at least one material part of the
  requirement is absent.
- **Not started**: no implementation satisfying the requirement was found.

This is code-coverage status, not a production-readiness or deployment claim.
Manual acceptance testing, infrastructure readiness, operational runbooks, and
live-provider configuration are assessed separately.

## Completion snapshot

| Measure | Result |
| --- | ---: |
| Complete requirements | 78 / 79 (98.7%) |
| Partial requirements | 1 / 79 (1.3%) |
| Not-started requirements | 0 / 79 (0%) |
| Weighted implementation coverage | **99.4%** |

Weighted coverage gives each Complete item 1 point and each Partial item 0.5
points: `(78 + 1 x 0.5) / 79 = 99.37%`, rounded to **99.4%**. The weighting is a planning aid, not
an estimate of calendar time: a single security-sensitive gap can require more
work than several completed UI requirements.

## Current work

**Delivery:** [PR #194](https://github.com/brollysolutions/client1/pull/194). Next priority remains the FR-2.2 controlled-correction and remaining audit-family follow-up.

**Final banner acceptance update (2026-08-18; supersedes the residual-risk sentence in the banner record below):** all three anonymous placements are capped server-side at seven slides and use the shared five-second automatic horizontal carousel with manual arrows, dots, pause behavior, focus/hover pausing, and reduced-motion handling. Financial Services and Properties render at the top of their pages in a shorter 5:2 format; their 1440x576 artwork keeps the left copy area calm and advertises the applicable finance or property category, while Homepage retains its existing hero proportions. Live desktop and 390px mobile browser review verified fit, blend, interaction, and responsive copy without relevant console errors; review records were removed afterward. Anonymous serving and scheduled activation now fail closed for linked Offers with non-empty audience rules. The final focused API/RLS/scheduler/coverage gate passes 106 tests. The monolithic API suite completed with 1,683 passes and eight failures on the long-lived shared stack; the one feature-owned policy-ledger failure is fixed and green in the final focused gate, while the other seven are unrelated pre-existing shared-state failures. Web lint, strict typecheck, and all 376 unit tests pass; compilation, typechecking, and generation of all 93 pages complete before the known Windows standalone symlink `EPERM` packaging failure. Security, design, and diff review found no remaining actionable banner defect.

**Done on `claude/20260817-183438-scheduler-1-info-apscheduler-executors-def` — template-governed public banner campaigns:** the existing Sub Admin banner lifecycle and Admin approval gate now extend into fixed Homepage, Financial Services, and Properties placements. Migration `ee56ff78aa90` adds the `banner_placement` enum, a `banner_templates` catalogue seeded with 29 deterministic `uuid5` rows pointing at reviewed, text-free artwork committed under `apps/web/public/banner-templates/`, five additive `banners` columns, immutability triggers on both published template versions and campaign identity, a partial unique index enforcing one live campaign per placement/category, and a Sub Admin draft-only `banners_delete` grant plus policy. Existing banners backfill to `homepage`, and `personalized` rows to the internal `dashboard` placement, so authenticated personalization behavior is preserved exactly. **FR-12.3's Admin approval gate is unchanged** — Sub Admin still authors and submits; only Admin approves. The anonymous `GET /api/v1/public/banners` gains `?placement=` typed as a narrow three-value literal rather than the raw enum, so the internal `dashboard` placement cannot be served anonymously; verified live (no param → 200, `?placement=bogus` and `?placement=dashboard` → 422). Nine new `audit_action` values give banners a complete append-only trail across router, service, and scheduler transitions, closing one of the seven audit-family gaps tracked under FR-2.2 (now six). `banner_templates` is declared in both the business-line classification ledger (`PLATFORM_CONFIG`, line-neutral shared asset) and the Admin operational coverage registry. Requirement completion is unchanged at 78/79: this extends already-Complete FR-12.x placements rather than closing an open requirement. Fresh evidence: 55 focused banner API/RLS/catalog tests, 39 personalization/scheduler/purge/route-authorization/RLS-coverage tests, and 18 classification/database/Admin-coverage contract tests pass; Ruff check and format pass across 452 API files; one Alembic head, applied to the running stack; regenerated contracts show no drift; web lint, strict typecheck, and all 376 unit tests pass; the build generates all 93 pages before the known Windows standalone `EPERM`. Residual risks: the monolithic API suite was not run, and with no web dev server running and no live approved banner seeded, the rendered public appearance of a template campaign and the `design-review` pass are **unverified**.

**Done on `claude/20260817-125827-which-skill-to-use-to-design-frontend` — Financial Services navbar mega-menu (public UI, not FR-numbered):** the public navbar's "Financial Services" item was a plain link to `/loans`, a page that had grown to 16 consumer-finance products (11 loan types, 4 insurance types, credit cards) with no way to browse them from the navbar itself. This reverses the "dropdown children removed, dedicated pages only" decision from commit `45d9573`; see `.agent-workflow/DECISIONS.md` DEC-20260817-01. A same-branch follow-up (DEC-20260817-02) then applied direct user feedback: the mega-menu's desktop layout is now 2 columns — Loans alone, and Insurance + Credit Cards stacked as two headed sections in one column, replacing an earlier single-item "highlight tile" design for Credit Cards that read as a rendering bug; and `/loans`'s "Why people trust us" content moved from a standalone strip below the whole grid into a wide `ProductBand.trust` tile that sits beside the Credit Cards card, spanning that row's remaining columns. The public `/contact` form's topic selector now reads "Financial Services" instead of "Loans" (display label only; the underlying `LeadTopic`/`business_line` wire value is unchanged at `"loans"`). `lib/products.ts`'s `LOAN_PRODUCTS` grew 7 → 16, each with a `group`/`navLabel`; `/loans` renders them as two labeled bands (`LOAN_PRODUCT_BANDS`) instead of one flat grid, with 9 newly authored SVG illustrations so every card keeps the illustrated band. `property-loan` was retired as a product id and split into `home-loan` (which carries `legacyAnchorId: "property-loan"` so old links still resolve) and `loan-against-property`; `footer-links.ts` was updated to match. `components/ui/navigation-menu.tsx`'s viewport wrapper was recentered so the mega-panel does not clip off-screen at the 1024px `lg` breakpoint. No route, API, contract, migration, or RLS change; requirement completion is unaffected (this is public marketing UI, not an SRS-tracked requirement). Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (368/368, including new `lib/products.test.ts` and `components/navbars/financial-services-menu.test.ts`, updated `nav-items.test.ts`/`footer-links.test.ts`) pass; `pnpm build` compiles, typechecks, and statically generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. No browser automation tool was connected this session, so the interactive manual pass (panel layout/clipping at 1024/1280/1440px, keyboard walk, focus return, reduced motion, mobile drawer) is unverified — flagged as a residual risk for follow-up.

**Done — [PR #187](https://github.com/brollysolutions/client1/pull/187) — security-audit remediation:** password recovery now treats suspended/deleted identities like unknown accounts for delivery and refuses a reset-token mutation while holding the user-row lock; password reset and authenticated password change increment `session_version` and revoke refresh tokens atomically. Browser push subscriptions accept only configured HTTPS provider hosts, unsafe legacy rows are pruned without a request, redirects are disabled, and delivery is bounded to ten seconds. Employee task documents now use storage-signed 5 MiB multipart policies, an hourly per-account budget, a single-use owner/task/type-bound confirmation claim, bounded canonical bytes that cannot be replaced through the staging signature, row-locked 12-document quotas, and private no-store responses. Generated contracts and the web multipart client are current; authorization, own-task RLS, private downloads, forced-reset activation, and requirement completion remain unchanged. Fresh evidence: 128 focused API tests and final 39-, 18-, and 1-test security reruns pass; Ruff and formatting pass across 447 API files; Alembic has one head; web lint, strict typecheck, and all 338 tests pass. The production build compiles, typechecks, and generates all 93 pages before the known Windows standalone `EPERM`; host-side public fetches cannot resolve Docker-only `api`. The monolithic API suite reached its 30-minute bound without a final report and is inconclusive. Security review additionally closed confirmation-budget bypass and post-confirm object replacement; no reachable finding remains in this remediation slice.

**Done — [PR #186](https://github.com/brollysolutions/client1/pull/186) — replace Admin home Audit log frequent action:** this UI-only maintenance slice replaces the stale Audit log home action with the existing Lead assignments workspace, matching the prior Admin navigation removal. Routes, APIs, contracts, data, server-side authorization, RLS, and audit history are unchanged. The focused regression, web lint, strict typecheck, and all 338 web unit tests pass. The production build compiled, typechecked, and generated all 93 pages before the known Windows standalone `EPERM` symlink failure. Requirement completion remains 99.4%; next priority is the FR-2.2 controlled-correction/audit follow-up.

**Done — [PR #185](https://github.com/brollysolutions/client1/pull/185) — hide Admin Website content and Audit log navigation:** this UI-only maintenance slice removes those two links from the platform Admin sidebar while preserving their existing Admin-guarded dashboard routes, API clients, contracts, server-side authorization, RLS, audit data, and CMS behavior. Sub Admin retains the Website content link. The focused navigation regression, web lint, strict typecheck, and all 337 web unit tests pass. After rebuilding the local dev services, the live Admin browser scenario passed the two navigation assertions but later encountered an unrelated Operational Records search-control expectation; the production build compiled, typechecked, and generated all 93 pages before the known Windows standalone `EPERM` symlink failure. Requirement completion remains 99.4%; next priority is the FR-2.2 controlled-correction/audit follow-up.

**Done in [PR #183](https://github.com/brollysolutions/client1/pull/183) — remove Admin unassigned-lead queue UI:** the Admin Lead assignments route now retains assigned-lead oversight only; its unassigned-capacity tab and browser data fetch are removed. The Admin-home capacity metric points to Users & staff with explicit add/activate-a-matching-Telecaller guidance. This does not change the internal unassigned-list API, automatic same-line round-robin and bounded retry workflow, Admin route/API/RLS guard, assignment authority, contract, or customer data model. Fresh evidence: focused routing and navigation regressions, lint, strict typecheck, and all 330 web unit tests pass. Production compilation/typecheck/static generation of all 93 routes pass, but Windows standalone packaging cannot create required symlinks (`EPERM`) and the Docker-only `api` hostname is unavailable; an authenticated browser check could not run without a local stack.

**Done in [PR #182](https://github.com/brollysolutions/client1/pull/182) — Admin home review-queue ergonomics:** the Admin-home "Waiting on you" and Operational load panels now retain the same 270px height, with the review preview scrolling inside its panel rather than stretching the dashboard. A keyboard-accessible full-screen dialog filters the already Admin-authorized loaded preview by text, queue kind, business line, and inclusive submitted-date range; it clears filters and has a light-blue-hover close affordance. This is a UI-only read change: the `pending_review` summary contract, Admin-only route/API/RLS guard, and minimized display fields remain unchanged. The unassigned-lead metric continues to mean no active same-line Telecaller capacity; creation and the bounded retry job already assign eligible leads automatically, so no manual Agent/Telecaller assignment button is in scope. Fresh evidence: the focused 2-test regression, web lint, strict typecheck, and full 329-test unit suite pass. Production compilation/typecheck/static generation of all 93 routes pass, but Windows standalone packaging cannot create required symlinks (`EPERM`) and the Docker-only `api` hostname is unavailable; an authenticated browser check could not run without a local stack.

**Delivered in [PR #180](https://github.com/brollysolutions/client1/pull/180) — Admin operations filters and table experience:** Audit now has server-authorized action, line, record-type, and date filtering with generated contracts and explicit page navigation; Operational Records also uses bounded pages rather than append-only loading. Lead assignments, field tasks, loan applications, property deals, vehicle arrangements, listing approvals, agent applications, content pages, and payouts use date-range and contextual filters with bounded UI pages over their existing authorized queue results. The broadcast composer is visually refreshed without changing its server-validated recipient preview, rate limit, same-origin link, or irreversible-send controls. Users & staff now uses equally tall provisioning/access cards, a thin inner Staff Access scrollbar, and a compact paginated operational-account table; account suspension/reactivation requires a reasoned confirmation dialog and still calls the existing audited server mutation. No client-side authorization, scheduling, recipient authority, generic CRUD, RLS, or PII-projection boundary was added. Fresh evidence: API Ruff/format and generated contracts; web lint, strict typecheck, and 327 Vitest tests passed. The local API database suite is blocked by the unavailable native `greenlet` DLL; the Windows production build exceeded the three-minute cap.

**Done in [PR #177](https://github.com/brollysolutions/client1/pull/177) â€” UI-only Settings, Operational Records, filters, and form
navigation:** on `fix/ui-settings-records-navigation`, Client Settings will
retain personal-profile fields while Agent/staff Settings limits the form to
account contact details and relevant existing controls. Operational Records
will remain protected by the existing Admin-only route/API/RLS path but be
removed from the visible sidebar; its existing authorized result set gains only
local search/status filtering. Dashboard form return links will use the
established accessible link behavior with a consistent back affordance. This
slice adds no endpoint, generated contract, data, RLS, or authorization
behavior; it must preserve minimized operational-record projections and safe
route guards. Fresh evidence: 327 web unit tests, lint, strict typecheck, focused
Admin/Employee/Sub Admin Playwright coverage, and `git diff --check`; the local
production build exceeded the five-minute execution cap without a result.

**Delivered in [PR #176](https://github.com/brollysolutions/client1/pull/176)
â€” notification unread-state synchronization (FR-17.1):** on
`security/operational-identity-auto-assignment`, one
dashboard-scoped client source now synchronizes the shared bell, preview, and
notification page. Single-read and mark-all mutations optimistically update the
same snapshot, then refetch the server-authoritative count; an out-of-order
count response cannot overwrite a newer request. Mutation failures restore the
prior snapshot and refetch. The existing owner-only API/RLS boundary and safe
local notification links are unchanged; no producer, endpoint, contract, or
authorization behavior was added. Fresh evidence: three focused state
regressions, 324 web unit tests, lint, strict TypeScript, and all nine live
role/navigation Playwright scenarios. The Windows production build compiled,
typechecked, and generated all 93 pages, but cannot finish standalone output in
this environment because Windows denies the required symlink (`EPERM`).

**Delivered in [PR #175](https://github.com/brollysolutions/client1/pull/175)
— fail-closed operational identity and automatic Employee assignment:** the
`security/operational-identity-auto-assignment` branch now
prevents profile-less identities from receiving Client claims, terminates
deleted/orphaned sessions at the landing page, excludes active staff and Agents
from customer-lead queues, and preserves the normal OTP registration/login path
for Agent-introduced customers. Lead and field-work assignment are service-owned
per-line round robin workflows with durable no-capacity retry, inactive-assignee
repair, system audit events, and dual-line eligibility. Admin assignment routes
and controls are removed in favor of read-only lead/Telecaller/Employee
relationships; Admin still supplies vehicle logistics while Employees complete
their own assigned pickups. The new Employee cursor is RLS-forced, unavailable
to `api_user`, and constrained to active same-line or dual-line Employees. Fresh
focused evidence currently includes 75 auth/session/deletion/lead tests, 20
Admin lead/task tests, 27 lead/Employee/vehicle assignment tests, 12 operational
coverage tests, the Agent-introduced Client login regression, repeated migration
downgrade/upgrade with one head, API Ruff/format across 446 files, web lint,
strict TypeScript, and all 321 Vitest tests. The Windows production build
compiled, typechecked, and generated all 93 pages before the known standalone
symlink `EPERM`; Docker Desktop became unavailable during the Linux packaging
retry, so that command is unverified. The repository verifier spent 50 minutes
in its monolithic API pytest phase without emitting a report and is therefore
inconclusive, not passing. Security and diff review found no remaining reachable
authorization, cross-line, RLS, PII, concurrency, or audit defect. The
79-requirement completion score is unchanged because this work corrects and
hardens already-counted requirements rather than adding scope. The next
recommended UI defect is notification unread-state synchronization using
`gpt-5.6-terra` at High effort.

**Done in [PR #174](https://github.com/brollysolutions/client1/pull/174) — dev-seed Indian mobile-number correctness (maintenance):** one shared helper generates synthetic `+91` mobile numbers
with a ten-digit local number beginning 6–9. The Agent-application and
Telecaller dev seeds plus every affected test generator use it, and a focused
regression test locks the format. Fresh container evidence covers 52 focused
API/RLS tests; public E.164 validation, production intake, authorization, and
RLS are unchanged. The monolithic API suite exceeded the execution-host window
without a report and is therefore inconclusive, not passing.

**Done in [PR #181](https://github.com/brollysolutions/client1/pull/181) — Admin user-list legacy-email resilience (maintenance):** the
platform-Admin list must retain its `private, no-store` response and email
contract when direct local seeding has inserted a reserved-domain address that
the current strict email validator rejects. The targeted fix redacts only
malformed legacy values, rejects them in the development Admin seeder, and is
covered by 16 focused container tests plus full API Ruff/format and one Alembic
head; the monolithic API suite reached the 30-minute local bound without a
final report and is inconclusive. No role, RLS, account-deletion, or production
registration behavior changes.

The remaining **FR-2.2 Admin operational coverage audit** has an exhaustive,
test-enforced baseline across 47 mapped tables and all 68 current
platform-scope RLS policies. The visibility-remediation slice closes all eight
confirmed read gaps: soft-deleted accounts serialize with tombstone contact
values redacted, Users & staff includes per-line Client profile context, and a
dedicated paginated Admin workspace exposes minimized authentication events,
enquiries, lead activities, loan transaction history, site visits, and
transactions. Eight confirmed gaps remain: one typed approved-listing
correction and seven append-only audit-event families. Payout controls,
private-document access, secret/location minimization, immutable ledgers, and
business-line segregation remain non-negotiable compatibility constraints.

## Delivered implementation

- **Admin operational visibility remediation** (FR-2.2) is delivered in
  [PR #173](https://github.com/brollysolutions/client1/pull/173). Six dedicated,
  read-only, paginated routes require both the Admin role and platform scope
  before querying through the request's RLS-bound async session. Their explicit
  projections omit authentication IP/user-agent/detail, enquiry and visit
  contacts/messages, pickup locations, call notes, and transaction references.
  Sensitive responses are `private, no-store`. The Admin Operational records
  workspace adds lazy tabs, pagination, refresh/retry, and accessible
  loading/error/empty states; Users & staff now renders Loans/Real Estate
  profile identifiers and every valid profile lifecycle state. Deleted account
  mobile/email tombstones are returned as null while retained profiles remain
  visible as inactive history. Generated OpenAPI/TypeScript contracts are
  current. Fresh evidence passes Ruff and formatting across 440 API files, 29
  focused API/authorization/RLS tests, web ESLint, strict TypeScript, all 321
  Vitest tests, and a Linux production image build packaging all 93 routes.
  Security/self-review added the missing `pending` profile state and no-store
  headers; no reachable finding remains. The Windows host build exceeded its
  command bound without a report, while the canonical Linux build passed. The
  repository-wide verifier likewise reached its 30-minute command bound without
  emitting a report, so that aggregate run is inconclusive.
  FR-2.2 remains Partial because one controlled listing-correction gap and seven
  append-only audit gaps remain.

- **Admin operational coverage contract** (FR-2.2) is partially delivered in
  [PR #172](https://github.com/brollysolutions/client1/pull/172). An explicit
  registry maps all 47 SQLAlchemy tables to FR-2.2 domains and records
  sensitivity, least-data
  Admin view authority, supported workflow/status/configuration commands,
  API/UI paths, RLS and audit expectations, and covered/gap/protected status.
  Structural tests fail on unclassified future tables, unsafe full views of
  secrets/location/storage keys, unbounded mutation claims, or incomplete
  FR-2.2 noun mappings. Sixteen tables are confirmed gaps: eight view gaps, one
  approved-listing correction gap, and seven missing append-only audit-event
  families. Fresh Docker-network PostgreSQL/Redis evidence passes 20 tests for
  the registry, platform-scope policy structure, account suspend/reactivate,
  notification audit, listing publish/hide, safe audit details, session
  invalidation, and Client/line-scoped Admin denial. The audit also found that
  `/admin/users` cannot serialize a page containing a soft-deleted account's
  `deleted.invalid` tombstone email; the contract now marks that view as a gap.
  The platform-scope ledger was repaired to exhaustively match all 68 current
  policies without changing any policy or grant. FR-2.2 remains Partial: this
  evidence slice changes no route, contract, RLS behavior, migration, or UI.
  Full Ruff and formatting checks pass across 436 API files, Alembic reports
  one current head, and security review found no remaining reachable issue
  after requiring session/push-secret tables to have no Admin projection. The
  monolithic API regression reached its 30-minute command bound without a
  pytest report and is inconclusive rather than passing.

- **Admin operational coverage audit — user, notification, and listing slice**
  (FR-2.2) is partially delivered on
  `codex/20260810-161623-ps-d-dhanadhara-client1-docker-compose-f`. Platform
  Admin can now list operational identities and suspend/reactivate eligible
  accounts with a reason, atomic session/profile invalidation, and a safe audit
  record; no caller can change itself or the immutable Main Admin. A separate
  read-only notification-audit projection preserves recipient read state and
  excludes mobile/email. Admin can also publish or hide an approved property
  listing through a reasoned, status-only RLS action without rewriting reviewed
  facts or media. Generated contracts, API focused tests, Web TypeScript, and
  API Ruff pass; the Docker-backed focused suite exceeded its two-minute bound
  before returning a report. FR-2.2 remains Partial until the exhaustive
  user/media/listing/notification/record inventory and database evidence finish.

- **Provenance-based edit ownership** (FR-2.8) is complete in
  [PR #169](https://github.com/brollysolutions/client1/pull/169). Lead names and journey notes now retain immutable
  Agent/Client creator descriptors across capture and OTP binding. Agent edits
  remain available through assignment until Telecaller work starts; Client
  edits remain available until a terminal state; platform Admin corrections
  require an audited reason without transferring ownership. Telecaller notes
  stay in append-only activities. A row-locked shared service, command-specific
  RLS, and a database trigger enforce lifecycle, allowed columns, same-line and
  creator authority and reject ownership-descriptor planting. The new Client
  Settings card and Admin correction dialog use generated types and minimized
  `private, no-store` responses. Fresh evidence includes repeated migration
  downgrade/upgrade with one head, direct SQL denial tests, all 85 affected
  ownership/public-capture/Agent/Telecaller/lead-RLS tests, API Ruff, full web ESLint, strict
  TypeScript, all 320 Vitest tests, and a Linux production image packaging all
  92 pages. The host build also compiled/generated every page before the known
  Windows standalone-symlink `EPERM`. Security review found and remediated
  descriptor planting, stale-row, superuser capture/claim overwrite,
  direct-insert spoofing, response-minimization/cache, and silent-extra risks;
  no finding remains. The
  repository-wide verifier reached its 30-minute bound without a report and is
  inconclusive rather than passing. The sole remaining partial requirement is
  FR-2.2 Admin operational coverage.

- **Admin operational CMS coverage** (FR-2.2) is partially delivered in
  [PR #168](https://github.com/brollysolutions/client1/pull/168). The verified
  coverage inventory found that platform Admin could
  view, but not create or update, shared banners, offers, content blocks, and
  referral-bonus rules. Platform Admin can now author and correct those records
  through the existing typed routes and accessible dashboard forms; regular Sub
  Admin users remain creator-scoped. A new additive RLS migration requires both
  `role=admin` and `platform_scope=true` for the override, while preserving
  immutable business-line triggers, no-delete lifecycle behavior, and existing
  transition validation. Focused API and RLS suites were attempted but skipped
  because the PostgreSQL fixture is unavailable; full API Ruff, migration-head,
  web lint, strict typecheck, and 319 web unit tests pass. The full CI script
  reached its 30-minute cap without a report. The host web build compiled,
  typechecked, and generated all 92 routes but standalone trace export failed
  on Windows symlink `EPERM`; the browser suite's API-dependent tests reset at
  `localhost:8000` (one independent case passed). FR-2.2 remains Partial: the
  next audit must inventory the remaining user, media, listing, notification,
  and record-level Admin update surfaces and add executable database evidence.

- **AWS-inspired multi-role dashboard experience** (FR-2.1 through FR-2.7 and
  FR-17.1) is implemented in
  [PR #167](https://github.com/brollysolutions/client1/pull/167).
  Admin, Sub Admin, Telecaller, Employee, and Agent now receive a permanently
  expanded labeled desktop sidebar without a panel-toggle icon, while Clients
  retain their remembered expand/collapse preference and every role retains the
  mobile drawer. One semantic icon registry drives navigation and home
  shortcuts. Shared page-header, metric, queue, panel, status, and quick-action
  patterns give all six role homes a denser operational hierarchy without
  changing routes, permissions, API schemas, or RLS. The Employee home exposes
  Vehicle arrangements only for the active Real Estate line. Fresh evidence:
  15 focused sidebar/navigation tests, all 319 web unit tests, full lint, strict
  typecheck, a passing Linux production image with all 92 routes, and an
  eight-case live-stack Playwright role/mobile matrix. The native Windows build
  also compiled, typechecked, and generated all routes before the known
  standalone symlink `EPERM`. Coverage remains **98.7%** because this improves
  already-complete role dashboard requirements without closing FR-2.2 or
  FR-2.8. A follow-up on the same PR brings Admin Users & staff plus every Sub
  Admin banner, offer, content-block, property-submission, and referral-rule
  form into the same operational hierarchy. It preserves identity authority,
  one-time credentials, Main Admin limits and session invalidation, managed
  upload/approval boundaries, and payout separation. Fresh follow-up evidence:
  full lint and strict typecheck, all 319 unit tests, all eight live-stack
  Playwright cases with expanded Admin/Sub Admin route assertions, and a Linux
  production image packaging all 92 routes. A second follow-up completes the
  same presentation system across Client loan detail, Explore, application,
  private loan media, bank comparison, loan-officer, transaction, referral,
  notification, enquiry, site-visit, property comparison, assigned-agent,
  bookmark, and listing-submission surfaces. Referral copy feedback now appears
  inside the code tile with a check confirmation and the share action uses a
  WhatsApp glyph. Property search adds an explicit action and structured
  map-pin location picker over existing locality/city/PIN facets, without GPS
  or Map/GMB. The shared shell provides a lazy, safe-link notification preview
  on hover, focus, or click for every dashboard role. Fresh evidence: full
  ESLint, strict TypeScript, all 319 unit tests, and nine live-stack Playwright
  cases covering all six roles and the complete Client route/interaction
  matrix. The exact final-tree native build compiled, passed its internal
  lint/type phase, and generated all 92 routes before the known Windows
  standalone symlink `EPERM`; the Linux image attempt reached 15 minutes
  without a final report after Docker Desktop became unresponsive, so artifact
  export is inconclusive. API ownership, RLS, uploads, payouts, and contracts
  remain unchanged.

- **Delegated payout operations and Admin hierarchy** (FR-2.2, FR-2.3, and
  FR-10.3) are complete in
  [PR #165](https://github.com/brollysolutions/client1/pull/165). One
  migration-backed Main Admin may create at most three additional active Admin
  accounts and grant or revoke the closed `payout_requests` feature for active
  Sub Admins. Grant changes invalidate the target's access and refresh sessions;
  the next normal login receives the persisted feature in a signed claim that
  is enforced by the API and payout RLS. A granted Sub Admin may search
  recipients and create/list payout requests, but approval, rejection,
  reconciliation, and every manual-cheque action remain Admin-only. Main
  Admin-created payouts are the sole approval-free exception and retain caps,
  self-payout denial, idempotency, audit, provider, and ledger controls; payouts
  raised by a Sub Admin or additional Admin still require a different Admin.
  Evidence: migration downgrade/upgrade with one head; 4 hierarchy/grant tests,
  61 payout/API-RLS tests, 94 linked-payout/admin/auth tests, and 35 account-
  deletion tests; generated contracts; and web lint, typecheck, and all 315
  unit tests. The host production build
  compiled, typechecked, and generated all 92 pages before Windows standalone
  symlink creation failed with `EPERM`; the mounted-workspace Linux build timed
  out during output tracing, so artifact packaging remains inconclusive. The
  monolithic 1,620-test API run reached its 30-minute bound at 57% with
  order-sensitive auth/rate-limit failures; the exact affected login/IP-rate
  modules pass independently (23 tests), so the broad run is recorded as
  inconclusive rather than passing.

- **Staff line access and payout workflow corrections** (FR-1.4, FR-2.5,
  FR-2.6, FR-10.3, and FR-11.x) are complete on
  [PR #164](https://github.com/brollysolutions/client1/pull/164). Admin provisioning now offers
  Loans, Real Estate, or Both for Telecallers and Employees. Dual-line staff
  select one concrete line per request; the API validates the selector before
  installing RLS context, while assignment and ownership policies continue to
  isolate records. The Admin sidebar keeps wheel/touch/keyboard scrolling but
  hides the visual track. Pending payouts now expose viewer-specific approval
  eligibility so the maker sees a clear wait-for-another-Admin handoff while a
  different Admin retains the approval action; the server-side maker/checker,
  recipient, cap, idempotency, audit, and ledger controls are unchanged.
  Notification behavior was verification-only and needed no product change.
  Evidence: 50 notification API/RLS/link/push tests, 12 focused dual-line and
  payout integration tests, a clean migration upgrade/downgrade/upgrade cycle,
  Ruff, one Alembic head, generated contracts, web lint/typecheck, and all 313
  web unit tests. The Windows build compiled, typechecked, and generated all 92
  pages before standalone symlink creation failed with host `EPERM`; a separate
  Linux Docker build exceeded its ten-minute reporting window, so artifact
  packaging is inconclusive rather than passing.

- **Role-aware dashboard navigation** (FR-2.1 through FR-2.7 and FR-17.1) is
  complete in [PR #162](https://github.com/brollysolutions/client1/pull/162). A typed
  role/business-line capability catalogue now drives grouped sidebar navigation
  and a shared direct-route UX guard for all 52 checked-in dashboard pages.
  Client Loans/Real Estate features remain line-specific; Agent, Telecaller,
  Employee, Sub Admin, and Admin see only their existing authorized workspaces;
  and unknown or role-ineligible dashboard URLs return to the role home. API
  dependencies, platform scope, service checks, and PostgreSQL RLS remain the
  unchanged security boundary. Evidence: 9 focused navigation/route tests, all
  310 web unit tests, lint, typecheck, a passing canonical Linux production
  build, and 8 live-stack Playwright cases across all six roles plus mobile and
  Sub Admin authoring. Security and diff reviews found no remaining actionable
  issue. Coverage stays **98.7%** because this hardens existing completed role
  requirements without claiming the remaining FR-2.2 or FR-2.8 gaps.

- **Business-line classification hardening** (FR-1.1) is complete in
  [PR #160](https://github.com/brollysolutions/client1/pull/160). An exhaustive
  contract classifies every mapped table and managed-media purpose; operational
  rows now require exactly Loans or Real Estate, while staged referrals,
  platform staff, global content, audit, identity, derived, and configuration
  exceptions are explicit. Database checks, immutable tags, and parent/source
  triggers reject missing, `both`, cross-line, and bypass-session mismatches.
  Login and password recovery no longer manufacture sales leads; public intent,
  payout creation, bonus rules, reports, and web controls require a concrete
  line. Fresh evidence covers all 1,602 current API tests across isolated
  groups with corrected files rerun, ten classification tests, four clean
  installs and a migration round-trip, one Alembic head, Ruff, generated
  contracts, 301 web tests, and a Linux 92-page production build. Count-only
  preflight intentionally blocks the accumulated dev database's 424 ambiguous
  legacy leads; production rollout requires authoritative remediation. The next
  priority is provenance-based edit ownership (FR-2.8).

- **Media controls finalization** (FR-13.1 through FR-13.4) is complete in
  [PR #159](https://github.com/brollysolutions/client1/pull/159). Property and Loans workflows
  now accept bounded MP4 assets with private pending/processing states and
  purpose-specific publication rules; assigned Real Estate Employees can attach
  private sanitized images/PDFs to property-visit feedback for Admin review.
  ClamAV, Pillow, and FFmpeg provide fail-closed scanning, metadata removal,
  and H.264/AAC transcoding. RLS, ready-video database constraints, signed-link
  cache controls, quotas/rate limits, row-locked recovery, 7/90-day retention,
  orphan cleanup, and account-deletion cleanup preserve the lifecycle. Fresh
  evidence includes 117 affected API/RLS/media tests after a 1,589-test full
  API regression, 301 web tests, generated contracts, a migration round-trip
  with one head, a Linux 92-route production build, and four Playwright
  journeys. Security and correctness review findings were remediated. The
  mandated repository wrapper was attempted separately; its monolithic API
  phase reached 30 minutes without a final report, so that wrapper is
  inconclusive rather than passing.

- **Workflow-bound Loans media gallery** (FR-13.1 through FR-13.4) is
  implemented in [PR #157](https://github.com/brollysolutions/client1/pull/157). Clients see
  private image/PDF media grouped by loan application, with image preview,
  forced PDF download, camera capture, and review state. Per-owner presign
  throttling, 5 MiB/12-file caps, owner/application-bound staging keys,
  magic-byte checks, row-locked quota/replay handling, immutable canonical
  copies, no-store signed-link responses, opaque logging, legacy-key
  compatibility, deletion, and dual-namespace orphan cleanup preserve the
  security boundary. Generated contracts, 39 Loans/storage API tests, 23
  RLS/Admin-verification tests, 298 web tests, a seeded browser journey, web
  lint/typecheck, a Linux production build, tracking checks, and the one-head
  migration assertion pass. This bounded slice was subsequently completed by
  the purpose-specific video, visit-feedback, scanner, sanitizer, and retention
  work above; public Loans media, a universal asset library, and new reviewer
  roles remain non-goals.
- **Payment-method completion** (FR-10.3) is implemented in
  [PR #154](https://github.com/brollysolutions/client1/pull/154). UPI VPA and bank
  transfer remain on the provider-scoped RazorpayX path, while cashback,
  referral bonuses, and commissions can use an audited manual-cheque lifecycle.
  Approval, issuance, clearance-only ledger credit, pre-clearance failure, and
  post-clearance compensating reversal are serialized and idempotent. Raw
  destinations and cheque references are not persisted or returned; the
  additive provider/method migration, unchanged Admin-only RLS, generated
  contracts, API/web UI, security review, and database concurrency tests cover
  the completed scope. RuPay/card handling, customer/principal collection, a
  second live provider, and automatic failover remain explicit non-goals.
- **Lead assignment completion** (FR-4.2 and FR-4.3) was established in
  [PR #153](https://github.com/brollysolutions/client1/pull/153) and its automatic
  selection policy is updated in
  [PR #163](https://github.com/brollysolutions/client1/pull/163). Explicit
  Loans/Real Estate registration intent and Agent introductions create
  independent same-line journeys; active Telecallers now receive them through
  separate durable per-line round-robin cursors in stable creation order, with
  a bounded 15-minute retry when capacity is absent. OTP-proven
  registration binds same-mobile Agent leads without putting a lead ID or
  mobile in the shared link. Database uniqueness, fixed-search-path validation,
  row-locked selection, cursor zero-grant/RLS isolation, cross-line database
  validation, account-deletion closure, PII-safe audit/notifications, and
  concurrency coverage protect the workflow. Fresh evidence includes 188
  affected tests, a 25-test focused assignment/classification pass, Ruff across
  423 API files, and a migration round-trip with one Alembic head. The
  monolithic API suite exceeded 30 minutes without a final report and is
  inconclusive rather than passing; no API contract or web change was required.
- **Authenticated banner personalization** (FR-12.1 through FR-12.4 and
  FR-18.1) is implemented in
  [PR #152](https://github.com/brollysolutions/client1/pull/152). A closed
  versioned grammar evaluates consented Client journey,
  Agent activity, and optional coarse-location signals only after server-side
  identity/line validation. Private no-store dashboard placements expose
  display-only banners and Client offers; anonymous responses exclude all
  targeted content. Owner-only RLS, two-decimal latest-location storage,
  30-day purge, immediate revocation/deletion, fail-closed legacy handling,
  deterministic ranking, safe fallbacks, generated contracts, CMS controls,
  and Client/Agent browser journeys are covered by automated evidence.
- **Vehicle arrangements** (FR-7.1, OI-003) are implemented in
  [PR #149](https://github.com/brollysolutions/client1/pull/149). Clients optionally request one
  pickup during site-visit creation; platform Admin arranges transport and
  directly assigns an active real-estate Employee; the assignee completes or
  cancels it; and the owning Client follows a read-only status and safe
  post-assignment driver/vehicle projection. A dedicated row-locked state
  machine, database constraints/trigger, audit, notification, generated
  contracts, role-specific web surfaces, and API/direct-RLS tests preserve
  ownership, assignment, and business-line boundaries.
- **Registration/profile requirement alignment** (FR-3.3, FR-17.2) is
  implemented in [PR #148](https://github.com/brollysolutions/client1/pull/148). Ordinary
  Clients now register with name and an OTP-verified mobile, then may skip or
  save optional email, gender, income, occupation, and location. The same
  fields are editable and clearable in Profile settings, remain owner/Admin RLS
  protected, and are scrubbed during account deletion. Verified-email recovery
  remains explicit and enumeration-safe, while staff/Agent onboarding still
  attaches its mandatory email to a mobile-only identity.
- **Managed property/media submissions** (FR-7.3, FR-13.1 through FR-13.4,
  OI-002) is delivered in [PR #147](https://github.com/brollysolutions/client1/pull/147).
  The approved slice
  adds Client/Lead submission, Admin-only approval, private managed images and
  reviewer PDFs, approved public property images, quotas, content verification,
  owner/business-line RLS, and storage lifecycle cleanup. Videos, general media
  galleries, and feedback attachments remain explicit non-goals for this PR.

## Status by feature area

| Feature area | Complete | Partial | Not started | Coverage notes |
| --- | ---: | ---: | ---: | --- |
| Platform and segregation (FR-1.x) | 5 | 0 | 0 | Every mapped table and managed-media purpose has an explicit classification mode; database checks and provenance triggers enforce concrete operational lines while preserving reviewed global/identity exceptions. |
| Roles and access (FR-2.x) | 8 | 1 | 0 | Six role surfaces, server/RLS guards, Admin-managed field visibility, and provenance-based lead-detail ownership exist; only the exhaustive Admin operational coverage audit remains partial. |
| Authentication (FR-3.x) | 5 | 0 | 0 | OTP/password/session flows, dual-line client identity, support-assisted mobile change, and mobile-first registration with optional verified email recovery exist. |
| Leads (FR-4.x) | 6 | 0 | 0 | Explicit per-line intent, deterministic per-line round-robin assignment/retry, OTP account binding, Admin fallback, ownership, fixed Agent expiry, and Agent/Telecaller workflows are implemented. |
| Agent registration (FR-5.x) | 4 | 0 | 0 | OTP-verified application, KYC, Admin review, Agent ID, and owned-lead contact access exist. |
| Loans (FR-6.x) | 6 | 0 | 0 | Public pages/calculators, applications, configurable products/banks, progression, transactions, and fee cashback exist. |
| Real estate (FR-7.x) | 5 | 0 | 0 | Catalog, managed property submissions/media, inquiries, visits, deals, review, Employee work, and dedicated vehicle arrangements are implemented. |
| Commissions (FR-8.x) | 3 | 0 | 0 | Manual Admin entry, Agent earnings, approval, and provider-scoped RazorpayX or audited cheque payouts exist. |
| Referrals (FR-9.x) | 5 | 0 | 0 | Client codes, attribution, conversion accrual, Admin payout, ledger, and Sub Admin rules exist. |
| Payments (FR-10.x) | 4 | 0 | 0 | Property/principal collection remains prohibited; controlled outbound payouts support UPI VPA, bank transfer, and manual cheque with RazorpayX as the sole automated provider. |
| Notifications (FR-11.x) | 3 | 0 | 0 | In-app, web push, Admin major-action, and verified-email transactional notifications now use audited same-origin workflow destinations. |
| Banners/personalization (FR-12.x) | 4 | 0 | 0 | Approved content lifecycle now feeds authenticated, consented, line-validated Client/Agent placements through a closed fail-closed audience grammar; anonymous responses exclude targeted rows. |
| Media/uploads (FR-13.x) | 4 | 0 | 0 | Purpose-bound property/Loans image, PDF, and MP4 flows plus assigned-Employee visit feedback enforce scanning, sanitization/transcoding, private/public state, quotas, immutable snapshots, RLS, retention, deletion, and orphan cleanup. |
| Support (FR-14.x) | 4 | 0 | 0 | Central tickets, WhatsApp route, Admin triage/resolution, and structured mobile-change fulfilment exist. |
| Contact privacy (FR-15.x) | 4 | 0 | 0 | Agent-owned and Telecaller-assigned mobile access is locked; Employee raw/deny/provider-neutral invitation modes and least-data projection are enforced server-side. |
| Analytics (FR-16.x) | 3 | 0 | 0 | **Complete** in [PR #156](https://github.com/brollysolutions/client1/pull/156): Linux PostgreSQL/Redis verification passed 30 reporting service/API/RLS tests with one Alembic head; web lint, strict typecheck, 294 unit tests, and the 92-page production build passed. |
| Profile/account (FR-17.x) | 4 | 0 | 0 | Profile/settings, optional demographic/income/location details, transactions/support, deletion, retention, and Admin removal exist. |
| Location (FR-18.x) | 1 | 0 | 0 | Explicit nested opt-in stores only the latest two-decimal point for 30 days and erases it on revocation, personalization disable, or account deletion; CS-010 removes FR-18.2 Map/GMB integration from scope. |
| **Total** | **78** | **1** | **0** | **79 active requirements** |

## Done

The following requirements are complete on the evidence baseline:

- Platform and access: FR-1.1 through FR-1.5; FR-2.1; FR-2.3 through
  FR-2.9. Evidence includes `app/core/deps.py`, profile models, RLS
  migrations, role dashboards, Admin field-visibility APIs/UI, server-side
  response projection, policy audit, and cross-role/cross-line tests.
- Authentication: FR-3.1 through FR-3.5 as amended by CS-001 and CS-005.
  Evidence includes mobile-first OTP/password/session flows, skippable optional
  email capture, verified-email-only recovery, dual profiles, replacement-number
  OTP intake, platform-Admin maker/checker review, session-generation revocation,
  linked-contact updates, collision rollback, and API/RLS/concurrency tests.
- Lead operations: FR-4.1 through FR-4.6. Evidence includes independent
  per-line journeys, explicit registration intent, deterministic round-robin
  same-line automatic assignment, bounded retry, OTP-proven Agent-lead binding,
  Admin assignment/release fallback, Telecaller follow-up, fixed
  first-attribution deadlines, audit/notifications, Agent history/countdown UI,
  and API/RLS/concurrency tests. Agent expiry was delivered in
  [PR #144](https://github.com/brollysolutions/client1/pull/144); assignment
  completion is in [PR #153](https://github.com/brollysolutions/client1/pull/153).
- Agent lifecycle: FR-5.1 through FR-5.4. Evidence includes public agent
  application intake, restricted uploads, Admin approval/rejection, Agent
  codes, Agent dashboards, and owned-lead visibility tests.
- Loans: FR-6.1 through FR-6.6. Evidence includes public loan/calculator
  routes, application progression, configurable loan types/banks, Telecaller
  transaction entry, documents, and processing-fee cashback.
- Real-estate core: FR-7.1 through FR-7.5. Evidence includes dedicated
  site-visit vehicle arrangements with Client request/read, Admin fulfilment,
  direct Employee assignment, audit/notifications, and owner/assignee RLS;
  managed Client/Agent/Sub Admin property submission, Admin-only review,
  private/public
  media lifecycle, property deals, site visits, employee tasks/documents,
  client progress surfaces, and the absence of any property-payment collection
  path.
- Money programs: FR-8.1 through FR-8.3; FR-9.1 through FR-9.5; FR-10.1,
  FR-10.2, and FR-10.4. Evidence includes manual commission agreements,
  client-only referral attribution, controlled payout creation/approval,
  idempotent settlement, ledger linking, and audit/reconciliation tests.
- Notifications: FR-11.1 through FR-11.3. Evidence includes in-app feeds,
  browser push subscriptions/delivery, Admin major-action notifications and
  broadcasts, same-origin validation at the API, email, web-rendering, and
  service-worker boundaries, plus transactional email copies only to verified
  active addresses when explicitly enabled.
- Support and communication: FR-14.1 through FR-14.4 and FR-15.1 through
  FR-15.4. Evidence includes central support tickets, structured mobile-change
  fulfilment, Admin triage, existing browser WhatsApp links, locked
  Agent/Telecaller mobile rules, Admin-controlled least-data projection, and
  expiring/revocable provider-neutral Employee invitations. No WhatsApp API
  integration is present or planned by this slice.
- Account lifecycle: FR-17.1 through FR-17.4. Evidence includes role-aware
  settings/navigation; optional, editable, and clearable gender/income/
  occupation/location details; transaction and support surfaces;
  password-confirmed self-deletion; Admin deletion; immediate profile-PII scrub;
  de-linking; and seven-year retention purge behavior.
- Media controls: FR-13.1 through FR-13.4. Evidence includes separate managed
  Real Estate and workflow-bound Loans image/PDF/MP4 galleries; assigned-
  Employee property-visit feedback attachments; private preview/download and
  approved property publication; camera capture; bounded signed uploads;
  fail-closed ClamAV scanning; Pillow/FFmpeg sanitization and transcoding;
  immutable canonical copies; owner/application/assignment binding; database
  ready-video constraints; RLS, replay, concurrency, rate-limit, retention,
  deletion/account cleanup, and orphan-cleanup tests.
- Personalization: FR-12.1 through FR-12.4 and FR-18.1. Evidence includes the
  versioned audience schema, server-side Client/Agent line proof, consented
  workflow/location matching, private display-only placements, public
  non-leakage, deterministic ranking, owner-only preference RLS, immediate
  revocation/deletion, scheduled retention, API/contract/web tests, and seeded
  Client/Agent Playwright journeys.

## Remaining

| Requirement | Status | Implemented slice | Remaining work |
| --- | --- | --- | --- |
| FR-1.1 | Complete | Every mapped table and managed-media purpose is inventoried; operational rows require one immutable Loans/Real Estate tag, parent/source copies must match, and only reviewed staged/global/identity exceptions remain nullable or allow `both`. | Preserve the exhaustive ledger and migration/negative tests for every future table, relation, content audience, and media purpose. |
| FR-2.2 | Partial | Admin dashboards cover users, leads, tasks, agents, loans, deals, payouts, content, audit, reports, and a new paginated Operational records workspace. The test-enforced contract classifies all 47 mapped tables and all 68 current platform-scope policies. All eight view gaps are closed with minimized generated contracts, soft-deleted contact redaction, per-line Client profile context, `private, no-store`, accessible UI, and fresh platform-Admin/negative-role PostgreSQL evidence. | Remediate the eight remaining tables: one typed approved-listing correction gap (`properties`) and seven append-only audit gaps (`banners`, `content_blocks`, `loan_applications`, `offers`, `property_deals`, `referral_bonus_config`, `tasks`). Preserve protected secrets/location/media, immutable ledgers, command-bound updates, RLS, and safe audit details. |
| FR-2.8 | Complete | Lead name and journey notes carry immutable creator descriptors; Agent and Client edits follow explicit lifecycle cutoffs, Admin corrections preserve ownership and require an audited reason, and Telecaller notes remain append-only activities. Service checks, row locks, command-specific RLS, and a database trigger deny cross-owner, cross-role, cross-line, lifecycle, allowed-column, and descriptor-planting bypasses. | Preserve the ownership initializer/backfill, least-data no-store response, audit-value minimization, and direct SQL denial tests when adding future editable lead-detail paths. |
| FR-4.2 | Complete | Agent-introduced leads are atomically attributed and assigned through a durable, active-only same-line round-robin cursor, queued for bounded retry without capacity, and bound to a same-mobile Client only after OTP-proven registration. | Preserve global Agent ownership, expiry deadlines, generic-link authority boundaries, stable Telecaller order, cursor isolation, and concurrency tests as the workflow evolves. |
| FR-4.3 | Complete | Registration captures explicit one/both-line intent while retaining both Client profiles; each requested journey is independently bound and assigned through its line's separate round-robin cursor without cross-line leakage. | Preserve explicit intent, per-line uniqueness, deterministic assignment ordering, and account-deletion closure. |
| FR-10.3 | Complete | Cashback, referral bonuses, and commissions support UPI VPA and bank transfer through an explicit RazorpayX provider adapter plus an audited manual-cheque lifecycle. Cheque approval does not credit the ledger; issue, clearance, failure, duplicate/concurrent settlement, and compensating reversal are server-controlled, masked, and covered by migrated database tests. | Preserve provider scoping, Admin authorization, caps, raw-destination minimization, row-lock/CAS idempotency, account-deletion retention, and the no-card/no-failover boundary when adding future providers. |
| FR-11.2 | Complete | Every notification producer, Admin broadcast, web push, public banner CTA, and transactional email action uses a same-origin relevant route; verified active email addresses can receive best-effort transactional copies when enabled. | Maintain the producer inventory as future events are added; no marketing or unverified-email delivery is implied. |
| FR-12.1 | Complete | Authenticated Client/Agent dashboards receive one eligible banner per default, personalized, and action layer through a closed, versioned, fail-closed audience grammar. | Maintain schema/version and negative-rule tests when new dimensions are proposed. |
| FR-12.2 | Complete | The server proves Client line ownership, forces Agents to their active profile line, ranks exact-line/`both` content deterministically, and keeps Agents off customer offers. | Preserve server-side line proof and role separation for future placements. |
| FR-12.3 | Complete | Sub Admin authoring and Admin banner approval validate the closed grammar; only eligible consented users receive personalized rows, with public and cross-role negatives. | Keep approval and anonymous allowlist tests alongside future CMS changes. |
| FR-12.4 | Complete | Existing workflow facts and optional coarse location drive auditable, consented banner/offer placement without clickstream or inferred demographics. | Treat any new signal source as a separately approved privacy/security change. |
| FR-13.1 | Complete | Real Estate has private review/approved public image and MP4 galleries; Loans has a private per-application image/PDF/MP4 gallery with processing and review state. | Preserve purpose-specific publication and keep Loans media private when future gallery work is proposed. |
| FR-13.2 | Complete | Agent KYC, loan/task documents, banners, property submissions, and assigned-Employee property-visit feedback have managed upload flows with applicable browser capture. | Require a separately approved purpose, audience, and retention policy for any new attachment surface. |
| FR-13.3 | Complete | Managed property, Loans, and feedback media enforce size/type/signature limits, fail-closed malware scanning, image metadata normalization, and bounded H.264/AAC transcoding before access/publication. | Preserve fail-closed production scanning and re-review codec/limit policy before accepting new formats. |
| FR-13.4 | Complete | All completed media purposes enforce quotas/rates, canonical snapshots, processing recovery, 7/90-day retention where applicable, account deletion, and scheduled orphan/lifecycle cleanup. | Add lifecycle, deletion, and orphan evidence alongside every future media purpose. |
| FR-16.1 | Complete | [PR #150](https://github.com/brollysolutions/client1/pull/150) adds formula-safe Excel export alongside the existing CSV export, with the same capped result set and truncation signal. Linux PostgreSQL/Redis verification passed the reporting service/API/RLS suite; the web production build completed. | Maintain bounded exports, formula-safe cell writing, and current verification coverage. |
| FR-16.2 | Complete | Reports filter by business line and a selected multi-Agent list; the list is the ad hoc group filter, with no persistent group/team model added. PostgreSQL-backed service/API/RLS tests passed. | Preserve the server-side platform-Admin guard and the business-line predicates when filters evolve. |
| FR-16.3 | Complete | The Agents report returns and renders Loans/Real Estate business-line team performance summaries, retaining per-Agent sorting and selective views. PostgreSQL-backed aggregate tests passed. | Preserve line-scoped team totals and anti-fan-out aggregate coverage. |
| FR-18.1 | Complete | An explicit nested opt-in stores only the latest server-rounded two-decimal point, omits stale/unavailable matches, purges after 30 days, and erases on revoke/disable/deletion without logging coordinates. | Maintain the retention job and location-free audit contract. |

## Evidence map

Use these areas when re-validating a status change:

- Auth and profiles: `apps/api/app/api/v1/auth.py`,
  `apps/api/app/services/auth_service.py`, profile/user models, auth tests.
- Authorization and segregation: `apps/api/app/core/deps.py`,
  `apps/api/app/db/session.py`, Alembic RLS migrations, `test_*_rls.py`.
- Operational modules: API routes/services/models plus their matching web
  feature, generated contract, and API/web tests.
- Money and retention: payout/referral/commission/cashback/account-deletion
  services, scheduler jobs, migrations, audit tests, and `SECURITY.md`.
- Public/CMS: public catalog service, banner/offer/content/property APIs,
  CMS scheduler jobs, and public rendering tests.

## Mandatory maintenance

Every product-code change under `apps/`, `packages/contracts/`, `infra/`,
`scripts/`, or a root Docker Compose file must update both this file and
[`implementation-plan.md`](implementation-plan.md) in the same commit or PR.

At feature start:

1. Re-check the affected requirement against current code/tests and mark the
   plan item **In progress**.
2. Record the feature branch/PR placeholder, assumptions, and intended
   verification.
3. Tell the user the recommended Codex model and reasoning effort before the
   first implementation edit.

Before shipping:

1. Change only statuses supported by fresh code/test evidence.
2. Recalculate the totals and weighted coverage when a status changes.
3. Link the implemented evidence and PR, move the plan item to **Done** or
   return it to **Planned**, and select the next priority.
4. Never mark a requirement Complete from scaffolding, filenames, or a passing
   unrelated test.
