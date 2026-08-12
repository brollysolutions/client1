"""Read-only Admin lead-assignment oversight."""

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


async def _seed_lead(*, mobile: str | None = None) -> str:
    import app.db.session as db_session
    from app.models.lead import Lead, LeadStatus

    async with db_session.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=mobile or unique_mobile(),
            business_line="loans",
            status=LeadStatus.NEW,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_operational_mobile() -> str:
    import app.db.session as db_session
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    mobile = unique_mobile()
    async with db_session.AsyncSessionLocal() as db:
        user = User(
            first_name="Operations",
            last_name="Identity",
            mobile=mobile,
            email=f"ops-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        db.add(
            StaffProfile(
                auth_user_uuid=user.id,
                role=StaffRole.EMPLOYEE,
                scope=ProfileScope.LINE,
                business_line="loans",
                staff_code=f"OPS-{uuid.uuid4().hex[:8]}",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()
    return mobile


@pytest.mark.asyncio
async def test_admin_assignment_route_is_not_exposed(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _auth_user_uuid(mobile)
    lead_id = await _seed_lead()

    response = await client.post(
        f"/api/v1/admin/leads/{lead_id}/assign",
        json={"telecaller_staff_profile_uuid": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {_admin_token(user_id)}"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_queue_excludes_operational_identities(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    user_id = await _auth_user_uuid(mobile)
    customer_lead_id = await _seed_lead()
    operational_lead_id = await _seed_lead(mobile=await _seed_operational_mobile())

    response = await client.get(
        "/api/v1/admin/leads",
        headers={"Authorization": f"Bearer {_admin_token(user_id)}"},
    )
    assert response.status_code == 200, response.text
    ids = {row["id"] for row in response.json()}
    assert customer_lead_id in ids
    assert operational_lead_id not in ids
