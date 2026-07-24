"""Banner submit/approve/reject.

submit_banner runs on the request session under RLS (own-row, draft/rejected only
— see the banners_update policy). approve_banner/reject_banner run on a bypass
superuser session, the same mechanism as services.property_submissions: the
status flip never rides the reviewer's request transaction, and api_user's UPDATE
grant never needs to cover the approval transition. Access control is the
router's require_admin guard (RLS wouldn't gate a superuser session).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.banner import Banner, BannerStatus


class BannerAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is not pending_approval."""


class BannerNotOwned(Exception):
    """Raised when submit targets a banner created by a different sub_admin.

    Distinct from "not found" (unlike property_submissions' owner-scoped
    SELECT, banners' shared-visibility SELECT means the caller can already see
    this row in their queue — a 404 here would be confusing)."""


async def submit_banner(banner_id: UUID, submitter_uuid: UUID, db: AsyncSession) -> Banner | None:
    """draft/rejected -> pending_approval, own-row only (RLS-covered)."""
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        return None
    if banner.created_by_uuid != submitter_uuid:
        raise BannerNotOwned
    if banner.status not in (BannerStatus.DRAFT, BannerStatus.REJECTED):
        raise BannerAlreadyReviewed
    banner.status = BannerStatus.PENDING_APPROVAL
    banner.review_note = None
    await db.commit()
    await db.refresh(banner)
    return banner


async def approve_banner(banner_id: UUID, reviewer_uuid: UUID) -> Banner | None:
    async with AsyncSessionLocal() as session:
        # FOR UPDATE: serialize concurrent approvals so a second reviewer sees
        # status != pending_approval.
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.APPROVED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = None
        await session.commit()
        await session.refresh(banner)
        return banner


async def reject_banner(banner_id: UUID, reviewer_uuid: UUID, note: str) -> Banner | None:
    async with AsyncSessionLocal() as session:
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.REJECTED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = note
        await session.commit()
        await session.refresh(banner)
        return banner
