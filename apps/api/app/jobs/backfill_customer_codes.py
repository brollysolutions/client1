"""Safety-net backfill: ensure every client holds a ClientProfile per business line.

Registration already creates both lines (loans + real_estate) synchronously, each
with its own unique customer_code, so this job normally finds nothing to do. It
exists to heal the rare gap where a client ends up with a profile for one line but
not the other, for example a partial failure during registration or a future
provisioning path that only creates one line. Registration stays synchronous and
unchanged; this is purely a backstop.

Idempotent by construction: it only inserts profiles that are missing and never
touches existing rows, so a second run is a no-op. It re-checks for the profile
inside the transaction right before inserting, so a row created by a concurrent
registration between the scan and the insert is skipped rather than duplicated.
Code collisions are guarded by the customer_code UNIQUE constraint plus the same
retry budget the registration path uses.

Runs on the app superuser session (bypasses RLS), same as the other scheduler
jobs. It anchors on "the user already holds at least one client profile" so it
only ever provisions clients, never staff or agent accounts.
"""

from __future__ import annotations

import logging
import time
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.security import generate_profile_code
from app.models.profile import ClientProfile, ProfileStatus
from app.models.user import User

logger = logging.getLogger("scheduler")

# Client profiles are always provisioned per line.
_LINES: tuple[str, ...] = ("loans", "real_estate")
# Bound each run; the backfill target is expected to be ~0. Anything larger than a
# handful signals a systemic provisioning bug worth investigating, not silently
# grinding through in one job tick.
_SCAN_LIMIT = 500
# Same collision-retry budget as synchronous registration (auth_service).
_MAX_CODE_ATTEMPTS = 5


async def backfill_customer_codes() -> None:
    """Create any missing per-line ClientProfile (with customer_code) for clients."""
    started = time.monotonic()
    logger.info("job.backfill_customer_codes.start")
    scanned = 0
    filled = 0
    try:
        # Resolve the sessionmaker at call time (not an import-bound name) so the
        # test suite's NullPool rebind is honoured; production uses the pooled engine.
        async with db_session.AsyncSessionLocal() as session:
            for line in _LINES:
                # Users who already hold at least one client profile (so they ARE
                # clients) but are missing this specific line.
                is_client = (
                    select(ClientProfile.id).where(ClientProfile.auth_user_uuid == User.id).exists()
                )
                has_line = (
                    select(ClientProfile.id)
                    .where(
                        ClientProfile.auth_user_uuid == User.id,
                        ClientProfile.business_line == line,
                    )
                    .exists()
                )
                rows = await session.execute(
                    select(User.id, User.first_name).where(is_client, ~has_line).limit(_SCAN_LIMIT)
                )
                for user_id, first_name in rows.all():
                    scanned += 1
                    if await _fill_line(session, user_id, first_name or "", line):
                        filled += 1
            await session.commit()
    except Exception:
        logger.exception("job.backfill_customer_codes.failed")
        raise
    else:
        logger.info(
            "job.backfill_customer_codes.success filled=%d scanned=%d duration_ms=%d",
            filled,
            scanned,
            (time.monotonic() - started) * 1000,
        )


async def _fill_line(session: AsyncSession, user_id: UUID, first_name: str, line: str) -> bool:
    """Insert the missing ClientProfile for one (user, line). Returns True if created."""
    # Re-check inside the transaction: a concurrent registration may have created
    # this profile between the scan and now. Skip if so (race-safe, idempotent).
    already = await session.scalar(
        select(ClientProfile.id).where(
            ClientProfile.auth_user_uuid == user_id,
            ClientProfile.business_line == line,
        )
    )
    if already is not None:
        return False

    for attempt in range(_MAX_CODE_ATTEMPTS):
        code = generate_profile_code("client", first_name, line)
        try:
            async with session.begin_nested():
                session.add(
                    ClientProfile(
                        auth_user_uuid=user_id,
                        business_line=line,
                        customer_code=code,
                        status=ProfileStatus.ACTIVE,
                    )
                )
            return True
        except IntegrityError:
            # customer_code UNIQUE collision — regenerate and retry. Give up after
            # the budget so a genuinely stuck row can't spin the job.
            if attempt == _MAX_CODE_ATTEMPTS - 1:
                logger.warning(
                    "job.backfill_customer_codes.code_collision user=%s line=%s",
                    user_id,
                    line,
                )
                return False
    return False
