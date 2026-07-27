"""Public property catalog — unauthenticated read (docs/specs/public-property-catalog.md).

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
