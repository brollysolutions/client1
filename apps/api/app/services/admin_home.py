"""Admin home summary — aggregates the cross-domain approval queue plus
pipeline/queue counts into one query set.

Mirrors services.sub_admin.get_sub_admin_home's aggregator posture: a single
backend summary avoids the client waterfalling requests on every dashboard
load. Every query here runs on the caller's own request session under each
table's existing RLS policy (agent_applications_rls, banners_select,
property_submissions_select, leads_rls, tasks_rls, loan_applications_rls,
property_deals_rls, payouts_rls) — this module adds no bypass session and no
new access path, only read-side aggregation of rows the caller could already
see one-by-one via the sibling routers.

Two RLS shapes worth knowing before touching this module:

1. Every policy above except banners_select grants Admin visibility via the
   `(platform_scope='true' AND role='admin')` disjunct introduced in
   a0b1c2d3e4f5. banners_select is different: per a4b5c6d7e8f9's own
   docstring it is a narrow POSITIVE allowlist, not a platform_scope bypass,
   and it admits Admin only via an explicit `role='admin'` check. If that
   policy is later "normalized" to the platform_scope shape and the explicit
   admin clause is dropped in the process, pending_banners_count silently
   drops to zero with no error — see
   test_admin_home_api.test_pending_banner_from_another_author_appears.
2. Admin's business_line claim is the empty string, not "both"
   (services/auth_service.py maps the seeded platform-scope profile's
   business_line=None that way). Never add an app-layer business_line filter
   derived from the claim in this module; every disjunct above already
   ignores business_line for Admin, and duplicating that filter here would
   just reintroduce a line-scoping bug this module is not supposed to have.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.banner import Banner, BannerStatus
from app.models.lead import Lead, LeadStatus
from app.models.loan import LoanApplication
from app.models.payout import Payout, PayoutStatus
from app.models.profile import AgentApplication
from app.models.profile import SubmissionStatus as AgentSubmissionStatus
from app.models.property_deal import PropertyDeal
from app.models.property_submission import PropertySubmission
from app.models.property_submission import SubmissionStatus as PropertySubmissionStatus
from app.models.task import Task, TaskStatus
from app.schemas.admin import AdminHomeResponse, AdminPendingItem
from app.services.loan_applications import TERMINAL_STATUSES as LOAN_TERMINAL_STATUSES
from app.services.property_deals import TERMINAL_STATUSES as DEAL_TERMINAL_STATUSES

_PENDING_QUEUE_LIMIT = 12


def _agent_application_title(app: AgentApplication) -> str:
    name = f"{app.first_name or ''} {app.last_name or ''}".strip()
    return name or app.mobile or "Agent application"


async def get_admin_home(db: AsyncSession) -> AdminHomeResponse:
    pending_agent_applications = (
        (
            await db.execute(
                select(AgentApplication)
                .where(AgentApplication.status == AgentSubmissionStatus.PENDING)
                .order_by(AgentApplication.created_at.desc())
                .limit(_PENDING_QUEUE_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    pending_banners = (
        (
            await db.execute(
                select(Banner)
                .where(Banner.status == BannerStatus.PENDING_APPROVAL)
                .order_by(Banner.created_at.desc())
                .limit(_PENDING_QUEUE_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    pending_submissions = (
        (
            await db.execute(
                select(PropertySubmission)
                .where(PropertySubmission.status == PropertySubmissionStatus.PENDING)
                .order_by(PropertySubmission.created_at.desc())
                .limit(_PENDING_QUEUE_LIMIT)
            )
        )
        .scalars()
        .all()
    )

    pending_review = sorted(
        [
            AdminPendingItem(
                id=a.id,
                kind="agent_application",
                title=_agent_application_title(a),
                business_line=a.business_line,
                submitted_at=a.created_at,
            )
            for a in pending_agent_applications
        ]
        + [
            AdminPendingItem(
                id=b.id,
                kind="banner",
                title=b.title,
                business_line=b.business_line,
                submitted_at=b.created_at,
            )
            for b in pending_banners
        ]
        + [
            AdminPendingItem(
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
    )[:_PENDING_QUEUE_LIMIT]

    pending_agent_applications_count = await db.scalar(
        select(func.count())
        .select_from(AgentApplication)
        .where(AgentApplication.status == AgentSubmissionStatus.PENDING)
    )
    pending_banners_count = await db.scalar(
        select(func.count())
        .select_from(Banner)
        .where(Banner.status == BannerStatus.PENDING_APPROVAL)
    )
    pending_property_submissions_count = await db.scalar(
        select(func.count())
        .select_from(PropertySubmission)
        .where(PropertySubmission.status == PropertySubmissionStatus.PENDING)
    )

    open_loan_applications_count = await db.scalar(
        select(func.count())
        .select_from(LoanApplication)
        .where(LoanApplication.status.not_in(LOAN_TERMINAL_STATUSES))
    )
    open_property_deals_count = await db.scalar(
        select(func.count())
        .select_from(PropertyDeal)
        .where(PropertyDeal.status.not_in(DEAL_TERMINAL_STATUSES))
    )

    unassigned_leads_count = await db.scalar(
        select(func.count())
        .select_from(Lead)
        .where(
            Lead.assigned_telecaller_profile_uuid.is_(None),
            Lead.business_line.is_not(None),
            Lead.status.in_((LeadStatus.NEW, LeadStatus.RELEASED)),
        )
    )
    unassigned_tasks_count = await db.scalar(
        select(func.count()).select_from(Task).where(Task.status == TaskStatus.UNASSIGNED)
    )
    payouts_awaiting_approval_count = await db.scalar(
        select(func.count())
        .select_from(Payout)
        .where(Payout.status == PayoutStatus.PENDING_APPROVAL)
    )

    return AdminHomeResponse(
        pending_review=pending_review,
        pending_agent_applications_count=pending_agent_applications_count,
        pending_banners_count=pending_banners_count,
        pending_property_submissions_count=pending_property_submissions_count,
        open_loan_applications_count=open_loan_applications_count,
        open_property_deals_count=open_property_deals_count,
        unassigned_leads_count=unassigned_leads_count,
        unassigned_tasks_count=unassigned_tasks_count,
        payouts_awaiting_approval_count=payouts_awaiting_approval_count,
    )
