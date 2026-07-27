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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.property import Property

PUBLIC_CATALOG_PER_CATEGORY = 12


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
