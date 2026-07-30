"""Public property/banner/offer/content-block read (docs/specs/public-property-catalog.md,
docs/specs/public-banner-serving.md, docs/specs/public-offer-serving.md,
docs/specs/public-content-block-serving.md).

There is no anonymous Postgres role in this system: api_user is only ever
assumed inside _set_rls_context (app/core/deps.py), called exclusively from
get_current_user. A request with no auth dependency runs as the `app`
superuser and RLS never engages, exactly like services.leads.capture_lead and
services.agent_applications. So on THIS path the `active` predicate below IS
the access control, not RLS. Do not remove it and do not "simplify" this into
an unfiltered select — see test_public_properties.py's
test_inactive_hidden_from_anonymous and
test_inactive_row_is_visible_to_a_raw_superuser_session, which exist
specifically to catch that regression.

Takes `db` as a parameter (Depends(get_db) at the router) rather than opening
its own AsyncSessionLocal(): this is a read with no need to outlive the
request, so it does not need conftest._patch_db_null_pool's rebind list.

Capped per category (not a flat LIMIT) via a row_number() window so a
category with fewer listings can never be crowded out by another category's
volume. The cap is structural, not client-adjustable, and doubles as the
endpoint's only DoS backstop (see router docstring for the full posture).
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.banner import Banner, BannerStatus, BannerType
from app.models.content_block import ContentBlock, ContentStatus
from app.models.offer import Offer, OfferStatus
from app.models.property import Property

PUBLIC_CATALOG_PER_CATEGORY = 12

# Flat cap, not a row_number() window like properties: there is no partition
# axis here (business_line is deliberately NOT filtered/exposed on this path,
# see list_public_banners), so PR A's per-category crowd-out problem has no
# analogue. Doubles as a product cap (a hero nobody clicks through past ~8
# slides is already a broken hero) and the endpoint's only DoS backstop.
PUBLIC_BANNERS_LIMIT = 8


async def list_public_properties(db: AsyncSession) -> Sequence[Property]:
    ranked = (
        select(
            Property,
            func.row_number()
            .over(
                partition_by=Property.category,
                order_by=(Property.created_at.asc(), Property.id.asc()),
            )
            .label("rn"),
        )
        # This predicate IS the access control on this route. No RLS runs here.
        .where(Property.active.is_(True))
        .subquery()
    )
    p = aliased(Property, ranked)
    stmt = (
        select(p)
        .where(ranked.c.rn <= PUBLIC_CATALOG_PER_CATEGORY)
        .order_by(ranked.c.created_at.asc(), ranked.c.id.asc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_public_banners(db: AsyncSession) -> Sequence[Banner]:
    """The banner analogue of list_public_properties -- same no-RLS reasoning
    (module docstring above), different predicate shape. Three things this
    WHERE clause does beyond "status == live":

    1. banner_type is a POSITIVE ALLOWLIST (DEFAULT, ACTION), not a
       PERSONALIZED exclusion. audience_rules cannot be evaluated for an
       anonymous visitor with no identity, so serving a personalized banner
       to everyone is exactly the mis-targeting the type exists to prevent.
       Written as an allowlist so a future BannerType value is invisible on
       this path by default, not public by default.
    2. The starts_at/ends_at re-check is DEFENCE IN DEPTH ONLY, not the
       access control -- status == LIVE is. It exists because
       app/jobs/cms_activation.py runs in a separate scheduler container that
       can lag or be down while this API serves fine; without this re-check,
       a banner whose ends_at already passed would keep serving for as long
       as the scheduler stays unhealthy, on a regulated financial site. The
       boundaries here are the EXACT COMPLEMENT of the job's: inclusive start
       both places (starts_at <= now() there and here), but the end is
       exclusive here (> now()) against the job's inclusive <= now(). A
       banner is public here iff the job would not yet have archived it.
       Changing either operator alone silently creates a gap or an overlap --
       change both together or not at all.
    3. business_line is NOT filtered and NOT exposed on PublicBannerRead: the
       homepage hero is cross-line by design (today's fallback spans loans,
       real estate, and a cross-cutting trust message), and ADR-0007 makes
       both lines render identically (blue-only accent) so nothing in the
       hero varies by line anyway. Add a `?business_line=` param, with tests,
       if a per-line hero is ever built -- don't pre-filter for a consumer
       that doesn't exist.
    """
    stmt = (
        select(Banner)
        .where(
            # This predicate IS the access control on this route. No RLS runs here.
            Banner.status == BannerStatus.LIVE,
            Banner.banner_type.in_((BannerType.DEFAULT, BannerType.ACTION)),
            or_(Banner.starts_at.is_(None), Banner.starts_at <= func.now()),
            or_(Banner.ends_at.is_(None), Banner.ends_at > func.now()),
        )
        .order_by(Banner.priority.desc(), Banner.created_at.asc(), Banner.id.asc())
        .limit(PUBLIC_BANNERS_LIMIT)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# Capped PER business_line (not a flat LIMIT) via a row_number() window, same
# shape as PUBLIC_CATALOG_PER_CATEGORY above -- NOT the same shape as
# PUBLIC_BANNERS_LIMIT. The partition axis exists precisely BECAUSE the web
# layer splits offers into a per-line strip (/loans, /real-estate): a flat
# cap ordered newest-first lets one line's publishing volume starve the
# other's out of the response entirely (offers have no priority column to
# force a starved line's offer back in, unlike banners), and since every
# real offer is evergreen in practice (offer-form.tsx has no starts_at/
# ends_at inputs, so nothing but a manual archive ever removes one), active
# rows accumulate monotonically -- this is a ceiling every line crosses
# permanently, not one approached slowly. Ceiling is 3 * 8 = 24 rows.
PUBLIC_OFFERS_PER_LINE = 8


async def list_public_offers(db: AsyncSession) -> Sequence[Offer]:
    """The offer analogue of list_public_banners -- same no-RLS reasoning
    (module docstring above). Differences from the banner query:

    - No banner_type-style allowlist: offers have no audience_rules /
      personalization concept, so status + the window is the entire filter.
    - business_line IS exposed on PublicOfferRead (unlike PublicBannerRead):
      offers are genuinely line-scoped and the frontend renders a separate
      strip per line, reading business_line to decide which one(s) an offer
      belongs in.
    - starts_at/ends_at re-check is defence in depth only, not the access
      control (status == ACTIVE is) -- guards against
      app/jobs/cms_activation.py's scheduler container lagging or being
      down. Same exact-complement boundary convention as banners: inclusive
      start (starts_at <= now()), exclusive end (ends_at > now()). Changing
      either operator alone silently creates a gap or an overlap.
    - Ordered newest-first (created_at DESC) within each line's partition,
      unlike properties/banners' oldest-first order: offers have no priority
      column to guarantee a freshly-published promotion survives the cap
      ahead of older ones in the same line, so newest-first is what keeps a
      just-activated offer visible instead of silently sitting past
      PUBLIC_OFFERS_PER_LINE.
    """
    ranked = (
        select(
            Offer,
            func.row_number()
            .over(
                partition_by=Offer.business_line,
                order_by=(Offer.created_at.desc(), Offer.id.desc()),
            )
            .label("rn"),
        )
        .where(
            # This predicate IS the access control on this route. No RLS runs here.
            Offer.status == OfferStatus.ACTIVE,
            or_(Offer.starts_at.is_(None), Offer.starts_at <= func.now()),
            or_(Offer.ends_at.is_(None), Offer.ends_at > func.now()),
        )
        .subquery()
    )
    o = aliased(Offer, ranked)
    stmt = (
        select(o)
        .where(ranked.c.rn <= PUBLIC_OFFERS_PER_LINE)
        .order_by(ranked.c.created_at.desc(), ranked.c.id.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


# Flat cap, same DoS-backstop role as PUBLIC_BANNERS_LIMIT -- no partition
# axis needed (unlike offers): content blocks are hand-authored, curated Sub
# Admin copy, not user/volume-driven, so this is a defensive ceiling that
# should never actually bind in practice, not a product-shaping cap.
PUBLIC_CONTENT_BLOCKS_LIMIT = 50


async def list_public_content_blocks(db: AsyncSession) -> Sequence[ContentBlock]:
    """The content-block analogue of list_public_banners/list_public_offers --
    same no-RLS reasoning (module docstring above), but simpler than either:

    - No starts_at/ends_at re-check: unlike banners/offers, content_blocks has
      no scheduling columns at all. Its status transitions
      (draft -> published -> archived) are direct, synchronous Sub-Admin
      actions (api/v1/content.py POST /{id}/publish|/archive), not driven by
      app/jobs/cms_activation.py, so there is no scheduler-lag window for a
      defence-in-depth re-check to guard against. status == PUBLISHED is the
      entire filter.
    - No per-line partition: unlike offers, nothing on the frontend renders a
      per-line strip of content blocks (yet) -- callers look a specific block
      up by its unique slug, so a flat cap is enough.
    - Ordered NEWEST-first (created_at DESC), not oldest-first: same
      flat-cap-starvation reasoning as list_public_offers. A block is looked
      up by slug, not position, so ordering has no product meaning here --
      but PUBLIC_CONTENT_BLOCKS_LIMIT still exists as a DoS backstop, and an
      oldest-first order combined with any cap means a freshly published
      block can silently fall outside the response once the table
      accumulates more rows than the cap (verified against this exact
      failure mode in test_public_content_blocks.py, where the shared dev
      Postgres already carries dozens of published rows from unrelated
      tests' fixtures).
    """
    stmt = (
        select(ContentBlock)
        # This predicate IS the access control on this route. No RLS runs here.
        .where(ContentBlock.status == ContentStatus.PUBLISHED)
        .order_by(ContentBlock.created_at.desc(), ContentBlock.id.desc())
        .limit(PUBLIC_CONTENT_BLOCKS_LIMIT)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_public_content_block_by_slug(db: AsyncSession, slug: str) -> ContentBlock | None:
    """Closes feature-status.md §2-1: `slug` is already `unique=True` on this
    table, so a direct lookup exists as cheaply as the list query above did
    all along -- this was simply never wired up. Removes the exact failure
    mode list_public_content_blocks's own docstring documents: a caller that
    needs one specific block by slug (the homepage's `homepage-closing`
    placement) was fetching all 50 newest and filtering client-side, so a
    block could silently fall out of the response once >50 OTHER blocks were
    published more recently, with no error, just a blank section.

    Same access-control posture as the list query: status == PUBLISHED is
    the entire filter, no RLS runs on this path.
    """
    stmt = select(ContentBlock).where(
        ContentBlock.slug == slug, ContentBlock.status == ContentStatus.PUBLISHED
    )
    return await db.scalar(stmt)
