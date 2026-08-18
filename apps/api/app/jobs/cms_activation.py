"""CMS activation job — writes BannerStatus.LIVE/ARCHIVED and OfferStatus.ACTIVE/EXPIRED.

Before this job existed, BannerStatus.LIVE and OfferStatus.EXPIRED were dead enum
values: services/banners.py's approve_banner terminates at APPROVED, and
services/offers.py's _TRANSITIONS map gives EXPIRED no incoming edge (it is
scheduler-owned by design, see that module's comment). This job is that
scheduler.

NULL-timestamp semantics, one rule for both resources: a NULL bound is an OPEN
bound. NULL starts_at means "already started"; NULL ends_at means "never
ends". This is not the only defensible reading, but it is the only one that
does not ship dead: apps/web/features/sub-admin/banner-form.tsx has no
starts_at/ends_at inputs at all, so every UI-authored banner has NULL
timestamps. Reading NULL starts_at as "never activate" would make this job a
no-op on 100% of real banners; Admin approval is the intentional publish act,
and this job just completes it. Symmetrically, NULL ends_at as "auto-archive
immediately" would archive every evergreen banner/offer the moment it went
live, so NULL ends_at means "evergreen, never auto-expire".

Runs on a plain AsyncSessionLocal() session (app superuser, bypasses RLS) via
`import app.db.session as db_session` -- resolved at call time, NOT
`from app.db.session import AsyncSessionLocal` at module level. This is
deliberate: the module-level form is what forces a module onto
conftest._patch_db_null_pool's rebind list (see that fixture's docstring).
Resolving at call time means this job's tests get the NullPool engine for
free, same as prune_expired_refresh_tokens
(app/scheduler/main.py). Do NOT "fix" this to a top-level import; that would
break tests silently no more than it would break production, but it would
add an unneeded conftest edit.

Idempotent by construction: each UPDATE's WHERE clause tests the exact status
the same UPDATE then overwrites, so a second run matches zero rows. No
read-modify-write, so no lost update. max_instances=1 on the scheduler
registration prevents overlapping runs; an overlap would be safe anyway (row
locks serialize the two transactions, and the loser re-evaluates its predicate
against the already-committed row, finding nothing left to do).

All four statements run in ONE transaction (banners then offers, activate
before archive/expire within each): a single logical clock tick, so a banner
and its companion offer that were both due at this tick flip together. Activate-
before-archive also lets a banner or offer whose starts_at AND ends_at are
both already in the past (reachable via the API even though the banner-form UI
never sets these fields) converge in one tick -- approved -> live -> archived
in a single run, rather than sitting live for one extra interval.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

import app.db.session as db_session
from app.models.audit_log import AuditAction
from app.models.banner import Banner, BannerStatus
from app.models.offer import Offer, OfferStatus
from app.services.audit_log import record as record_audit

logger = logging.getLogger("scheduler")


async def _activate_banners(session: AsyncSession) -> int:
    candidates = (
        await session.scalars(
            select(Banner)
            .where(
                Banner.status == BannerStatus.APPROVED,
                or_(Banner.starts_at.is_(None), Banner.starts_at <= func.now()),
            )
            .order_by(Banner.priority.desc(), Banner.created_at.asc(), Banner.id.asc())
            .with_for_update()
        )
    ).all()
    activated = 0
    for banner in candidates:
        if banner.offer_id is not None:
            offer = await session.get(Offer, banner.offer_id)
            if offer is None or offer.status != OfferStatus.ACTIVE or offer.audience_rules != {}:
                continue
        if banner.category_key is not None:
            current = await session.scalar(
                select(Banner)
                .where(
                    Banner.status == BannerStatus.LIVE,
                    Banner.placement == banner.placement,
                    Banner.category_key == banner.category_key,
                )
                .with_for_update()
            )
            if current is not None:
                if banner.replaces_banner_id != current.id:
                    continue
                current.status = BannerStatus.ARCHIVED
                current.updated_at = func.now()
                await record_audit(
                    session,
                    action=AuditAction.BANNER_ARCHIVED,
                    entity_type="banner",
                    entity_uuid=current.id,
                    actor_uuid=None,
                    actor_role="system",
                    business_line=current.business_line,
                    detail={"placement": current.placement.value, "replaced": True},
                )
        banner.status = BannerStatus.LIVE
        banner.updated_at = func.now()
        await record_audit(
            session,
            action=AuditAction.BANNER_ACTIVATED,
            entity_type="banner",
            entity_uuid=banner.id,
            actor_uuid=None,
            actor_role="system",
            business_line=banner.business_line,
            detail={"placement": banner.placement.value},
        )
        activated += 1
    return activated


async def _archive_banners(session: AsyncSession) -> int:
    banners = (
        await session.scalars(
            select(Banner)
            .where(
                Banner.status == BannerStatus.LIVE,
                Banner.ends_at.is_not(None),
                Banner.ends_at <= func.now(),
            )
            .with_for_update()
        )
    ).all()
    for banner in banners:
        banner.status = BannerStatus.ARCHIVED
        banner.updated_at = func.now()
        await record_audit(
            session,
            action=AuditAction.BANNER_ARCHIVED,
            entity_type="banner",
            entity_uuid=banner.id,
            actor_uuid=None,
            actor_role="system",
            business_line=banner.business_line,
            detail={"placement": banner.placement.value, "scheduled": True},
        )
    return len(banners)


async def _activate_offers(session: AsyncSession) -> int:
    result = await session.execute(
        update(Offer)
        .where(
            Offer.status == OfferStatus.SCHEDULED,
            or_(Offer.starts_at.is_(None), Offer.starts_at <= func.now()),
        )
        # Offer has no updated_at column, unlike Banner.
        .values(status=OfferStatus.ACTIVE)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount


async def _expire_offers(session: AsyncSession) -> int:
    result = await session.execute(
        update(Offer)
        .where(
            Offer.status == OfferStatus.ACTIVE,
            Offer.ends_at.is_not(None),
            Offer.ends_at <= func.now(),
        )
        .values(status=OfferStatus.EXPIRED)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount


async def cms_activation() -> dict[str, int]:
    started = time.monotonic()
    logger.info("job.cms_activation.start")
    try:
        async with db_session.AsyncSessionLocal() as session:
            banners_activated = await _activate_banners(session)
            banners_archived = await _archive_banners(session)
            offers_activated = await _activate_offers(session)
            offers_expired = await _expire_offers(session)
            await session.commit()
    except Exception:
        logger.exception("job.cms_activation.failed")
        raise
    else:
        summary = {
            "banners_activated": banners_activated,
            "banners_archived": banners_archived,
            "offers_activated": offers_activated,
            "offers_expired": offers_expired,
        }
        logger.info(
            "job.cms_activation.success banners_activated=%d banners_archived=%d "
            "offers_activated=%d offers_expired=%d duration_ms=%d",
            banners_activated,
            banners_archived,
            offers_activated,
            offers_expired,
            (time.monotonic() - started) * 1000,
        )
        return summary
