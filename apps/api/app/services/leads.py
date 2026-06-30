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

from sqlalchemy import func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

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
) -> None:
    """Insert-or-enrich a lead for this mobile. Never raises."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = pg_insert(Lead).values(
                mobile=mobile,
                name=name,
                business_line=business_line,
                origin=origin,
                status="new",
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[Lead.mobile],
                index_where=text(_ACTIVE_PREDICATE),
                set_={
                    "name": func.coalesce(stmt.excluded.name, Lead.name),
                    "business_line": func.coalesce(stmt.excluded.business_line, Lead.business_line),
                    "updated_at": func.now(),
                },
            )
            await session.execute(stmt)
            await session.commit()
    except Exception:  # capture is best-effort; never break the auth flow
        logger.warning("lead.capture_failed mobile=%s", mobile, exc_info=True)
