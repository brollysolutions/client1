"""Lead capture — durable, best-effort persistence of every enquiring mobile.

Called at the top of every auth entry point (register/initiate, login,
forgot/initiate) so no number is lost, even if the user never completes the flow.

Design notes:
  * Runs on its OWN session (not the request session). login/forgot raise
    HTTPException on the unknown-mobile path, and get_db rolls the request session
    back — a lead written there would be discarded. An independent session commits
    regardless of the request outcome.
  * That session connects as the 'app' superuser (DATABASE_URL), which bypasses RLS,
    so the unauthenticated INSERT always succeeds — same mechanism as the existing
    unauthenticated AuthEvent insert.
  * Idempotent via the partial-unique index on (mobile) WHERE status NOT IN
    ('closed','released'): ON CONFLICT enriches name/business_line (COALESCE keeps
    known values) and touches updated_at as a last-seen marker.
  * Best-effort: all errors are swallowed so capture can never break or slow-fail
    the auth response (which would also leak timing — see enumeration-safety).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.masking import mask_mobile
from app.db.session import AsyncSessionLocal
from app.models.lead import Lead

logger = logging.getLogger(__name__)

_ACTIVE_PREDICATE = "status NOT IN ('closed', 'released')"


async def capture_lead(
    mobile: str,
    *,
    name: str | None = None,
    business_line: str | None = None,
    origin: str = "direct",
    requirement: dict[str, Any] | None = None,
) -> bool:
    """Insert-or-enrich a lead for this mobile. Never raises.

    Returns True when the write committed, False when it was swallowed — auth
    callers ignore this (capture must never break the auth flow); the public
    leads endpoint logs on False but still answers 202 (the visitor can do
    nothing useful with a storage error, and the failure is already logged
    with a traceback here for ops).
    """
    try:
        async with AsyncSessionLocal() as session:
            stmt = pg_insert(Lead).values(
                mobile=mobile,
                name=name,
                business_line=business_line,
                origin=origin,
                status="new",
                requirement=requirement,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[Lead.mobile],
                index_where=text(_ACTIVE_PREDICATE),
                set_={
                    "name": func.coalesce(stmt.excluded.name, Lead.name),
                    # Keep the FIRST-set line: only fill business_line when the
                    # existing lead has none. business_line is immutable once set
                    # (a DB trigger enforces this), so preferring the incoming value
                    # would raise on a cross-line re-enquiry and — since capture is
                    # best-effort/swallowed — silently drop the lead.
                    "business_line": func.coalesce(Lead.business_line, stmt.excluded.business_line),
                    # Merge requirement JSONB, newest value wins per key; an
                    # incoming NULL leaves the stored blob untouched.
                    "requirement": case(
                        (stmt.excluded.requirement.is_(None), Lead.requirement),
                        else_=func.coalesce(Lead.requirement, text("'{}'::jsonb")).op("||")(
                            stmt.excluded.requirement
                        ),
                    ),
                    "updated_at": func.now(),
                },
            )
            await session.execute(stmt)
            await session.commit()
            return True
    except Exception:  # capture is best-effort; never break the auth flow
        logger.warning("lead.capture_failed mobile=%s", mask_mobile(mobile), exc_info=True)
        return False


async def resolve_loans_lead(mobile: str, client_profile_uuid: UUID) -> UUID:
    """Find-or-create the client's loans lead and return its id.

    Every loan_application must hang off a lead (the lead spine — see
    models/lead.py); this is the FK anchor a real "Apply" write needs. Unlike
    capture_lead (auth-flow, best-effort, swallows errors), this RAISES: the
    lead id is a hard requirement for creating a loan application, not a
    best-effort side write.

    Runs on the bypass superuser session, like capture_lead, because a
    not-yet-claimed lead (client_profile_uuid IS NULL — the shape every
    register/login capture leaves it in) is invisible to the client's own
    RLS-scoped session: leads_rls (d4a1b2c3e5f6) has no branch for an
    unclaimed lead under role='client'. Idempotent via the same partial-unique
    index capture_lead relies on (mobile WHERE status NOT IN ('closed',
    'released')); COALESCE only fills business_line/client_profile_uuid when
    unset, respecting the business_line-immutability trigger and never
    reassigning a lead someone else already claimed.
    """
    async with AsyncSessionLocal() as session:
        stmt = pg_insert(Lead).values(
            mobile=mobile,
            business_line="loans",
            client_profile_uuid=client_profile_uuid,
            origin="direct",
            status="new",
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Lead.mobile],
            index_where=text(_ACTIVE_PREDICATE),
            set_={
                "business_line": func.coalesce(Lead.business_line, stmt.excluded.business_line),
                "client_profile_uuid": func.coalesce(
                    Lead.client_profile_uuid, stmt.excluded.client_profile_uuid
                ),
                "updated_at": func.now(),
            },
        ).returning(Lead.id)
        result = await session.execute(stmt)
        lead_id = result.scalar_one()
        await session.commit()
        return lead_id
