"""Lead-capture integration tests.

Verifies that every auth entry point persists the mobile to the leads table, that
re-capture is idempotent (partial-unique on active leads), and that a later
registration enriches the existing lead's name/business_line.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

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
            "email": unique_email(),
        },
    )
    leads = await _leads_for(mobile)
    assert len(leads) == 1
    assert leads[0].name == "Asha Rao"
    # Self-registered clients enroll in both lines; the lead is anchored to loans.
    assert leads[0].business_line == "loans"
    assert leads[0].status == "new"


async def test_forgot_initiate_captures_lead(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert len(await _leads_for(mobile)) == 1


async def test_register_initiate_captures_new_mobile_even_on_duplicate_email(
    client: AsyncClient,
) -> None:
    """A brand-new mobile that reuses an existing email 400s — but the number is still
    captured. Guards the invariant that register's lead capture stays IN-LINE: a
    deferred BackgroundTask would be dropped on the raised 400 and lose the prospect."""
    from conftest import full_registration, unique_email

    email = unique_email()
    await full_registration(client, email=email)  # email now taken

    new_mobile = unique_mobile()
    resp = await client.post(
        "/api/v1/auth/register/initiate",
        json={
            "first_name": "Neha",
            "last_name": "Iyer",
            "mobile": new_mobile,
            "email": email,  # collision → 400
        },
    )
    assert resp.status_code == 400
    assert len(await _leads_for(new_mobile)) == 1


async def test_repeated_capture_is_deduped(client: AsyncClient) -> None:
    """Multiple entries for the same mobile keep exactly one active lead."""
    mobile = unique_mobile()
    for _ in range(3):
        await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    assert len(await _leads_for(mobile)) == 1


async def test_capture_enriches_line_on_later_register(client: AsyncClient) -> None:
    """A login (no line) then a register (loans) enriches the same lead's line."""
    mobile = unique_mobile()
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    before = await _leads_for(mobile)
    assert before[0].business_line is None

    await initiate_and_get_otp(client, mobile, lines=["loans"])
    after = await _leads_for(mobile)
    assert len(after) == 1  # still one lead — enriched, not duplicated
    assert after[0].business_line == "loans"
    assert after[0].name == "Test User"


async def test_capture_keeps_first_set_business_line(client: AsyncClient) -> None:
    """business_line is immutable once set: a later capture with a DIFFERENT line
    must not overwrite it (keep-first-set COALESCE). Otherwise the immutability
    trigger rejects the write and, since capture is best-effort/swallowed, the
    re-enquiry is silently lost."""
    from app.services.leads import capture_lead

    mobile = unique_mobile()
    await capture_lead(mobile, business_line="loans")
    assert (await _leads_for(mobile))[0].business_line == "loans"

    # A cross-line re-enquiry must keep the original line, not flip to real_estate.
    await capture_lead(mobile, business_line="real_estate")
    after = await _leads_for(mobile)
    assert len(after) == 1
    assert after[0].business_line == "loans"


async def test_capture_sets_agent_attribution_on_insert(client: AsyncClient) -> None:
    import uuid

    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User
    from app.services.leads import capture_lead

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
    await capture_lead(
        mobile,
        business_line="loans",
        origin="agent",
        origin_agent_profile_uuid=str(agent_uuid),
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
    from app.services.leads import capture_lead

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
    await capture_lead(
        mobile,
        business_line="loans",
        origin="agent",
        origin_agent_profile_uuid=str(first_agent_uuid),
    )
    await capture_lead(
        mobile,
        business_line="loans",
        origin="agent",
        origin_agent_profile_uuid=str(second_agent_uuid),
    )

    after = await _leads_for(mobile)
    assert len(after) == 1
    assert str(after[0].origin_agent_profile_uuid) == str(first_agent_uuid)
