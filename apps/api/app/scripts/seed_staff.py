"""Promote a registered account to a staff role (dev only).

Attaches a StaffProfile to an existing auth_user so that account's next login
resolves as staff (staff > agent > client precedence in
services.auth_service.resolve_role_claims). Needed to exercise staff-only surfaces
in dev (e.g. the property-review queue, the Telecaller Dashboard) — no
self-registration path creates staff.

sub_admin is PLATFORM-scoped (no business_line). telecaller and employee are
LINE-scoped and need an explicit business_line — this mirrors the rule
services.admin.create_staff already enforces for admin-provisioned accounts, and
matters here specifically because leads_rls's telecaller branch (migration
e6c7b8f9a0d1) keys off app.business_line: a platform-scoped telecaller would never
match it.

The account's mobile is a required argument; role defaults to sub_admin;
business_line is required for telecaller/employee:
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_staff +919812345678 sub_admin
    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_staff +919812345678 telecaller loans

Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS). Idempotent:
skips if the account already has an ACTIVE staff profile. Dev/staging only — staff
provisioning in production goes through the real admin console, never a seed script.
"""

from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import select, text


async def _seed(mobile: str, role_value: str, business_line: str | None) -> None:
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

    scope = (
        ProfileScope.PLATFORM
        if role in (StaffRole.SUB_ADMIN, StaffRole.ADMIN)
        else ProfileScope.LINE
    )
    if scope == ProfileScope.LINE:
        if business_line not in ("loans", "real_estate"):
            print(
                f"[seed_staff] role={role.value} is line-scoped; pass business_line "
                "as the third argument: 'loans' or 'real_estate'."
            )
            return
    else:
        business_line = None

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
                scope=scope,
                business_line=business_line,
                staff_code="STF" + str(uuid.uuid4().int)[:8],
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
        scope_desc = f"{scope.value} scope" + (f", {business_line}" if business_line else "")
        print(f"[seed_staff] {mobile} is now {role.value} ({scope_desc}). Re-login to pick it up.")


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python -m app.scripts.seed_staff <mobile-e164> [role] [business_line]\n"
            "   e.g. +919812345678 sub_admin\n"
            "        +919812345678 telecaller loans"
        )
        sys.exit(1)
    role_value = sys.argv[2] if len(sys.argv) > 2 else "sub_admin"
    business_line = sys.argv[3] if len(sys.argv) > 3 else None
    asyncio.run(_seed(sys.argv[1], role_value, business_line))


if __name__ == "__main__":
    main()
