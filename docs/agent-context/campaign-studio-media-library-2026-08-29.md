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

1. Sub Admin creates a draft, selects governed artwork, and saves it.
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

`/dashboard/campaigns` is a single responsive workspace with Banners and Offers
tabs. It prioritizes status, artwork, title, placement/audience, schedule, and
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
pixel viewports. Interaction is disabled inside the authoring preview so a CTA
cannot navigate away while a campaign is being reviewed.

## Existing-media inventory and boundary

The repository contains 140 checked-in raster/vector visuals after this change:

- 47 campaign banner WebPs: 44 existing governed templates plus 3 new generated
  starter assets;
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
