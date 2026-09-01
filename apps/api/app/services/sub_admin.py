"""Sub Admin home summary — aggregates 5 domains into one query set.

Mirrors services.agent.get_home_summary's aggregator posture: a single backend
summary avoids the client waterfalling four-to-five separate list requests on
every dashboard load. Every query here runs on the caller's own request
session under each table's existing RLS (banners_select, offers_select,
content_blocks_select, property_submissions_select, transactions_rls) — this
module adds no bypass session and no new access path, only read-side
aggregation of rows the caller could already see one-by-one via the sibling
routers.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.banner import Banner, BannerStatus
from app.models.content_block import ContentBlock, ContentStatus
from app.models.offer import Offer, OfferStatus
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.models.transaction import Transaction, TransactionType
from app.schemas.referral_bonus import ReferralPayoutActivityRead
from app.schemas.sub_admin import PendingApprovalItem, SubAdminHomeResponse

# Matches admin_home._PENDING_QUEUE_LIMIT: the same queue seen from the author's
# end, now rendered as a full-width table rather than a fixed-height scroll box.
_PENDING_APPROVAL_LIMIT = 30
_RECENT_PAYOUTS_LIMIT = 5


async def get_sub_admin_home(db: AsyncSession, auth_user_uuid: UUID) -> SubAdminHomeResponse:
    pending_banners = (
        (
            await db.execute(
                select(Banner)
                .where(
                    Banner.created_by_uuid == auth_user_uuid,
                    Banner.status == BannerStatus.PENDING_APPROVAL,
                    Banner.removed_at.is_(None),
                )
                .order_by(Banner.created_at.desc())
                .limit(_PENDING_APPROVAL_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    pending_submissions = (
        (
            await db.execute(
                select(PropertySubmission)
                .where(
                    PropertySubmission.submitter_uuid == auth_user_uuid,
                    PropertySubmission.status == SubmissionStatus.PENDING,
                )
                .order_by(PropertySubmission.created_at.desc())
                .limit(_PENDING_APPROVAL_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    pending_approval = sorted(
        [
            PendingApprovalItem(
                id=b.id,
                kind="banner",
                title=b.title,
                business_line=b.business_line,
                submitted_at=b.created_at,
            )
            for b in pending_banners
        ]
        + [
            PendingApprovalItem(
                id=s.id,
                kind="property_submission",
                title=s.title,
                business_line=s.business_line,
                submitted_at=s.created_at,
            )
            for s in pending_submissions
        ],
        key=lambda item: item.submitted_at,
        reverse=True,
    )[:_PENDING_APPROVAL_LIMIT]

    live_banners_count = await db.scalar(
        select(func.count())
        .select_from(Banner)
        .where(Banner.status == BannerStatus.LIVE, Banner.removed_at.is_(None))
    )
    live_offers_count = await db.scalar(
        select(func.count())
        .select_from(Offer)
        .where(Offer.status == OfferStatus.ACTIVE, Offer.removed_at.is_(None))
    )
    content_drafts_count = await db.scalar(
        select(func.count())
        .select_from(ContentBlock)
        .where(ContentBlock.status == ContentStatus.DRAFT)
    )

    recent_payouts = (
        (
            await db.execute(
                select(Transaction)
                .where(Transaction.type == TransactionType.REFERRAL_BONUS)
                .order_by(Transaction.created_at.desc())
                .limit(_RECENT_PAYOUTS_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    return SubAdminHomeResponse(
        pending_approval=pending_approval,
        live_banners_count=live_banners_count,
        live_offers_count=live_offers_count,
        content_drafts_count=content_drafts_count,
        recent_referral_payouts=[
            ReferralPayoutActivityRead.model_validate(t, from_attributes=True)
            for t in recent_payouts
        ],
    )
