# Campaign Studio, approval desk, and Media Library

Status: **Approved product direction and derived implementation record**

As of: **2026-08-29**

Source: the user's 2026-08-28/29 instruction that Sub Admin owns banners and
offers, Admin only reviews/removes/requests changes, Media Library belongs to
Sub Admin, clutter should be removed, and both roles need realistic previews.

## Outcome

Campaign work uses a maker/checker model. The Sub Admin team creates and
maintains campaign content and reusable artwork. Platform Admin sees the final
rendering, approves or requests changes, and may remove any campaign from
serving with a required reason. Admin does not author campaign fields or manage
the Media Library.

The delivery deliberately consolidates banners and authenticated coupon offers
without mixing unrelated media domains. Provider logos remain in Financial
Providers. Property submissions, KYC, loan documents, task evidence, and other
customer or operational uploads keep their private purpose-specific storage and
authorization.

## Ownership and permissions

| Capability | Sub Admin | Platform Admin | Other roles |
| --- | --- | --- | --- |
| Browse Campaign Studio | Yes, all team campaigns | No; uses approval desk | No |
| Create/edit draft or changes-requested banner/offer | Yes, team-shared | No | No |
| Submit for approval | Yes | No | No |
| Approve | No | Yes | No |
| Request changes with a note | No | Yes | No |
| Schedule/activate/archive approved campaigns | Yes | No | No |
| Permanently delete never-submitted draft | Yes | No | No |
| Remove reviewed/serving campaign with reason | No | Yes, audited soft removal | No |
| Browse/upload/edit/archive campaign media | Yes | No | No |
| Permanently delete media | Only when unused | No | No |
| Preview production appearance | Yes | Yes | No staff console access |

Creator identity is immutable provenance, not an ownership silo. Any authorized
Sub Admin may continue team work on an editable campaign. Optimistic version
checks prevent a stale browser from silently overwriting another team member's
change.

## Campaign lifecycle

1. Sub Admin creates a draft, chooses artwork for the chosen surface --
   governed category artwork or a Media Library asset, including one
   uploaded during authoring -- and saves it.
2. Sub Admin submits the draft. Submitted content is no longer editable.
3. Admin previews the exact shared production renderer at desktop, tablet, and
   mobile widths.
4. Admin either approves or requests specific changes. A change request returns
   the item to an editable state and notifies its creator.
5. Sub Admin schedules, activates, or archives approved content under the
   existing lifecycle rules.
6. Admin may remove any non-removed campaign with a mandatory reason. Removal is
   soft, audited, notified, excluded from every list/serving/job count, and is
   not a way to erase reviewed history.

Only never-submitted drafts may be hard-deleted by Sub Admin. Reviewed campaigns
remain evidence even when removed or archived. A Sub Admin creates a replacement
rather than rewriting historical approved content.

## Interfaces

### Sub Admin Campaign Studio

`/dashboard/banners` and `/dashboard/offers` are two responsive workspaces, one
per campaign kind; `/dashboard/campaigns` redirects into them so notification
links written before the split keep resolving. Each page reaches the Media
Library both as a destination and as an in-form picker. It prioritizes status, artwork, title, placement/audience, schedule, and
the next available action. Detailed editing opens in the shared workspace
dialog; summary metric cards and duplicated page furniture are omitted.

### Admin approval desk

`/dashboard/campaign-approvals` lists the complete active oversight set rather
than only pending rows, because Admin must also be able to remove a campaign
after approval or activation. Campaign fields are read-only. Pending rows expose
Approve and Request changes; every visible row exposes Remove with an accessible
inline required-reason field.

### Sub Admin Media Library

`/dashboard/media-library` provides search, business-line and usage filters, an
artwork grid, upload metadata, a selected-asset detail view, and where-used
evidence. Each asset records:

- title and meaningful alternative text;
- normalized tags;
- business line and intended use;
- image dimensions, format, byte size, and source provenance;
- active/archive state and timestamps;
- references from banner templates, banners, and offers.

Accepted uploads are JPEG, PNG, or WebP up to 4 MiB. The server reads and
canonicalizes the bytes, rejects non-images and unsuitable landscape
dimensions, strips untrusted metadata through re-encoding, deletes staging
objects, and stores a canonical public campaign object. SVG is intentionally
not accepted. Archived assets cannot be newly selected. Permanent deletion is
available only when the live where-used check is empty; database foreign keys
provide the final race-condition backstop.

Admin may receive the resolved public image URL inside a banner/offer/template
preview response, but cannot query or mutate Media Library catalogue records.
The API dependency and PostgreSQL RLS independently enforce that boundary.

## Preview parity

Preview is not a stylized approximation. Campaign Studio and the approval desk
reuse the same components that render production placements:

- homepage hero uses `HeroCarousel` with the real full-screen hero variant;
- section banners use the production carousel section variant;
- sponsor artwork uses `AdStrip`;
- authenticated banner and coupon-offer previews reuse the dashboard placement
  cards.

The preview shell supplies realistic page chrome and fixed 1440, 768, and 390
pixel viewports. Those widths are real layout widths, not a `max-width` clamp:
the preview renders at the device width and is scaled to fit its panel, so
media queries resolve against the viewport being previewed rather than the
authoring column. Page chrome is a static stand-in built from the same
`NAV_ITEMS` and design tokens as the live header, because the live header opens
Radix portals that would escape the scaled container.

Interaction is disabled inside the authoring preview so a CTA cannot navigate
away while a campaign is being reviewed, and the scaled subtree is `inert` so
its controls and landmarks stay out of the authoring page's tab order and
accessibility tree.

## Artwork sources and surface geometry

A campaign draws artwork from exactly one source. Supplying both is rejected;
supplying neither is rejected.

- **Governed category artwork.** The 44 versioned public templates, one active
  version per placement/category. Choosing one also decides which approved
  listings the campaign may promote, so property campaigns still require it.
- **Media Library artwork.** Any active asset whose usage type matches the
  placement, including one uploaded from the author's device during authoring.
  It belongs to that campaign alone and does not become the category's artwork.

This replaces the earlier rule that public placements could only ever use a
governed template. The integrity properties that rule protected are unaffected:
media assets are identity-immutable, the resolved reference is copied onto the
campaign at save time, and Admin approval still gates going live. What it gives
up is brand uniformity by category, which is now a review judgement rather than
a database constraint.

`campaign_media_assets.usage_type` names one rendered surface each, so the
library can group by destination and validation can reject artwork shaped for a
different one:

| Usage type | Surface | Target |
| --- | --- | --- |
| `homepage_banner` | Home page hero carousel | 1440 x 800 (9:5) |
| `sponsor` | Home page sponsor strip | 960 x 540 (16:9) |
| `section_banner` | Financial Services and Properties carousels | 1440 x 576 (5:2) |
| `dashboard_banner` | Signed-in dashboard card | 1440 x 800 (9:5) |
| `dashboard_offer` | Signed-in coupon card | 1120 x 490 (16:7) |
| `campaign` | Any surface whose shape it fits | 1.45-2.75 band |

Upload validates the aspect ratio against the target within +/-0.08 rather than
against one band wide enough for every surface, which previously let 5:2 artwork
pass as homepage material and then render wrong. `public_banner` is retained as
a readable legacy value; nothing writes it.

Bundled artwork is referenced by public path rather than an object-store key.
Every banner and offer `image_key` therefore resolves through
`campaign_media.asset_image_url`, not `storage.public_asset_url` -- the latter
returns nothing for a bundled path, which rendered such campaigns imageless and
blocked offer submission.

## Existing-media inventory and boundary

The repository contains 154 checked-in raster/vector visuals:

- 61 campaign banner WebPs: 44 governed templates, 3 generated starters, and 14
  seeded dashboard/offer assets;
- 91 public illustrations: 82 interface/product/property SVGs and 9 property
  fallback PNGs;
- 2 notification icon PNGs.

The migration registers the 44 existing campaign templates and 3 new starters
in Media Library without changing their URLs, so current approved campaigns do
not break. Existing uploaded banner and offer image references are registered
as imported assets and linked back to their campaigns.

The 91 illustrations and 2 notification icons stay code-owned assets: they are
part of page identity, menus, calculators, product illustrations, or listing
fallback behavior rather than editable campaign collateral. Provider logos
stay in the separate Admin-governed provider-logo catalogue. Private/customer
media never enters this public campaign library.

The three generated WebP starters are wide, text-free and intentionally leave
safe negative space for rendered campaign copy:

- an Indian couple reviewing a home-loan journey;
- a verified modern residence at warm golden hour;
- a rewards/savings still life with gift, coins, card, and phone.

All are 1774 x 887 and optimized for repository delivery.

Dashboard banners and dashboard offers previously had no artwork at all, so both
pickers opened almost empty. `scripts/build_dashboard_artwork.py` seeds them by
cropping and downscaling the campaign WebPs already licensed here -- six
dashboard-banner images at 1296 x 720 and eight offer images at 1120 x 490,
registered as bundled assets by migration `b7c9d1e3f5a8`. Generation is
deterministic and crop-then-downscale only, never upscaling, so
`banner-template-assets.test.ts` can pin the files by geometry and hash.

## Security and audit invariants

- Role decisions come from authenticated server context, never request payloads.
- Admin review and removal require server-verified platform scope. Sub Admin
  access uses the server-derived staff role and remains the established
  cross-line content-team scope.
- Media RLS grants catalogue access only to Sub Admin and tests direct database
  denial for Admin and Client sessions.
- Business-line compatibility is checked before artwork can be attached; a
  campaign spanning both lines requires a `both` asset.
- Upload object keys are allowlisted to the random campaign staging namespace;
  public keys are generated by the service.
- Campaign and media identity/provenance columns are trigger-protected.
- Approval, change request, removal, media creation/update/archive/delete, and
  draft deletion leave audit evidence.
- Removed rows fail closed from public and personalized serving, activation
  jobs, dashboard counts, and staff lists.
- Provider, property, KYC, loan, and task media boundaries are unchanged.

## Acceptance evidence

The shipping gate includes API formatting/lint, full relevant pytest coverage,
direct RLS denial tests, migration downgrade/upgrade and one-head checks,
regenerated OpenAPI and TypeScript contracts, web lint/typecheck/unit/build,
focused role-navigation browser coverage, visual/accessibility review, security
review, and final diff review. Exact fresh results and the PR link are recorded
in the living plan and feature-status ledger under
[PR #259](https://github.com/brollysolutions/client1/pull/259).
