# Dashboard interaction and detail repairs

Scope: the 2026-09-14 dashboard repair request. Existing navy/sky branding,
Light/Dark/System behavior, role boundaries and financial controls are retained.

| Request | Change and acceptance |
| --- | --- |
| Campaign approval tabs | Banners and Dashboard offers have distinct active states, adequate height, wrapping labels and keyboard navigation. Only the selected review panel is visible. |
| Individual notifications | Opening a notification marks it read, immediately decreases the badge and removes it from the unread preview. History retains it. Failed individual writes restore only their own row. |
| Referral details | Bonus rule and recent payout rows open read-only detail windows, including eligibility, amounts, line scope, status, dates and reference where available. Existing authoring actions remain separate. |
| Media Library | A wider, responsive image/details window has contained scrolling, uncropped artwork, file metadata and references. Failed reference requests have a retry action. |
| Loan journey | The complete application row responds to pointer, Enter and Space; existing native links remain usable. |
| Property cards | Content determines card height; price and actions are never squeezed into a fixed-height overflow container. |
| WhatsApp | The share action uses `#25D366` with dark text for contrast. |
| Property window | Cards offer a property overview dialog with gallery, price, location, key facts, specifications, amenities and a full-listing link. Submission dialogs also show structured specifications. |
| Sidebar | Brand and panel toggle share a row in expanded and collapsed states; the existing small app icon is served directly. |
| Telecaller property selection | Search matches name and location across the existing authenticated catalogue. At most 50 options render; a count prompts more specific searches. Load failures offer retry. |
| Uploads | CSP now permits multipart fetches to the exact configured asset/storage origin; development also permits the existing localhost MinIO endpoint. File, owner, purpose and confirmation checks are unchanged. |
| Screenshot cleanup | Temporary browser screenshots are removed after inspection. Application artwork and property/campaign images are retained. |

## Sample property

`fixtures/dashboard-property.json` supplies all project-residence fields for
**Sample · Cedar Courtyard**. It is synthetic, labelled as an example and
validated with the API's `PropertyStructuredDetails` adapter. Browser fixtures
combine it with a three-bedroom, 1,450 sq ft overview priced at ₹1.16 Cr. This
fixture is never seeded into customer data or presented as an actual listing.

## Verification

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: 706 tests across 108 files passed.
- `pnpm build`: passed using an env-free tracked-source snapshot, existing local
  font responses and the existing synthetic preview API. All production source
  files match the final snapshot. Windows tracing/public-data warnings remain.
- `pnpm exec playwright test e2e/dashboard-repairs.spec.ts --workers=1`: all 11
  Chromium journeys passed against the production preview. The suite covers
  320/768/1440px layouts, property details in both themes, focus restoration,
  individual-read rollback, loan-row activation, actual logo loading, a
  1,200-property picker and browser upload policy.
- The complete example's structured details pass the API's Pydantic adapter.
- Design/Apple and source/security review found no remaining change-owned
  defects. No API/contract/migration change required server regeneration.

Earlier runs reproduced the media grid overflow, then confirmed its repair.
The notification test now waits for DOM readiness before asserting application
state. A recurring local optimized-symbol request stall led to serving the
existing small app icon directly in the collapsed sidebar; both logo states
are checked for actual image loading. Temporary screenshots were removed after
inspection. The synthetic property fixture remains reproducible, and a local
static HTML preview was retained separately from the screenshots.

Other browser engines, full repository/API suites and fresh Lighthouse/field
performance measurements were not run for this frontend change. Public page
metadata, routes and content were not changed; private indexing controls remain.

Real storage upload remains unverified: the local Docker/WSL service did not
respond during MinIO startup or inspection. The user explicitly requested
keeping other containers running and completing the code changes. No Docker
restart, production deployment, PR merge or security-gate bypass is included.
The browser policy test uses an intercepted synthetic multipart upload and is
not evidence of a real storage confirmation or malware scan.
