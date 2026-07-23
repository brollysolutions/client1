"""business_line immutability + perf-index presence tests (audit D2, P-perf2).

The trigger (migration e5f6a7b8c9d0) must reject changing an already-set
business_line on any business-scoped table, while still allowing the first
NULL -> value assignment (lead triage). Runs on the app superuser session, which
bypasses RLS, so it proves the trigger — not a policy — does the enforcing.

Requires the Docker stack with migrations applied; auto-skips without Redis.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import unique_mobile


async def _seed_lead(business_line: str | None) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _update_line(lead_id: str, new_line: str | None) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE leads SET business_line = :bl WHERE id = :id"),
            {"bl": new_line, "id": lead_id},
        )
        await db.commit()


@pytest.mark.asyncio
async def test_null_business_line_can_be_assigned(client: AsyncClient) -> None:
    """Triage: a lead that arrived with no line (login/forgot) can be assigned one."""
    lead_id = await _seed_lead(None)
    await _update_line(lead_id, "loans")  # must not raise

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT business_line FROM leads WHERE id = :id"), {"id": lead_id}
            )
        ).fetchone()
    assert row[0] == "loans"


@pytest.mark.asyncio
async def test_set_business_line_cannot_change(client: AsyncClient) -> None:
    """An already-set business_line cannot be flipped to another line."""
    lead_id = await _seed_lead("loans")
    with pytest.raises(Exception) as exc:  # noqa: B017 — plpgsql check_violation
        await _update_line(lead_id, "real_estate")
    assert "immutable" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_set_business_line_cannot_be_nulled(client: AsyncClient) -> None:
    """value -> NULL is also blocked."""
    lead_id = await _seed_lead("loans")
    with pytest.raises(Exception):  # noqa: B017
        await _update_line(lead_id, None)


@pytest.mark.asyncio
async def test_lead_activity_business_line_cannot_change(client: AsyncClient) -> None:
    """lead_activities (added alongside the Telecaller Dashboard, migration
    d5b6c7a8f9e0) must also reject a business_line change, even on the bypass
    superuser session — the trigger, not RLS, is what binds that path."""
    import uuid

    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.lead_activity import CallDisposition, LeadActivity
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
        staff = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(staff)
        await db.flush()
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=staff.id,
        )
        db.add(lead)
        await db.flush()
        activity = LeadActivity(
            lead_uuid=lead.id,
            telecaller_staff_profile_uuid=staff.id,
            business_line="loans",
            disposition=CallDisposition.CONNECTED,
        )
        db.add(activity)
        await db.commit()
        activity_id = activity.id

    async with _session_mod.AsyncSessionLocal() as db:
        with pytest.raises(Exception) as exc:  # noqa: B017 — plpgsql check_violation
            await db.execute(
                text("UPDATE lead_activities SET business_line = 'real_estate' WHERE id = :id"),
                {"id": activity_id},
            )
            await db.commit()
    assert "immutable" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_perf_indexes_exist(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    expected = {
        "ix_refresh_tokens_token_hash",
        "ix_staff_profiles_auth_user_uuid",
        "ix_agent_profiles_auth_user_uuid",
        "ix_auth_events_auth_user_uuid",
        "ix_agent_applications_applicant_auth_user_uuid",
        "ix_leads_client_profile_uuid",
    }
    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"))
        ).fetchall()
    present = {r[0] for r in rows}
    missing = expected - present
    assert not missing, f"missing perf indexes: {missing}"
