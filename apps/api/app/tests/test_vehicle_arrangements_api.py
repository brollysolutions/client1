"""End-to-end Client, Admin, and Employee vehicle-arrangement workflow."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.audit_log import AuditAction, AuditLog
from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
from app.models.user import User
from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from conftest import full_registration, unique_mobile


def _visit_payload(*, pickup: bool = True) -> dict:
    payload = {
        "property_ref": "prop-vehicle-1",
        "title": "Lake View Apartment",
        "locality": "Whitefield",
        "city": "Bengaluru",
        "contact_name": "Asha Rao",
        "contact_mobile": "+919876543210",
        "preferred_date": (date.today() + timedelta(days=2)).isoformat(),
        "preferred_time_slot": "morning",
        "pickup_requested": pickup,
    }
    if pickup:
        payload.update(
            pickup_location="MG Road Metro Station",
            pickup_at=(datetime.now(UTC) + timedelta(days=2)).isoformat(),
        )
    return payload


async def _seed_staff(role: StaffRole, business_line: str | None) -> tuple[str, str]:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name=role.value.title(),
            mobile=unique_mobile(),
            email=f"vehicle_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=role,
            scope=ProfileScope.PLATFORM if role == StaffRole.ADMIN else ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"VA-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        token = create_access_token(
            {
                "sub": str(user.id),
                "role": role.value,
                "business_line": business_line,
                "staff_profile_uuid": str(profile.id),
                "platform_scope": "true" if role == StaffRole.ADMIN else "line",
            }
        )
        return token, str(profile.id)


@pytest.mark.asyncio
async def test_client_pickup_create_and_visit_cancel_are_atomic(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["real_estate"])
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/v1/site-visits", headers=headers, json=_visit_payload())
    assert created.status_code == 201, created.text
    arrangement = created.json()["vehicle_arrangement"]
    assert arrangement["status"] == "requested"
    assert arrangement["driver_mobile"] is None

    cancelled = await client.patch(
        f"/api/v1/site-visits/{created.json()['id']}/cancel", headers=headers
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["vehicle_arrangement"]["status"] == "cancelled"

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        stored = await db.get(VehicleArrangement, uuid.UUID(arrangement["id"]))
        assert stored.status == VehicleArrangementStatus.CANCELLED


@pytest.mark.asyncio
async def test_admin_arranges_assigns_and_employee_completes(client: AsyncClient) -> None:
    client_token, _ = await full_registration(client, lines=["real_estate"])
    client_headers = {"Authorization": f"Bearer {client_token}"}
    created = await client.post(
        "/api/v1/site-visits", headers=client_headers, json=_visit_payload()
    )
    arrangement_id = created.json()["vehicle_arrangement"]["id"]

    admin_token, _ = await _seed_staff(StaffRole.ADMIN, None)
    employee_token, employee_profile_id = await _seed_staff(StaffRole.EMPLOYEE, "real_estate")
    other_token, _ = await _seed_staff(StaffRole.EMPLOYEE, "real_estate")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    arranged = await client.patch(
        f"/api/v1/admin/vehicle-arrangements/{arrangement_id}",
        headers=admin_headers,
        json={
            "status": "arranged",
            "vehicle_make_model": "Toyota Innova",
            "vehicle_registration": "KA01AB1234",
            "driver_name": "Ravi Kumar",
            "driver_mobile": "+919876543210",
        },
    )
    assert arranged.status_code == 200, arranged.text

    assigned = await client.patch(
        f"/api/v1/admin/vehicle-arrangements/{arrangement_id}",
        headers=admin_headers,
        json={"status": "assigned", "employee_profile_uuid": employee_profile_id},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["assigned_employee_profile_uuid"] == employee_profile_id

    owner_view = await client.get("/api/v1/site-visits", headers=client_headers)
    assert owner_view.json()["visits"][0]["vehicle_arrangement"]["driver_mobile"]

    employee_view = await client.get(
        "/api/v1/employee/vehicle-arrangements",
        headers={"Authorization": f"Bearer {employee_token}"},
    )
    assert [item["id"] for item in employee_view.json()] == [arrangement_id]
    other_view = await client.get(
        "/api/v1/employee/vehicle-arrangements",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert other_view.json() == []

    completed = await client.patch(
        f"/api/v1/employee/vehicle-arrangements/{arrangement_id}",
        headers={"Authorization": f"Bearer {employee_token}"},
        json={"status": "completed"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        audit_count = len(
            list(
                await db.scalars(
                    select(AuditLog).where(
                        AuditLog.entity_uuid == uuid.UUID(arrangement_id),
                        AuditLog.action == AuditAction.VEHICLE_ARRANGEMENT_UPDATED,
                    )
                )
            )
        )
        assert audit_count == 3


@pytest.mark.asyncio
async def test_admin_cannot_assign_loans_employee(client: AsyncClient) -> None:
    client_token, _ = await full_registration(client, lines=["real_estate"])
    created = await client.post(
        "/api/v1/site-visits",
        headers={"Authorization": f"Bearer {client_token}"},
        json=_visit_payload(),
    )
    arrangement_id = created.json()["vehicle_arrangement"]["id"]
    admin_token, _ = await _seed_staff(StaffRole.ADMIN, None)
    _, loans_employee_id = await _seed_staff(StaffRole.EMPLOYEE, "loans")
    headers = {"Authorization": f"Bearer {admin_token}"}
    arranged = await client.patch(
        f"/api/v1/admin/vehicle-arrangements/{arrangement_id}",
        headers=headers,
        json={
            "status": "arranged",
            "vehicle_make_model": "Toyota Innova",
            "vehicle_registration": "KA01AB1234",
            "driver_name": "Ravi Kumar",
            "driver_mobile": "+919876543210",
        },
    )
    assert arranged.status_code == 200
    assigned = await client.patch(
        f"/api/v1/admin/vehicle-arrangements/{arrangement_id}",
        headers=headers,
        json={"status": "assigned", "employee_profile_uuid": loans_employee_id},
    )
    assert assigned.status_code == 422
