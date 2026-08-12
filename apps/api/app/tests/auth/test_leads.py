"""Lead-capture integration tests.

Verifies that only explicit service intent creates a classified lead, that
re-capture is idempotent per line, and that independent line journeys remain
separate.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from conftest import initiate_and_get_otp, unique_email, unique_mobile


async def _leads_for(mobile: str) -> list:
    import app.db.session as _session_mod
    from app.models.lead import Lead

    async with _session_mod.AsyncSessionLocal() as session:
        return list((await session.scalars(select(Lead).where(Lead.mobile == mobile))).all())


async def test_register_initiate_captures_lead_with_name_and_line(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post(
        "/api/v1/auth/register/initiate",
        json={
            "first_name": "Asha",
            "last_name": "Rao",
            "mobile": mobile,
        },
    )
    leads = await _leads_for(mobile)
    assert len(leads) == 1
    assert leads[0].name == "Asha Rao"
    # Profile enrollment remains both-line; omitted intent defaults to Loans for
    # backward-compatible callers.
    assert leads[0].business_line == "loans"
    assert leads[0].status in {"new", "assigned"}


async def test_forgot_initiate_does_not_capture_lead(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert await _leads_for(mobile) == []


async def test_failed_login_attempts_do_not_capture_leads(client: AsyncClient) -> None:
    mobile = unique_mobile()
    for _ in range(3):
        await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    assert await _leads_for(mobile) == []


async def test_register_after_login_creates_classified_lead(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    assert await _leads_for(mobile) == []

    await initiate_and_get_otp(client, mobile, lines=["loans"])
    after = await _leads_for(mobile)
    assert len(after) == 1  # still one lead — enriched, not duplicated
    assert after[0].business_line == "loans"
    assert after[0].name == "Test User"


async def test_capture_keeps_independent_line_journeys(client: AsyncClient) -> None:
    from app.services.leads import capture_lead

    mobile = unique_mobile()
    await capture_lead(mobile, business_line="loans")
    assert (await _leads_for(mobile))[0].business_line == "loans"

    await capture_lead(mobile, business_line="real_estate")
    after = await _leads_for(mobile)
    assert sorted(lead.business_line for lead in after) == ["loans", "real_estate"]


async def test_direct_capture_ignores_active_operational_identity(client: AsyncClient) -> None:
    """Staff and Agents are identities, not customer sales leads."""
    import uuid

    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User
    from app.services.leads import capture_lead

    mobile = unique_mobile()
    async with _session_mod.AsyncSessionLocal() as session:
        user = User(
            first_name="Operations",
            last_name="User",
            mobile=mobile,
            email=unique_email(),
            password_hash="x",
        )
        session.add(user)
        await session.flush()
        session.add(
            StaffProfile(
                auth_user_uuid=user.id,
                role=StaffRole.EMPLOYEE,
                scope=ProfileScope.LINE,
                business_line="loans",
                staff_code=f"EMP-{uuid.uuid4().hex[:8]}",
                status=ProfileStatus.ACTIVE,
            )
        )
        await session.commit()

    assert await capture_lead(mobile, business_line="loans") is True
    assert await _leads_for(mobile) == []


async def test_capture_sets_agent_attribution_on_insert(client: AsyncClient) -> None:
    import uuid

    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User
    from app.services.leads import capture_agent_lead

    # Create an auth_user and agent profile to reference
    agent_uuid = None
    async with _session_mod.AsyncSessionLocal() as session:
        agent_mobile = unique_mobile()
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=agent_mobile,
            email=unique_email(),
            password_hash="dummy_hash",
        )
        session.add(user)
        await session.flush()

        agent = AgentProfile(
            auth_user_uuid=user.id,
            agent_code="AGT" + str(uuid.uuid4().int)[:8],
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)
        agent_uuid = agent.id

    mobile = unique_mobile()
    await capture_agent_lead(
        mobile=mobile,
        name=None,
        business_line="loans",
        agent_profile_uuid=agent_uuid,
        requirement=None,
    )
    lead = (await _leads_for(mobile))[0]
    assert str(lead.origin_agent_profile_uuid) == str(agent_uuid)
    assert lead.origin == "agent"


async def test_capture_keeps_first_set_agent_attribution(client: AsyncClient) -> None:
    """origin_agent_profile_uuid is first-write-wins, same discipline as business_line:
    a second agent introducing the same mobile must not steal attribution."""
    import uuid

    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User
    from app.services.leads import AgentLeadConflict, capture_agent_lead

    # Create two auth_users and agent profiles to reference
    first_agent_uuid = None
    second_agent_uuid = None
    async with _session_mod.AsyncSessionLocal() as session:
        first_agent_mobile = unique_mobile()
        first_user = User(
            first_name="First",
            last_name="Agent",
            mobile=first_agent_mobile,
            email=unique_email(),
            password_hash="dummy_hash",
        )
        session.add(first_user)
        await session.flush()

        second_agent_mobile = unique_mobile()
        second_user = User(
            first_name="Second",
            last_name="Agent",
            mobile=second_agent_mobile,
            email=unique_email(),
            password_hash="dummy_hash",
        )
        session.add(second_user)
        await session.flush()

        first_agent = AgentProfile(
            auth_user_uuid=first_user.id,
            agent_code="AGT" + str(uuid.uuid4().int)[:8],
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        second_agent = AgentProfile(
            auth_user_uuid=second_user.id,
            agent_code="AGT" + str(uuid.uuid4().int)[:8],
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        session.add(first_agent)
        session.add(second_agent)
        await session.commit()
        await session.refresh(first_agent)
        await session.refresh(second_agent)
        first_agent_uuid = first_agent.id
        second_agent_uuid = second_agent.id

    mobile = unique_mobile()
    await capture_agent_lead(
        mobile=mobile,
        name=None,
        business_line="loans",
        agent_profile_uuid=first_agent_uuid,
        requirement=None,
    )
    with pytest.raises(AgentLeadConflict):
        await capture_agent_lead(
            mobile=mobile,
            name=None,
            business_line="loans",
            agent_profile_uuid=second_agent_uuid,
            requirement=None,
        )

    after = await _leads_for(mobile)
    assert len(after) == 1
    assert str(after[0].origin_agent_profile_uuid) == str(first_agent_uuid)


async def test_capture_repeated_none_requirement_stays_null(client: AsyncClient) -> None:
    """Regression for the JSONB none_as_null bug: two sequential captures for the
    same mobile with no requirement passed either time must leave requirement
    as Python None, not corrupt it into
    [None, None] via a spurious jsonb || merge."""
    from app.services.leads import capture_lead

    mobile = unique_mobile()
    await capture_lead(mobile, business_line="loans")
    await capture_lead(mobile, business_line="loans")

    after = await _leads_for(mobile)
    assert len(after) == 1
    assert after[0].requirement is None


async def test_capture_requirement_merge_still_works(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An open unassigned lead merges repeat intent for the same line."""
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)

    mobile = unique_mobile()
    await leads_service.capture_lead(mobile, business_line="loans", requirement={"a": 1})
    await leads_service.capture_lead(mobile, business_line="loans", requirement={"b": 2})

    after = await _leads_for(mobile)
    assert len(after) == 1
    assert after[0].requirement == {"a": 1, "b": 2}
