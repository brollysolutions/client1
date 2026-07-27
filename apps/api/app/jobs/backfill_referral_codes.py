"""Safety-net backfill: ensure every eligible client holds a referral code.

The GET /api/v1/referrals/me self-heal already issues a code on first visit,
so this job normally finds nothing to do for anyone who has opened the
referrals page. It exists for the much larger set of clients who registered
before this feature shipped and never visit — without it they'd stay
codeless (and referral-less) indefinitely.

Idempotent by construction, same shape as backfill_customer_codes: it only
inserts codes that are missing and never touches existing rows, so a second
run is a no-op. It re-checks for the code inside the transaction right
before inserting, so a row created by a concurrent GET /me between the scan
and the insert is skipped rather than duplicated (services.referrals.
issue_code_on_session already does this re-check).

Runs on the app superuser session (bypasses RLS), same as the other
scheduler jobs. Anchors on "the user holds an ACTIVE ClientProfile and no
ACTIVE agent/staff profile" (services.referrals._referrer_is_eligible's own
rule, re-expressed as SQL here for the scan) so it only ever provisions
eligible clients, matching FR-9.1.
"""

from __future__ import annotations

import logging
import time

from sqlalchemy import select

import app.db.session as db_session
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus, StaffProfile
from app.models.referral import ReferralCode
from app.models.user import User
from app.services.referrals import issue_code_on_session

logger = logging.getLogger("scheduler")

# Bound each run; the backfill target shrinks to ~0 over time as GET /me
# self-heals the active population. Anything larger than a handful on a
# mature deploy signals clients who never open the referrals page.
_SCAN_LIMIT = 500


async def backfill_referral_codes() -> None:
    """Issue a referral code for any eligible client who doesn't have one."""
    started = time.monotonic()
    logger.info("job.backfill_referral_codes.start")
    scanned = 0
    filled = 0
    try:
        # Resolve the sessionmaker at call time (not an import-bound name) so
        # the test suite's NullPool rebind is honoured; production uses the
        # normal pooled engine.
        async with db_session.AsyncSessionLocal() as session:
            has_active_client = (
                select(ClientProfile.id)
                .where(
                    ClientProfile.auth_user_uuid == User.id,
                    ClientProfile.status == ProfileStatus.ACTIVE,
                )
                .exists()
            )
            has_active_agent = (
                select(AgentProfile.id)
                .where(
                    AgentProfile.auth_user_uuid == User.id,
                    AgentProfile.status == ProfileStatus.ACTIVE,
                )
                .exists()
            )
            has_active_staff = (
                select(StaffProfile.id)
                .where(
                    StaffProfile.auth_user_uuid == User.id,
                    StaffProfile.status == ProfileStatus.ACTIVE,
                )
                .exists()
            )
            has_code = (
                select(ReferralCode.auth_user_uuid)
                .where(ReferralCode.auth_user_uuid == User.id)
                .exists()
            )
            rows = await session.execute(
                select(User.id)
                .where(has_active_client, ~has_active_agent, ~has_active_staff, ~has_code)
                .limit(_SCAN_LIMIT)
            )
            for (user_id,) in rows.all():
                scanned += 1
                # skip_eligibility=True: the scan query above already applied
                # the exact same predicate. issue_code_on_session still
                # re-checks for an existing row (idempotent vs a concurrent
                # GET /me self-heal racing this same user).
                code = await issue_code_on_session(session, user_id, skip_eligibility=True)
                if code is not None:
                    filled += 1
            await session.commit()
    except Exception:
        logger.exception("job.backfill_referral_codes.failed")
        raise
    else:
        logger.info(
            "job.backfill_referral_codes.success filled=%d scanned=%d duration_ms=%d",
            filled,
            scanned,
            (time.monotonic() - started) * 1000,
        )
