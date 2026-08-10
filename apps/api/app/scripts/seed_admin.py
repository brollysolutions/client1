"""Bootstrap the first platform Admin account (dev/staging only).

Unlike seed_staff.py (which requires an already-registered account), this creates
the auth_user if the mobile is new — there is no self-signup path for staff, so
something has to create the very first admin. Sets a temp password and
PENDING_PASSWORD_RESET so the existing unified /login forced-reset flow (Auth
Design §6.2) takes over from there:

    docker exec mahesh-client-project-api-1 \\
        uv run python -m app.scripts.seed_admin +919812345678 admin@example.com

Admin is PLATFORM-scoped with business_line=None (bypasses the RLS line filter) —
do NOT hardcode a business_line the way seed_staff.py does for sub_admin/telecaller.
Inserts through AsyncSessionLocal as the `app` superuser (bypasses RLS). Idempotent:
skips if the account already has an ACTIVE admin staff profile. Production
provisioning is out-of-band at deployment (Auth Design §3), never a seed script.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime


async def _seed(mobile: str, email: str) -> None:
    import app.db.session as session_mod
    from app.core.security import generate_profile_code, generate_temp_password, hash_password
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User, UserStatus

    async with session_mod.AsyncSessionLocal() as db:
        from sqlalchemy import select

        user = await db.scalar(select(User).where(User.mobile == mobile))

        if user is not None:
            existing = await db.scalar(
                select(StaffProfile).where(
                    StaffProfile.auth_user_uuid == user.id,
                    StaffProfile.role == StaffRole.ADMIN,
                    StaffProfile.status == ProfileStatus.ACTIVE,
                )
            )
            if existing is not None and not existing.is_primary_admin:
                primary_exists = await db.scalar(
                    select(StaffProfile.id).where(StaffProfile.is_primary_admin.is_(True))
                )
                if primary_exists is None:
                    existing.is_primary_admin = True
                    await db.commit()
                    print(f"[seed_admin] Promoted {mobile} to Main Admin.")
                    return
            if existing is not None:
                print(f"[seed_admin] {mobile} is already an active admin — skipping.")
                return

        if user is None:
            email_taken = await db.scalar(select(User).where(User.email == email))
            if email_taken is not None:
                print(f"[seed_admin] Email {email} is already registered to another account.")
                return

        temp_password = generate_temp_password(mobile)

        if user is None:
            user = User(
                first_name="Platform",
                last_name="Admin",
                mobile=mobile,
                email=email,
                password_hash=await hash_password(temp_password),
                status=UserStatus.PENDING_PASSWORD_RESET,
                phone_verified_at=datetime.now(UTC),
            )
            db.add(user)
            await db.flush()
        else:
            user.password_hash = await hash_password(temp_password)
            user.status = UserStatus.PENDING_PASSWORD_RESET

        primary_exists = await db.scalar(
            select(StaffProfile.id).where(StaffProfile.is_primary_admin.is_(True))
        )
        db.add(
            StaffProfile(
                auth_user_uuid=user.id,
                role=StaffRole.ADMIN,
                scope=ProfileScope.PLATFORM,
                business_line=None,
                staff_code=generate_profile_code("admin", user.first_name),
                status=ProfileStatus.ACTIVE,
                is_primary_admin=primary_exists is None,
            )
        )
        await db.commit()
        print(f"[seed_admin] Admin created for {mobile}.")
        print(f"[seed_admin] Temp password (shown once): {temp_password}")
        print("[seed_admin] Log in at /login — first login forces a password reset.")


def main() -> None:
    if len(sys.argv) < 3:
        print(
            "Usage: python -m app.scripts.seed_admin <mobile-e164> <email>"
            "   e.g. +919812345678 admin@example.com"
        )
        sys.exit(1)
    asyncio.run(_seed(sys.argv[1], sys.argv[2]))


if __name__ == "__main__":
    main()
