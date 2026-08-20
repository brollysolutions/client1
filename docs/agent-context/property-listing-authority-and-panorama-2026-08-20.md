# Property listing authority and 360 panorama decision

Status: **User-supplied product decision with an approved derived implementation shape**

As of: **2026-08-20**

## Supplied direction

The product owner stated:

> Client cant list a property, Agent can list a property and perform CRUD operations to the property, No property video but we support 360view, Property listing can also be done by admin and subadmin

After reviewing the available 360 approaches, the product owner instructed the
agent to start implementation of the recommended first-party uploaded panorama
design.

## Approved interpretation

- Clients cannot create, update, or withdraw property listings.
- Real-estate Agents can create and manage only their own listings.
- Sub Admins and platform Admins can create listings. Platform Admin retains the
  existing approval/rejection and operational authority.
- Owner edits to an approved listing return the authored version to Admin review;
  the last approved catalogue version stays public until replacement approval.
- Owner deletion is a recoverable withdrawal. An approved catalogue row is made
  inactive rather than physically erased.
- Property MP4 upload, processing, review, and public playback are removed.
  Loans video is not changed by this decision.
- A property may instead include one optional uploaded equirectangular panorama:
  JPEG or WebP, approximately 2:1, managed through the existing owner-bound
  private upload, scanning, normalization, Admin review, publication, retention,
  and cleanup lifecycle.
- The application exposes the approved panorama through an on-demand,
  accessible first-party viewer. External tour embeds, 360 video, and multi-room
  tours are not part of this decision.

## Reconciliation

This decision narrowly supersedes:

- SRS v1.2 FR-7.3 and the aligned feature-list wording that permits Leads/Clients
  to upload property details;
- SRS v1.2 FR-13.1 and FR-13.3 only for property video; other approved video
  purposes, including Loans media, remain unchanged;
- `current-implementation-state.md` CS-004 where it permits Client property
  submissions and treats listing editing/resubmission as out of scope;
- the former property-submission API, RLS, web navigation, and MP4 media paths;
  the replacement implementation is delivered in
  [PR #210](https://github.com/brollysolutions/client1/pull/210).

The decision does not weaken business-line segregation, object ownership,
Admin approval, RERA validation, private reviewer-document handling, upload
validation, auditability, retention, or public active-listing policies.
