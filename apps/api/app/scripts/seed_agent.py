"""Promote a registered account to a real-estate Agent (dev only).

Attaches an ACTIVE real_estate AgentProfile to an existing auth_user so that
account's next login resolves as role="agent" (staff > agent > client
precedence in services.auth_service.resolve_role_claims). Needed to exercise
the agent submit surface (/dashboard/property-submit, /dashboard/my-submissions)
end to end — no self-registration path creates agents.

The account's mobile is a required argument:
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_agent +919812345678

Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS). Idempotent:
skips if the account already has an ACTIVE agent profile. Dev/staging only — agent
provisioning in production goes through the real application/approval flow, never a
seed script.
"""

from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import select, text


async def _seed(mobile: str) -> None:
    import app.db.session as session_mod
    from app.models.profile import AgentProfile, ProfileStatus

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        if row is None:
            print(f"[seed_agent] No account for {mobile}. Register it first, then re-run.")
            return
        auth_user_uuid = row[0]

        existing = await db.scalar(
            select(AgentProfile).where(
                AgentProfile.auth_user_uuid == auth_user_uuid,
                AgentProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if existing is not None:
            print(
                f"[seed_agent] {mobile} already has an active agent profile "
                f"(agent_code={existing.agent_code}) — skipping."
            )
            return

        db.add(
            AgentProfile(
                auth_user_uuid=auth_user_uuid,
                agent_code="AGT" + str(uuid.uuid4().int)[:8],
                business_line="real_estate",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
        print(f"[seed_agent] {mobile} is now a real_estate agent. Re-login to pick it up.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m app.scripts.seed_agent <mobile-e164>   e.g. +919812345678")
        sys.exit(1)
    asyncio.run(_seed(sys.argv[1]))


if __name__ == "__main__":
    main()
