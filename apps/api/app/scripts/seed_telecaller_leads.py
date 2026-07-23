"""Seed sample leads assigned to a telecaller, for exercising the Telecaller
Dashboard in dev (dev only).

Requires the account to already have a telecaller StaffProfile — provision one
first with seed_staff.py:
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_staff +919812345678 telecaller loans
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_telecaller_leads +919812345678

Inserts 3 sample leads pre-assigned to that telecaller on their line
(assigned_telecaller_profile_uuid set, status=assigned), plus one lead_activities
row with a past follow_up_at so the dashboard home's "follow-ups due" list isn't
empty on first login. Inserts through AsyncSessionLocal as the `app` superuser
(bypasses RLS). Idempotent: skips if this telecaller already has assigned leads.
Production ships EMPTY — real leads arrive via capture + admin assignment.
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text


async def _seed(mobile: str) -> None:
    import app.db.session as session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.lead_activity import CallDisposition, InterestLevel, LeadActivity
    from app.models.profile import ProfileStatus, StaffProfile, StaffRole

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        if row is None:
            print(f"[seed_telecaller_leads] No account for {mobile}. Register it first.")
            return
        auth_user_uuid = row[0]

        staff = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.auth_user_uuid == auth_user_uuid,
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if staff is None or staff.role != StaffRole.TELECALLER:
            print(
                f"[seed_telecaller_leads] {mobile} has no active telecaller profile. "
                "Run seed_staff.py <mobile> telecaller <business_line> first."
            )
            return
        if staff.business_line is None:
            print(f"[seed_telecaller_leads] {mobile}'s telecaller profile has no business_line.")
            return

        existing = await db.scalar(
            select(func.count())
            .select_from(Lead)
            .where(Lead.assigned_telecaller_profile_uuid == staff.id)
        )
        if existing:
            print(
                f"[seed_telecaller_leads] {mobile} already has {existing} "
                "assigned lead(s) — skipping."
            )
            return

        def _mobile() -> str:
            n = uuid.uuid4().int % 900_000_000 + 100_000_000
            return f"+91{n}"

        names = ["Amit Verma", "Sneha Reddy", "Farhan Sheikh"]
        leads = [
            Lead(
                name=name,
                mobile=_mobile(),
                business_line=staff.business_line,
                origin=LeadOrigin.DIRECT,
                assigned_telecaller_profile_uuid=staff.id,
                status=LeadStatus.ASSIGNED,
                requirement={"page": "seed"},
            )
            for name in names
        ]
        db.add_all(leads)
        await db.flush()

        # One lead gets a past-due follow-up so the home screen isn't empty.
        db.add(
            LeadActivity(
                lead_uuid=leads[0].id,
                telecaller_staff_profile_uuid=staff.id,
                business_line=staff.business_line,
                disposition=CallDisposition.CALLBACK_REQUESTED,
                interest_level=None,
                notes="Asked to call back after lunch.",
                follow_up_at=datetime.now(UTC) - timedelta(hours=1),
            )
        )
        leads[0].status = LeadStatus.WORKING

        # A second lead gets a connected/hot attempt with no pending follow-up.
        db.add(
            LeadActivity(
                lead_uuid=leads[1].id,
                telecaller_staff_profile_uuid=staff.id,
                business_line=staff.business_line,
                disposition=CallDisposition.CONNECTED,
                interest_level=InterestLevel.HOT,
                notes="Very interested, sending details over WhatsApp.",
                follow_up_at=None,
            )
        )
        leads[1].status = LeadStatus.WORKING

        await db.commit()
        print(f"[seed_telecaller_leads] Seeded {len(leads)} leads assigned to {mobile}.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.seed_telecaller_leads <telecaller-mobile-e164>")
        sys.exit(1)
    asyncio.run(_seed(sys.argv[1]))


if __name__ == "__main__":
    main()
