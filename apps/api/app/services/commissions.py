"""Agent commissions — Admin entry against an eligible-deal queue, oversight,
and the agent's own read-only earnings ledger (FR-8.1/8.2, IDR v1.4 §5.5).

All admin functions here run on the CALLER's request-scoped session, not a
bypass session: `commissions_insert`/`commissions_update` RLS requires
`role='admin' AND platform_scope='true'`, the same context the router's
`_require_admin` gate already asserts, so trusting RLS is correct here —
same convention as `services/referrals.py::list_for_admin`.

The eligible-deal queue is a CONVENIENCE, not the control: `create_commission`
re-validates deal eligibility itself. A deal that dropped off the queue
between page-load and submit (rare, but a second admin tab or a fast retry
after fixing a validation error can produce it) still gets a clean 404/409
instead of an admin fighting a stale list.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.commission import Commission, CommissionStatus
from app.models.lead import Lead
from app.models.loan import LoanApplication
from app.models.profile import AgentProfile
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.models.user import User
from app.schemas.commissions import (
    AgentEarningsResponse,
    AgentEarningsRow,
    AgentEarningsTotals,
    CommissionRead,
    EligibleDeal,
)
from app.services import audit_log
from app.services.audit_log import AuditAction


class CommissionError(Exception):
    """Base for commission service errors; the router maps subclasses to HTTP."""


class DealNotFound(CommissionError):
    pass


class DealNotEligible(CommissionError):
    """Deal is not in its commission-eligible terminal state, has no origin
    agent, or already carries a live (non-cancelled) commission."""


class CommissionNotFound(CommissionError):
    pass


class CommissionAlreadyResolved(CommissionError):
    """Cancel attempted on a commission that is no longer pending, or already
    has a payout attached."""


def _name_expr(user_model):
    full_name = func.concat_ws(" ", user_model.first_name, user_model.last_name)
    return func.nullif(func.trim(full_name), "")


async def list_eligible_deals(
    db: AsyncSession, *, limit: int = 50, offset: int = 0
) -> tuple[list[EligibleDeal], int]:
    """Disbursed loans + closed property deals with an origin agent and no
    live (non-cancelled) commission row yet, newest-first, loans and property
    deals merged in Python. Each sub-query is capped independently
    (`_SUBQUERY_CAP`) rather than paginated at the SQL level — the two source
    tables have unrelated shapes and a heterogeneous UNION would need to
    project down to a shared column set anyway. In practice this queue drains
    continuously (Admin clears it as deals close), so the cap is not expected
    to bind; if it ever does, that's worth revisiting with real usage data,
    not guessed at up front."""
    _SUBQUERY_CAP = 200
    AgentUser = aliased(User)

    loan_stmt = (
        select(
            LoanApplication.id.label("deal_uuid"),
            LoanApplication.business_line,
            Lead.origin_agent_profile_uuid.label("agent_profile_uuid"),
            AgentProfile.agent_code,
            _name_expr(AgentUser).label("agent_name"),
            LoanApplication.lead_uuid,
            LoanApplication.disbursed_at.label("eligible_since"),
        )
        .join(Lead, Lead.id == LoanApplication.lead_uuid)
        .join(AgentProfile, AgentProfile.id == Lead.origin_agent_profile_uuid)
        .join(AgentUser, AgentUser.id == AgentProfile.auth_user_uuid)
        .where(
            # disbursed_at IS NOT NULL, not status == DISBURSED: DISBURSED
            # isn't terminal, so a loan that has since moved on to CLOSED (its
            # normal next step) must stay eligible — see disbursed_at's
            # column docstring in models/loan.py.
            LoanApplication.disbursed_at.is_not(None),
            Lead.origin_agent_profile_uuid.is_not(None),
            ~select(Commission.id)
            .where(
                Commission.loan_application_uuid == LoanApplication.id,
                Commission.status != CommissionStatus.CANCELLED,
            )
            .exists(),
        )
        .order_by(LoanApplication.disbursed_at.desc().nulls_last())
        .limit(_SUBQUERY_CAP)
    )

    deal_stmt = (
        select(
            PropertyDeal.id.label("deal_uuid"),
            PropertyDeal.business_line,
            Lead.origin_agent_profile_uuid.label("agent_profile_uuid"),
            AgentProfile.agent_code,
            _name_expr(AgentUser).label("agent_name"),
            PropertyDeal.lead_uuid,
            PropertyDeal.closed_at.label("eligible_since"),
        )
        .join(Lead, Lead.id == PropertyDeal.lead_uuid)
        .join(AgentProfile, AgentProfile.id == Lead.origin_agent_profile_uuid)
        .join(AgentUser, AgentUser.id == AgentProfile.auth_user_uuid)
        .where(
            PropertyDeal.status == PropertyDealStatus.CLOSED,
            Lead.origin_agent_profile_uuid.is_not(None),
            ~select(Commission.id)
            .where(
                Commission.property_deal_uuid == PropertyDeal.id,
                Commission.status != CommissionStatus.CANCELLED,
            )
            .exists(),
        )
        .order_by(PropertyDeal.closed_at.desc().nulls_last())
        .limit(_SUBQUERY_CAP)
    )

    loan_rows = (await db.execute(loan_stmt)).all()
    deal_rows = (await db.execute(deal_stmt)).all()

    deals = [
        EligibleDeal(
            deal_type="loan_application",
            deal_uuid=r.deal_uuid,
            business_line=r.business_line,
            agent_profile_uuid=r.agent_profile_uuid,
            agent_code=r.agent_code,
            agent_name=r.agent_name,
            lead_uuid=r.lead_uuid,
            eligible_since=r.eligible_since,
        )
        for r in loan_rows
    ] + [
        EligibleDeal(
            deal_type="property_deal",
            deal_uuid=r.deal_uuid,
            business_line=r.business_line,
            agent_profile_uuid=r.agent_profile_uuid,
            agent_code=r.agent_code,
            agent_name=r.agent_name,
            lead_uuid=r.lead_uuid,
            eligible_since=r.eligible_since,
        )
        for r in deal_rows
    ]
    # eligible_since can be NULL on a legacy property-deal row (pre-dates
    # this codebase's always-set-closed_at-at-terminal-transition
    # discipline); sort those last rather than crashing on a None/datetime
    # comparison. Never NULL for a loan row — disbursed_at is the WHERE
    # predicate itself.
    deals.sort(key=lambda d: (d.eligible_since is not None, d.eligible_since), reverse=True)
    total = len(deals)
    return deals[offset : offset + limit], total


async def create_commission(
    db: AsyncSession,
    *,
    deal_type: str,
    deal_uuid: uuid.UUID,
    agreed_amount_paise: int,
    notes: str | None,
    entered_by_uuid: uuid.UUID,
    entered_by_role: str,
) -> Commission:
    """Derives agent/line/lead from the deal row — never from the request
    body — then inserts the commission and writes the audit entry in the
    same transaction (the router commits)."""
    if deal_type == "loan_application":
        deal = await db.get(LoanApplication, deal_uuid)
        if deal is None:
            raise DealNotFound("Loan application not found.")
        if deal.disbursed_at is None:
            raise DealNotEligible("Loan application has never been disbursed.")
        loan_application_uuid: uuid.UUID | None = deal.id
        property_deal_uuid: uuid.UUID | None = None
        business_line = deal.business_line
        lead_uuid = deal.lead_uuid
    elif deal_type == "property_deal":
        deal = await db.get(PropertyDeal, deal_uuid)
        if deal is None:
            raise DealNotFound("Property deal not found.")
        if deal.status != PropertyDealStatus.CLOSED:
            raise DealNotEligible("Property deal is not closed.")
        loan_application_uuid = None
        property_deal_uuid = deal.id
        business_line = deal.business_line
        lead_uuid = deal.lead_uuid
    else:  # pragma: no cover — schema Literal already rejects this
        raise DealNotEligible("Unknown deal_type.")

    lead = await db.get(Lead, lead_uuid)
    if lead is None or lead.origin_agent_profile_uuid is None:
        raise DealNotEligible("Deal has no origin agent; not commission-eligible.")

    agent_profile = await db.get(AgentProfile, lead.origin_agent_profile_uuid)
    if agent_profile is None:
        raise DealNotEligible("Origin agent profile no longer exists.")

    commission = Commission(
        agent_auth_user_uuid=agent_profile.auth_user_uuid,
        agent_profile_uuid=agent_profile.id,
        business_line=business_line,
        lead_uuid=lead_uuid,
        loan_application_uuid=loan_application_uuid,
        property_deal_uuid=property_deal_uuid,
        agreed_amount_paise=agreed_amount_paise,
        entered_by_uuid=entered_by_uuid,
        notes=notes,
    )
    db.add(commission)
    try:
        await db.flush()
    except IntegrityError as exc:
        # The partial-unique index is the authoritative double-entry guard
        # (a concurrent second entry on the same deal loses the race here);
        # the eligibility query above is only the convenience.
        raise DealNotEligible("A live commission already exists for this deal.") from exc

    await audit_log.record(
        db,
        action=AuditAction.COMMISSION_ENTERED,
        entity_type="commission",
        entity_uuid=commission.id,
        actor_uuid=entered_by_uuid,
        actor_role=entered_by_role,
        business_line=business_line,
        detail={
            "deal_type": deal_type,
            "deal_uuid": str(deal_uuid),
            "amount_paise": agreed_amount_paise,
            "agent_code": agent_profile.agent_code,
        },
    )
    return commission


async def cancel_commission(
    db: AsyncSession,
    *,
    commission_id: uuid.UUID,
    reason: str,
    actor_uuid: uuid.UUID,
    actor_role: str,
) -> None:
    """pending -> cancelled, CAS-guarded. Blocked once a payout is attached
    (payout_uuid IS NOT NULL, set by PR 2) — cancelling a commission that
    already has money moving against it is a payout-side decision (reject the
    payout), not a ledger edit."""
    result = await db.execute(
        update(Commission)
        .where(
            Commission.id == commission_id,
            Commission.status == CommissionStatus.PENDING,
            Commission.payout_uuid.is_(None),
        )
        .values(status=CommissionStatus.CANCELLED, cancelled_reason=reason)
        .returning(Commission.business_line)
    )
    row = result.first()
    if row is None:
        existing = await db.get(Commission, commission_id)
        if existing is None:
            raise CommissionNotFound("Commission not found.")
        raise CommissionAlreadyResolved(
            "Commission is not pending or already has a payout attached."
        )

    await audit_log.record(
        db,
        action=AuditAction.COMMISSION_CANCELLED,
        entity_type="commission",
        entity_uuid=commission_id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=row.business_line,
        detail={"reason": reason},
    )


def _deal_fields(commission: Commission) -> tuple[str, uuid.UUID]:
    if commission.loan_application_uuid is not None:
        return "loan_application", commission.loan_application_uuid
    return "property_deal", commission.property_deal_uuid


def _row_to_read(commission: Commission, agent_code: str, agent_name: str | None) -> CommissionRead:
    deal_type, deal_uuid = _deal_fields(commission)
    return CommissionRead(
        id=commission.id,
        agent_profile_uuid=commission.agent_profile_uuid,
        agent_code=agent_code,
        agent_name=agent_name,
        business_line=commission.business_line,
        deal_type=deal_type,
        deal_uuid=deal_uuid,
        agreed_amount_paise=commission.agreed_amount_paise,
        status=commission.status,
        payout_uuid=commission.payout_uuid,
        notes=commission.notes,
        cancelled_reason=commission.cancelled_reason,
        created_at=commission.created_at,
        updated_at=commission.updated_at,
    )


async def list_for_admin(
    db: AsyncSession,
    *,
    status_filter: CommissionStatus | None = None,
    business_line: str | None = None,
    agent_profile_uuid: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[CommissionRead], int]:
    """Admin oversight read. Runs on the caller's request session — RLS's
    full-Admin branch already grants unfiltered reach, same trust-RLS
    convention as list_eligible_deals / list_for_agent."""
    filters = []
    if status_filter is not None:
        filters.append(Commission.status == status_filter)
    if business_line is not None:
        filters.append(Commission.business_line == business_line)
    if agent_profile_uuid is not None:
        filters.append(Commission.agent_profile_uuid == agent_profile_uuid)

    total = await db.scalar(select(func.count()).select_from(Commission).where(*filters)) or 0

    stmt = (
        select(Commission, AgentProfile.agent_code, _name_expr(User).label("agent_name"))
        .join(AgentProfile, AgentProfile.id == Commission.agent_profile_uuid)
        .join(User, User.id == Commission.agent_auth_user_uuid)
        .where(*filters)
        .order_by(Commission.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()
    return [_row_to_read(c, code, name) for c, code, name in rows], total


async def get_for_admin(db: AsyncSession, commission_id: uuid.UUID) -> CommissionRead | None:
    """Single-row read-back, same projection as list_for_admin — used right
    after create_commission so the response carries agent_code/agent_name
    without duplicating the join logic."""
    stmt = (
        select(Commission, AgentProfile.agent_code, _name_expr(User).label("agent_name"))
        .join(AgentProfile, AgentProfile.id == Commission.agent_profile_uuid)
        .join(User, User.id == Commission.agent_auth_user_uuid)
        .where(Commission.id == commission_id)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    commission, agent_code, agent_name = row
    return _row_to_read(commission, agent_code, agent_name)


async def list_for_agent(db: AsyncSession) -> AgentEarningsResponse:
    """The agent's own ledger. Runs on the caller's request session; RLS's
    agent-own-row branch on `commissions_select` is the only filter that
    matters — this function adds no additional WHERE, same stance
    list_referrals takes."""
    rows = (await db.scalars(select(Commission).order_by(Commission.created_at.desc()))).all()

    ledger_rows = []
    for c in rows:
        deal_type, deal_uuid = _deal_fields(c)
        ledger_rows.append(
            AgentEarningsRow(
                id=c.id,
                business_line=c.business_line,
                deal_type=deal_type,
                deal_uuid=deal_uuid,
                agreed_amount_paise=c.agreed_amount_paise,
                status=c.status,
                payout_txn_uuid=c.payout_txn_uuid,
                created_at=c.created_at,
            )
        )
    pending = sum(c.agreed_amount_paise for c in rows if c.status == CommissionStatus.PENDING)
    paid = sum(c.agreed_amount_paise for c in rows if c.status == CommissionStatus.PAID)
    return AgentEarningsResponse(
        rows=ledger_rows,
        totals=AgentEarningsTotals(
            pending_amount_paise=pending,
            paid_amount_paise=paid,
            total_amount_paise=pending + paid,
        ),
    )
