"""Seed a few PENDING agent applications for the Admin approval queue (dev only).

The public agent-application submit endpoint (POST /api/v1/agent-applications)
is live, but exercising the full OTP + upload flow by hand is slow — this
script stands in to make the queue at GET /api/v1/admin/agents demonstrable
without it:

    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_agent_applications

applicant_auth_user_uuid is deliberately NULL so approving one exercises the
account-creation branch in services.admin.approve_agent_application (mirrors a
real public applicant who has no account yet). Document refs are deliberately
left NULL too — a real applicant's KYC files live in object storage, which
this script doesn't touch, so the Admin detail dialog exercises its
"No documents on this application" empty state against these rows (a real
empty state, not a stub — plenty of legacy/incomplete rows will look like
this in production too). Inserts through AsyncSessionLocal as the `app`
superuser (bypasses RLS). Idempotent: skips if pending rows already exist.
Production ships EMPTY — real applications arrive via the public form.
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import func, select


async def _seed() -> None:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        existing = await db.scalar(
            select(func.count())
            .select_from(AgentApplication)
            .where(AgentApplication.status == SubmissionStatus.PENDING)
        )
        if existing:
            print(
                f"[seed_agent_applications] {existing} pending application(s) already — skipping."
            )
            return

        def _mobile() -> str:
            n = uuid.uuid4().int % 900_000_000 + 100_000_000
            return f"+91{n}"

        apps = [
            AgentApplication(
                first_name="Ravi",
                last_name="Kumar",
                mobile=_mobile(),
                email="ravi.kumar.seed@example.com",
                business_line="real_estate",
                rera_code="RERA/AG/2026/00041",
                status=SubmissionStatus.PENDING,
            ),
            AgentApplication(
                first_name="Priya",
                last_name="Sharma",
                mobile=_mobile(),
                email="priya.sharma.seed@example.com",
                business_line="real_estate",
                rera_code="RERA/AG/2026/00042",
                status=SubmissionStatus.PENDING,
            ),
        ]
        db.add_all(apps)
        await db.commit()
        print(f"[seed_agent_applications] Inserted {len(apps)} pending applications.")


def main() -> None:
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
