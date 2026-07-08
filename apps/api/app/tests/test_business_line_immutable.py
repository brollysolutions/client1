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
