"""Read-only Admin view of assigned lead relationships."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import select

    import app.db.session as db_session
    from app.models.user import User

    async with db_session.AsyncSessionLocal() as db:
        return str(await db.scalar(select(User.id).where(User.mobile == mobile)))


def _admin_token(user_id: str) -> str:
    return create_access_token(
        {"sub": user_id, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _seed_assignment() -> tuple[str, str]:
    import app.db.session as db_session
    from app.models.lead import Lead, LeadStatus
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with db_session.AsyncSessionLocal() as db:
        user = User(
            first_name="Assigned",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"assigned-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        telecaller = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(telecaller)
        await db.flush()
        lead = Lead(
            mobile=unique_mobile(),
            name="Customer Relationship",
            business_line="loans",
            status=LeadStatus.ASSIGNED,
            assigned_telecaller_profile_uuid=telecaller.id,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id), str(telecaller.id)


@pytest.mark.asyncio
async def test_admin_assigned_view_exposes_relationship_read_only(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _auth_user_uuid(mobile)
    lead_id, telecaller_id = await _seed_assignment()
    headers = {"Authorization": f"Bearer {_admin_token(user_id)}"}

    response = await client.get("/api/v1/admin/leads/assigned", headers=headers)
    assert response.status_code == 200, response.text
    row = next(item for item in response.json() if item["id"] == lead_id)
    assert row["assigned_telecaller_staff_profile_uuid"] == telecaller_id
    assert row["assigned_telecaller_name"] == "Assigned Telecaller"

    release = await client.post(
        f"/api/v1/admin/leads/{lead_id}/release",
        json={"release_reason": "Admin must remain read-only"},
        headers=headers,
    )
    assert release.status_code == 404
