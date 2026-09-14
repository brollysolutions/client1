# Dashboard themes and workflow refinement

Source baseline: `b2b501cb2a223d40c8f357ff931a4158889af4e8`.
Task branch: `feat/production-environment-evidence`.
Implementation date: 14 September 2026. Draft review retains the verification gaps below.

Review: <!-- DASHBOARD_REFINEMENT_PRS -->.

The approved scope covers six dashboard roles, Loans and Real Estate, public
pages and authentication. Existing navy branding remains; Light, Dark and
System appearance now use shared semantic surfaces, text and focus colours.

| Request | Implemented behavior |
| --- | --- |
| 1, 8 | Sidebar logo images stay mounted and crossfade during expansion. Logo alignment, divider borders and 44px toggle targets are shared across roles. |
| 2 | Sidebar scrolling uses a thin translucent thumb, with system controls restored in forced colours. |
| 3, 4 | Dashboard navigation uses the surrounding pale blue surface; capacity metrics use the same card treatment as other metrics. |
| 5 | Ten existing canonical banks receive reviewed logos. Managed verified uploads take priority; unknown identities do not receive guessed artwork. See the asset provenance manifest. |
| 6 | Shared tab strips hide scrollbar chrome while retaining overflow scrolling and Radix keyboard navigation. Table scrollbars remain available. |
| 7, 22 | Admin support tickets, mobile-number reviews and a user's own ticket open in complete workspaces. Auth support provides recovery and published contact links. |
| 9 | Typing `/` in internal campaign destinations opens searchable page/product suggestions with keyboard selection and audience-aware dashboard links. |
| 10 | Decorative icons and resting icon controls have transparent backgrounds; meaningful status badges and original bank artwork retain their treatments. |
| 11, 12 | Explore uses existing service photography and four desktop columns, with one/two columns on smaller screens. Published products beyond the first API page remain available. |
| 13 | Referral sharing uses a consistent code/link/WhatsApp layout and eligibility wording across dashboard and public entry points. |
| 14 | Real Estate home waits on its actual data with an announced skeleton. Landing banner image placeholders follow image load/error completion. |
| 15 | Client contact pages show introducing agents separately from assigned staff immediately after registration claims an agent lead, in both lines. Commission attribution rules are unchanged. |
| 16 | Agent leads have keyboard-accessible detail links and back navigation that preserves the list page, in both lines. |
| 17, 18 | Telecaller and permitted employee contacts use labelled Call and WhatsApp actions. An employee can reopen their own cancelled task with a recorded reason; completed tasks remain locked. |
| 19 | Employee vehicle arrangements use the shared dashboard structure and permitted contact actions. |
| 20 | System is the default. Explicit theme choices persist in browser storage across public, auth and dashboard routes; device theme changes update System mode. |
| 21, 24 | Language and Blog controls are removed from the account menu. |
| 23 | Dashboard Terms, Privacy and Cookies routes retain the dashboard shell and share content with public legal pages. |
| 25 | Public and dashboard Get Started/Help Center pages provide searchable guides and role-aware next steps. Private/auth routes declare noindex. |

## Security and compatibility

- The contacts endpoint derives ownership from the authenticated user and an
  active profile in the requested line. It returns names, role labels and
  public staff/agent codes, with `private, no-store`; never phone numbers,
  email addresses or profile UUIDs. Existing single-claim dual-line behavior
  uses the established independently scoped session and explicit ownership
  joins. Inactive staff and expired agent attribution are hidden.
- Reopening uses the existing employee guard, own-assignment row lock and RLS
  context. The status transition and audit record commit together. Notes,
  document review state and due dates remain attached. Contact visibility
  still follows the server's field policy.
- Additive migration `a4c6e8f0b2d4` adds the audit enum value. Its downgrade
  preserves historical audit values. No grants, RLS policies or money-flow
  rights change. The OpenAPI document and generated TypeScript client include
  the new endpoints and schema.
- Provider fallback requires exact canonical identity and provider type.
  Original artwork is local; verified upload validation remains in place.
- Theme storage contains only an appearance preference. No dependency,
  telemetry, guest-ticket API, deployment or merge is part of this change.

## Verification

Evidence is retained locally under `build/dashboard-refinement/`; synthetic
accounts and isolated services were used. Private artifacts are not committed.

| Check | Observed result |
| --- | --- |
| Web ESLint and TypeScript | Pass. |
| Web Vitest | 705 tests pass, exit 0 (`web-tests-delivery.json`). |
| Next.js production build | Pass, exit 0; env-free source snapshot, existing dependencies and local synthetic API. |
| Playwright refinement, sidebar and dark-page suites | 41 pass, two fail, exit 1. Failures are image-readiness timeouts for the sidebar symbol in Explore and Client home; both cases passed separately after preview restart/cache warmup before the final eager-logo attribute change. Six roles; both lines; 320–1440px; theme persistence, announcement/CTA contrast, keyboard/back navigation, support focus, task actions/contact policy, tab chrome, destination suggestions, real-estate loading, image readiness and four-column products. |
| API Ruff / format | Pass; 513 files already formatted. |
| Alembic | Exactly one head: `a4c6e8f0b2d4`. |
| Repository unittest discovery | 199 tests, one existing skip, exit 0. |
| Full isolated API pytest | Printed 2,035 passes and one setup error in `test_each_open_status_expires[assigned]`: Redis unreachable under CI. Container remained stuck after the summary; normal process exit is unverified. |
| Final targeted API rerun | Unavailable: new isolated PostgreSQL container could not start within 90 seconds. Final audit-failure rollback and verified-document-preservation additions are not locally executed. |
| Contract generation | OpenAPI and TypeScript outputs regenerated for the added endpoint/schema/audit enum and included in the diff. |
| SEO | 47 URLs; 52 inherited findings and 50 warnings. New Get Started and Help Center pass; existing issues include missing OG images, metadata lengths and root canonical/sitemap normalization. |

The monolithic `./scripts/verify.sh --ci` does not have a passing result.
Equivalent available checks were run separately in env-free snapshots because
the native Windows API environment has the existing greenlet import failure.
The Linux API and migration gate must run on the final commit before release.

Lighthouse 13.4.1 desktop reports are retained for both new guides:

| Page | Performance / accessibility / best practices / SEO | LCP | TBT | CLS |
| --- | --- | --- | --- | --- |
| Help Center | 95 / 100 / 100 / 100 | 1,434 ms | 20 ms | 0.0084 |
| Get Started | 95 / 100 / 100 / 100 | 1,523 ms | 38 ms | 0.00004 |

Both desktop reports warn that load-time limits may make results incomplete.
Both mobile runs fail during Chrome `Page.enable` with a closed session. These
are lab smoke results, not a complete budget pass or field-vitals evidence.
Native image optimization stalled during earlier browser runs; a restarted
preview and warmed logo response restored complete artwork. The final browser
run waits for visible artwork and retains the two optimizer timeouts as failures. Linux cold-image verification remains pending.
The existing synthetic property-detail record is unavailable, so that page's
full data-state visual review is not claimed.

## Review outcome

Source, security and design review covered ownership and line predicates,
employee row locking, audit atomicity, completed-task restrictions, contact
visibility, original provider artwork, generated types, private noindex,
keyboard/focus behavior, reduced motion and responsive geometry. No remaining
change-owned source defect was identified. The introducing agent is explicitly
separate from staff assignment, and neither view changes commission eligibility.
Visual inspection includes provider tables, the collapsed/expanded rail,
four-column loan/insurance photography, dark guide pages, auth support and
mobile review workspaces. Both logo variants load eagerly for quick reversal.

The PRs remain drafts because the final API and performance evidence is
incomplete. No dependency, deployment, merge, RLS-grant or gate change is made.
