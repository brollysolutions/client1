# Property-specific listing forms and catalogue freshness

Status: **Implemented and verified in
[PR #212](https://github.com/brollysolutions/client1/pull/212)**

As of: **2026-08-21**

Authority: **Authoritative for property-specific listing intake, RERA optionality,
public narrative validation, and Financial Product/lender freshness display.**

## 1. Supplied direction

The product owner requested different property forms for the existing listing
subtypes:

- Standalone apartments, gated community apartments, and villas: project
  towers/units, project area in acres, BHK configurations, plot/unit area,
  price per square foot, an amenities narrative of at least 150 words, About
  Project, RERA/local-body approvals,
  a RERA checking process, construction status, furnishing, plot facing, UDS,
  expected handover date, and facing.
- Individual properties: land area, built-up area, floors, residential or
  residential-plus-commercial use, rental income, ongoing-loan status, facing,
  property value, About, location, and PIN code.
- Locked and unlocked commercial properties: total/unit area, price,
  construction status, furnishing, facing, amenities, About, other information,
  RERA/local-body approvals including HMDA/GHMC/DTCP, income commencement,
  location, name, and PIN code.
- Plots: project approvals, total project area, plot size/count, facing, price
  per square yard, project status, amenities, location, PIN code, other
  information, and About.
- Agricultural land: land area in acres/guntas, title details, facilities,
  ongoing-loan status, land type, other information, price, survey number,
  Rythu Bandhu status, location, and registration-office details.

The product owner also required numbers and links to be excluded from About
content, asked for professional field names and ordering, requested a Paisabazaar/
BankBazaar-inspired “last updated” treatment for every Financial Product and
lender detail, and subsequently clarified:

> RERA number is optional field

## 2. Approved interpretation

### 2.1 Form taxonomy and ordering

- Existing subtype identities and URLs remain compatible. Standalone Apartment,
  Gated Community Apartment, and Villa share a Project Residence schema;
  Individual House, Commercial, Plot, and Agricultural Land use distinct
  schemas.
- Every form is ordered as listing identity, structured location, measurements,
  price/income, status, approvals, public narrative, then managed media and
  private reviewer documents.
- `resale` is a Sale Type, not a Construction Stage. Construction Stage remains
  Under Construction or Ready to Move/Occupy.
- UDS is labelled **Undivided Share of Land (UDS), sq ft**, is optional where it
  is not applicable, and follows the unit/plot area before pricing.
- Commercial “locked/unlocked” enum keys remain stable, with professional labels
  **Leased / Income-generating Commercial Property** and
  **Vacant / Available Commercial Property**.
- Agricultural registration data uses **Registration District** and
  **Jurisdictional Sub-Registrar Office**. The authority acronym is **DTCP**, not
  DTCT.

### 2.2 RERA intake and review

- RERA Registration Number is optional at intake.
- A required applicant assertion distinguishes Applicable, Exemption Claimed,
  and Unsure. Applicant input never creates a verified badge.
- Platform Admin alone records Not Reviewed, Verified, Mismatch, or Exemption
  Verified, together with server-controlled reviewer and timestamp metadata.
- A new or re-reviewed applicable project cannot be approved until its RERA
  number is present and verified. A claimed exemption must be reviewed before
  approval. Existing active listings remain readable but are not automatically
  labelled verified merely because a legacy number is present.
- Verification evidence and reviewer documents stay private. Public catalogue
  projection exposes only the reviewed status and any disclosure-safe number.

### 2.3 Public narrative safety

- About Project/About Property and other public free-text narratives are plain
  text. HTML and Markdown are never interpreted.
- Server validation rejects digits, URLs/domain-like links, email addresses,
  phone-number-like content, control characters, and content outside the
  configured word bounds. Browser validation mirrors this for usability but is
  not an authorization or security boundary.
- Structured fields carry legitimate numeric facts such as BHK, prices, survey
  numbers, approval references, area, and PIN code; public narrative must not be
  used to bypass those fields.
- Amenities remain bounded structured labels. A Project Residence requires a
  150-to-500-word amenities description; optional Commercial and Plot amenities
  descriptions remain capped at 150 words. Project About is capped at 500 words,
  and individual-property About is capped at 250 words.

### 2.4 Data and configuration boundary

- Property forms are code-defined, versioned, subtype-specific schemas in v1.
  Admin authors listing values and controls compliance review; Admin does not
  receive arbitrary JSON, HTML, regex, or executable property-form configuration.
- Common searchable facets remain first-class columns. Subtype-only facts use a
  closed, versioned JSONB shape validated by the API and copied unchanged from
  the reviewed submission to the approved catalogue row.
- Existing arbitrary `details` values remain deployment-compatible but are not
  rendered publicly or accepted from new subtype forms.
- Financial Product and lender names/availability remain entirely Admin-managed.
  No lender names or availability rows are hardcoded or seeded by this change.

### 2.5 Last-updated behavior

- Client and Admin detail contracts expose server-generated freshness timestamps
  for Financial Products and lenders.
- Product/lender availability changes participate in the effective freshness
  timestamp. Admin cannot type or backdate the value, and no-op saves do not
  claim a content update.
- The UI uses a consistent absolute label such as **Last updated: 21 Aug 2026**.
  No external scraping or automatic third-party data synchronization is added.

## 3. Compatibility and non-goals

- Preserve Client authoring denial; owner-scoped Agent/Sub Admin authoring;
  platform-Admin management and sole approval; last-approved-public-version
  behavior; soft withdrawal; managed images/panorama/private PDFs; RLS; audit;
  retention; and cleanup from the property-listing authority decision.
- Preserve existing subtype URLs and historical catalogue rows. Do not collapse
  `farmland` and `agriland` without a separately reviewed data migration.
- Do not add maps/geocoding, automated legal advice, RERA scraping, KYC fields,
  property payments, new upload purposes, new lender terms/rates, or a second
  Admin runtime form builder.

## 4. Verification contract

- Migration upgrade/downgrade/upgrade and exactly one Alembic head.
- Positive and negative schema matrices for every subtype and narrative bypass
  class.
- Owner, cross-owner, role, business-line, Admin review, RERA approval-gate,
  legacy-row, RLS, audit, and public-projection tests.
- Current generated OpenAPI/TypeScript contracts; focused web unit tests for
  conditional fields, ordering, errors, and freshness labels.
- Connected Playwright author/review/public journeys before the full API and web
  gates, followed by security, design, and maintainer review.
