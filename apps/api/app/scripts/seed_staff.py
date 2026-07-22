"""Promote a registered account to a platform staff role (dev only).

Attaches a PLATFORM-scoped StaffProfile to an existing auth_user so that account's
next login resolves as Admin or Sub Admin (staff > agent > client precedence in
services.auth_service.resolve_role_claims). Needed to exercise staff-only surfaces
in dev (e.g. the property-review queue) — no self-registration path creates staff.

The account's mobile is a required argument; the role is optional (default
sub_admin):
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_staff +919812345678 sub_admin

Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS). Idempotent:
skips if the account already has an ACTIVE staff profile. Dev/staging only — staff
provisioning in production goes through the real admin console, never a seed script.
"""

from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import select, text


async def _seed(mobile: str, role_value: str) -> None:
    import app.db.session as session_mod
    from app.models.profile import (
        ProfileScope,
        ProfileStatus,
        StaffProfile,
        StaffRole,
    )

    try:
        role = StaffRole(role_value)
    except ValueError:
        valid = ", ".join(r.value for r in StaffRole)
        print(f"[seed_staff] Invalid role '{role_value}'. Choose one of: {valid}.")
        return

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        if row is None:
            print(f"[seed_staff] No account for {mobile}. Register it first, then re-run.")
            return
        auth_user_uuid = row[0]

        existing = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.auth_user_uuid == auth_user_uuid,
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if existing is not None:
            print(
                f"[seed_staff] {mobile} already has an active staff profile "
                f"(role={existing.role.value}) — skipping."
            )
            return

        db.add(
            StaffProfile(
                auth_user_uuid=auth_user_uuid,
                role=role,
                scope=ProfileScope.PLATFORM,
                business_line="real_estate",
                staff_code="STF" + str(uuid.uuid4().int)[:8],
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
        print(
            f"[seed_staff] {mobile} is now {role.value} (platform scope). Re-login to pick it up."
        )


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python -m app.scripts.seed_staff <mobile-e164> [role]"
            "   e.g. +919812345678 sub_admin"
        )
        sys.exit(1)
    role_value = sys.argv[2] if len(sys.argv) > 2 else "sub_admin"
    asyncio.run(_seed(sys.argv[1], role_value))


if __name__ == "__main__":
    main()
