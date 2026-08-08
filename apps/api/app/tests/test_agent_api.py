"""Agent API — home summary, lead introduction/tracking (Agent Dashboard slice 1).

Mints an agent access token for an already-registered auth_user (same pattern
as test_telecaller_api.py) with a real AgentProfile id in the
agent_profile_uuid claim, since the agent endpoints/RLS key off it.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.security import create_access_token
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from conftest import full_registration, unique_mobile


@pytest_asyncio.fixture(autouse=True)
async def _isolate_eligible_telecallers() -> AsyncIterator[None]:
    """Keep pre-existing integration data from changing Agent API outcomes."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        previously_active = set(
            (
                await db.scalars(
                    select(StaffProfile.id).where(
                        StaffProfile.role == StaffRole.TELECALLER,
                        StaffProfile.status == ProfileStatus.ACTIVE,
                    )
                )
            ).all()
        )
        await db.execute(
            update(StaffProfile)
            .where(StaffProfile.role == StaffRole.TELECALLER)
            .values(status=ProfileStatus.INACTIVE)
        )
        await db.commit()
    try:
        yield
    finally:
        async with _session_mod.AsyncSessionLocal() as db:
            await db.execute(
                update(StaffProfile)
                .where(StaffProfile.role == StaffRole.TELECALLER)
                .values(status=ProfileStatus.INACTIVE)
            )
            if previously_active:
                await db.execute(
                    update(StaffProfile)
                    .where(StaffProfile.id.in_(previously_active))
                    .values(status=ProfileStatus.ACTIVE)
                )
            await db.commit()


async def _auth_user_uuid(mobile: str) -> str:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _seed_agent(business_line: str = "loans") -> tuple[str, str]:
    """Create an auth_user + AgentProfile. Returns (auth_user_uuid, agent_profile_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"ag_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


def _agent_token(auth_user_uuid: str, agent_profile_uuid: str, business_line: str = "loans") -> str:
    return create_access_token(
        {
            "sub": auth_user_uuid,
            "role": "agent",
            "business_line": business_line,
            "agent_profile_uuid": agent_profile_uuid,
            "platform_scope": "false",
        }
    )


async def _seed_telecaller_staff_profile(business_line: str = "loans") -> str:
    """Insert a StaffProfile (role=telecaller) via the app superuser. Returns its
    id. Needed because leads.assigned_telecaller_profile_uuid has a real FK to
    staff_profiles.id — a bare random UUID violates it on insert."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _assign_to_telecaller(lead_id: str) -> None:
    """Simulate a telecaller pickup via the bypass session (mirrors what
    services.leads.assign_lead_to_telecaller does), using a real StaffProfile
    since assigned_telecaller_profile_uuid has a real FK to staff_profiles.id."""
    from sqlalchemy import text

    import app.db.session as _session_mod

    staff_uuid = await _seed_telecaller_staff_profile("loans")
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE leads SET assigned_telecaller_profile_uuid = :sid, status = 'assigned' "
                "WHERE id = :id"
            ),
            {"sid": staff_uuid, "id": lead_id},
        )
        await db.commit()


@pytest.mark.asyncio
async def test_home_summary(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    await client.post(
        "/api/v1/agent/leads",
        json={"mobile": unique_mobile(), "name": "Ravi"},
        headers={"Authorization": f"Bearer {token}"},
    )
    res = await client.get("/api/v1/agent/home", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["profile"]["agent_code"]
    assert body["counts_by_status"].get("new") == 1


@pytest.mark.asyncio
async def test_introduce_lead_success(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    mobile = unique_mobile()
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "Ravi", "requirement": {"notes": "Home loan"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["mobile"] == mobile
    assert body["registered"] is False
    assert body["status"] == "new"
    assert body["expired_at"] is None
    deadline = datetime.fromisoformat(body["expires_at"])
    expected = datetime.now(UTC) + timedelta(days=30)
    assert abs((deadline - expected).total_seconds()) < 10


@pytest.mark.asyncio
async def test_introduce_lead_idempotent(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    mobile = unique_mobile()
    headers = {"Authorization": f"Bearer {token}"}
    first = await client.post("/api/v1/agent/leads", json={"mobile": mobile}, headers=headers)
    await client.post(
        "/api/v1/agent/leads", json={"mobile": mobile, "name": "Ravi"}, headers=headers
    )

    res = await client.get("/api/v1/agent/leads", headers=headers)
    assert res.status_code == 200, res.text
    matches = [row for row in res.json() if row["mobile"] == mobile]
    assert len(matches) == 1
    assert matches[0]["name"] == "Ravi"
    assert matches[0]["expires_at"] == first.json()["expires_at"]


@pytest.mark.asyncio
async def test_due_lead_is_read_only_before_scheduler_marks_it_expired(
    client: AsyncClient,
) -> None:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    auth_uuid, agent_uuid = await _seed_agent("loans")
    headers = {"Authorization": f"Bearer {_agent_token(auth_uuid, agent_uuid)}"}
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=uuid.UUID(agent_uuid),
            status=LeadStatus.NEW,
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        db.add(lead)
        await db.commit()
        lead_id = str(lead.id)

    detail = await client.get(f"/api/v1/agent/leads/{lead_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "new"
    assert detail.json()["editable"] is False

    update = await client.patch(
        f"/api/v1/agent/leads/{lead_id}", json={"name": "Too late"}, headers=headers
    )
    assert update.status_code == 409

    # The capture transaction rechecks the reached deadline while holding the
    # mobile advisory lock, so a retry cannot restart the Agent window.
    reintroduce = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": detail.json()["mobile"], "name": "Restarted"},
        headers=headers,
    )
    assert reintroduce.status_code == 409

    async with _session_mod.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, uuid.UUID(lead_id))
        assert refreshed.name is None


@pytest.mark.asyncio
async def test_expired_lead_is_history_only_and_cannot_restart_clock(client: AsyncClient) -> None:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    mobile = unique_mobile()
    now = datetime.now(UTC)
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=mobile,
            business_line="loans",
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=uuid.UUID(agent_uuid),
            status=LeadStatus.RELEASED,
            expires_at=now - timedelta(minutes=1),
            agent_expired_at=now,
            released_at=now,
            release_reason="Agent ownership window expired.",
        )
        db.add(lead)
        await db.commit()
        lead_id = str(lead.id)

    detail = await client.get(f"/api/v1/agent/leads/{lead_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "expired"
    assert detail.json()["editable"] is False
    assert detail.json()["expired_at"] is not None

    update = await client.patch(
        f"/api/v1/agent/leads/{lead_id}",
        json={"name": "Restarted"},
        headers=headers,
    )
    assert update.status_code == 409

    reintroduce = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "Restarted"},
        headers=headers,
    )
    assert reintroduce.status_code == 409

    other_auth_uuid, other_agent_uuid = await _seed_agent("loans")
    other_attempt = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "Different Agent"},
        headers={"Authorization": f"Bearer {_agent_token(other_auth_uuid, other_agent_uuid)}"},
    )
    assert other_attempt.status_code == 409

    filtered = await client.get("/api/v1/agent/leads?status_filter=expired", headers=headers)
    assert filtered.status_code == 200, filtered.text
    assert [row["id"] for row in filtered.json()] == [lead_id]

    home = await client.get("/api/v1/agent/home", headers=headers)
    assert home.status_code == 200, home.text
    assert home.json()["counts_by_status"]["expired"] == 1


@pytest.mark.asyncio
async def test_introduce_lead_cross_line_conflict_is_409(client: AsyncClient) -> None:
    """A mobile already active on the OTHER business line must not be claimable."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    mobile = unique_mobile()
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=mobile,
                business_line="real_estate",
                status=LeadStatus.NEW,
                origin=LeadOrigin.DIRECT,
            )
        )
        await db.commit()

    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_introduce_lead_same_line_different_agent_conflict_is_409(
    client: AsyncClient,
) -> None:
    """A mobile already attributed to a DIFFERENT agent on the SAME business line must
    also be unclaimable (first-write-wins per capture_lead's COALESCE) — and the
    generalized 409 message must not reveal which case (cross-line vs. cross-agent)
    is actually blocking the second agent."""
    first_auth_uuid, first_agent_uuid = await _seed_agent("loans")
    first_token = _agent_token(first_auth_uuid, first_agent_uuid)
    mobile = unique_mobile()
    first_res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert first_res.status_code == 201, first_res.text

    second_auth_uuid, second_agent_uuid = await _seed_agent("loans")
    second_token = _agent_token(second_auth_uuid, second_agent_uuid)
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "This mobile number is already linked to an existing enquiry."


@pytest.mark.asyncio
async def test_introduce_lead_cannot_mutate_assigned_cross_line_lead(client: AsyncClient) -> None:
    """A real_estate lead already assigned to a telecaller must survive a loans
    agent's introduce-lead call for the same mobile byte-for-byte — not just
    return 409, but leave name/requirement/assignment untouched."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    mobile = unique_mobile()
    telecaller_uuid = await _seed_telecaller_staff_profile("real_estate")
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=mobile,
            business_line="real_estate",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            name="Original Name",
            requirement={"k": "orig"},
            assigned_telecaller_profile_uuid=telecaller_uuid,
        )
        db.add(lead)
        await db.commit()
        lead_id = lead.id

    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "HIJACKED", "requirement": {"injected": "yes"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 409

    async with _session_mod.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, lead_id)
        assert refreshed.name == "Original Name"
        assert refreshed.requirement == {"k": "orig"}
        assert refreshed.status == LeadStatus.ASSIGNED
        assert str(refreshed.assigned_telecaller_profile_uuid) == telecaller_uuid


@pytest.mark.asyncio
async def test_introduce_lead_cannot_mutate_assigned_same_line_lead(client: AsyncClient) -> None:
    """A same-line lead already assigned to a telecaller must survive an
    unrelated agent's introduce-lead call for the same mobile untouched."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    mobile = unique_mobile()
    telecaller_uuid = await _seed_telecaller_staff_profile("loans")
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=mobile,
            business_line="loans",
            status=LeadStatus.WORKING,
            origin=LeadOrigin.DIRECT,
            name="Original Name",
            requirement={"income": "90000"},
            assigned_telecaller_profile_uuid=telecaller_uuid,
        )
        db.add(lead)
        await db.commit()
        lead_id = lead.id

    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "CLAIMED BY AGENT", "requirement": {"note": "mine now"}},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 409

    async with _session_mod.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, lead_id)
        assert refreshed.name == "Original Name"
        assert refreshed.requirement == {"income": "90000"}
        assert refreshed.status == LeadStatus.WORKING
        assert refreshed.origin_agent_profile_uuid is None


@pytest.mark.asyncio
async def test_introduce_lead_cannot_steal_other_agents_unassigned_lead(
    client: AsyncClient,
) -> None:
    """An unassigned lead already attributed to a DIFFERENT agent on the same
    line must keep its name/requirement/attribution after a second agent's
    introduce-lead call for the same mobile."""
    first_auth_uuid, first_agent_uuid = await _seed_agent("loans")
    first_token = _agent_token(first_auth_uuid, first_agent_uuid)
    mobile = unique_mobile()
    first_res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "First Agent's Lead", "requirement": {"k": "first"}},
        headers={"Authorization": f"Bearer {first_token}"},
    )
    assert first_res.status_code == 201, first_res.text
    lead_id = first_res.json()["id"]

    second_auth_uuid, second_agent_uuid = await _seed_agent("loans")
    second_token = _agent_token(second_auth_uuid, second_agent_uuid)
    res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": mobile, "name": "STOLEN", "requirement": {"injected": "yes"}},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert res.status_code == 409

    import app.db.session as _session_mod
    from app.models.lead import Lead

    async with _session_mod.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, uuid.UUID(lead_id))
        assert refreshed.name == "First Agent's Lead"
        assert refreshed.requirement == {"k": "first"}
        assert str(refreshed.origin_agent_profile_uuid) == first_agent_uuid


@pytest.mark.asyncio
async def test_lead_read_editable_reflects_assignment(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    create_res = await client.post(
        "/api/v1/agent/leads", json={"mobile": unique_mobile()}, headers=headers
    )
    lead_id = create_res.json()["id"]
    assert create_res.json()["editable"] is True

    await _assign_to_telecaller(lead_id)

    get_res = await client.get(f"/api/v1/agent/leads/{lead_id}", headers=headers)
    assert get_res.json()["editable"] is False


@pytest.mark.asyncio
async def test_list_leads_returns_own(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    create_res = await client.post(
        "/api/v1/agent/leads", json={"mobile": unique_mobile()}, headers=headers
    )
    lead_id = create_res.json()["id"]

    res = await client.get("/api/v1/agent/leads", headers=headers)
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert lead_id in ids


@pytest.mark.asyncio
async def test_get_lead_not_owned_is_404(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    other_auth_uuid, other_agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    other_token = _agent_token(other_auth_uuid, other_agent_uuid)

    create_res = await client.post(
        "/api/v1/agent/leads",
        json={"mobile": unique_mobile()},
        headers={"Authorization": f"Bearer {token}"},
    )
    lead_id = create_res.json()["id"]

    res = await client.get(
        f"/api/v1/agent/leads/{lead_id}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_lead_success_when_unassigned(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    create_res = await client.post(
        "/api/v1/agent/leads", json={"mobile": unique_mobile()}, headers=headers
    )
    lead_id = create_res.json()["id"]

    res = await client.patch(
        f"/api/v1/agent/leads/{lead_id}",
        json={"requirement": {"notes": "Wants a used car."}},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["requirement"]["notes"] == "Wants a used car."


@pytest.mark.asyncio
async def test_patch_lead_empty_payload_rejected(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    create_res = await client.post(
        "/api/v1/agent/leads", json={"mobile": unique_mobile()}, headers=headers
    )
    lead_id = create_res.json()["id"]

    res = await client.patch(f"/api/v1/agent/leads/{lead_id}", json={}, headers=headers)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_lead_locked_after_assignment_is_409(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)
    headers = {"Authorization": f"Bearer {token}"}
    create_res = await client.post(
        "/api/v1/agent/leads", json={"mobile": unique_mobile()}, headers=headers
    )
    lead_id = create_res.json()["id"]

    await _assign_to_telecaller(lead_id)

    res = await client.patch(
        f"/api/v1/agent/leads/{lead_id}",
        json={"requirement": {"notes": "Too late."}},
        headers=headers,
    )
    assert res.status_code == 409

    # Still visible (read-only), just not writable.
    get_res = await client.get(f"/api/v1/agent/leads/{lead_id}", headers=headers)
    assert get_res.status_code == 200, get_res.text
    assert get_res.json()["status"] == "assigned"


@pytest.mark.asyncio
async def test_list_leads_invalid_status_filter_is_422(client: AsyncClient) -> None:
    auth_uuid, agent_uuid = await _seed_agent("loans")
    token = _agent_token(auth_uuid, agent_uuid)

    res = await client.get(
        "/api/v1/agent/leads?status_filter=bogus",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_non_agent_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get("/api/v1/agent/leads", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/agent/leads")
    assert res.status_code == 401
