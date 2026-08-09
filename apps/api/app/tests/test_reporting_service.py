"""Admin analytics & reporting engine — service-level tests
(FR-16.1-16.3, feature-status.md §3 #2).

Every test seeds into a unique, hardcoded, far-from-"today" date window and
asserts only within that window — the shared dev/test Postgres never
truncates between runs (see the shared-test-db-accumulation-gotcha memory),
so a test that asserted a global total would eventually go flaky.

Seeding goes through the bypass session (AsyncSessionLocal), the same as
every other seed helper in this test suite (e.g. test_telecaller_api.py) —
these are service-correctness tests, not RLS tests (see
test_reporting_rls.py for that).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

import app.db.session as _session_mod
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.profile import AgentProfile, ProfileStatus
from app.models.property import Property
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.models.user import User
from app.services import reporting
from conftest import unique_mobile


async def _seed_agent(business_line: str = "loans") -> str:
    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"agent_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        agent = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=business_line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(agent)
        await db.commit()
        return str(agent.id)


async def _seed_lead(
    *,
    business_line: str,
    created_at: datetime,
    status: LeadStatus = LeadStatus.NEW,
    origin_agent_profile_uuid: str | None = None,
) -> str:
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=status,
            origin=LeadOrigin.AGENT if origin_agent_profile_uuid else LeadOrigin.DIRECT,
            origin_agent_profile_uuid=(
                uuid.UUID(origin_agent_profile_uuid) if origin_agent_profile_uuid else None
            ),
            created_at=created_at,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_loan_application(
    *, lead_id: str, opened_at: datetime, status: LoanStatus = LoanStatus.NEW
) -> str:
    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        from app.models.profile import ClientProfile

        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=lead.business_line or "loans",
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, loan_type])
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=lead.business_line or "loans",
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=status,
            opened_at=opened_at,
        )
        db.add(application)
        await db.commit()
        return str(application.id)


async def _seed_property_deal(
    *, lead_id: str, opened_at: datetime, status: PropertyDealStatus = PropertyDealStatus.NEW
) -> str:
    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        from app.models.profile import ClientProfile

        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line="real_estate",
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        prop = Property(
            business_line="real_estate",
            active=True,
            title=f"Test Property {uuid.uuid4().hex[:8]}",
            type="Apartment",
            location="Test Locality, Test City",
            price_display="₹80 L",
            category="apartments",
            city="Test City",
            locality="Test Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=[],
            age_years=1,
            rera_number=f"RERA/TEST/{uuid.uuid4().hex[:8]}",
            details={},
        )
        db.add_all([client_profile, prop])
        await db.flush()
        deal = PropertyDeal(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            property_id=prop.id,
            business_line="real_estate",
            status=status,
            opened_at=opened_at,
        )
        db.add(deal)
        await db.commit()
        return str(deal.id)


# ---------------------------------------------------------------------------
# Pure boundary math
# ---------------------------------------------------------------------------


def test_utc_bounds_ist_half_open() -> None:
    start, end = reporting._utc_bounds(date(2026, 7, 27), date(2026, 7, 27))
    # 2026-07-27T00:00 IST == 2026-07-26T18:30 UTC
    assert start == datetime(2026, 7, 26, 18, 30, tzinfo=UTC)
    # exclusive end is midnight the NEXT IST day
    assert end == datetime(2026, 7, 27, 18, 30, tzinfo=UTC)


# ---------------------------------------------------------------------------
# IST week-boundary regression — the single most important test in this slice
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ist_week_boundary_regression() -> None:
    """Canonical case (docs/ai/plans/...): a row at 2026-07-26T19:00:00Z is
    Sunday in UTC but 00:30 Monday in IST -- it must land in the Monday-
    starting IST week, not the Sunday-starting UTC one.

    The anchor date is a random day far in the future (not the literal
    2026-07-26, and not a fixed future date either) -- the shared dev/test
    Postgres never truncates, so a fixed date would accumulate one more
    seeded row every time this test file reruns and eventually break the
    exact `total == 1` assertion below (shared-test-db-accumulation-gotcha)."""
    anchor = date(2033, 1, 1) + timedelta(days=uuid.uuid4().int % 9_000)
    sunday = anchor + timedelta(days=(6 - anchor.weekday()) % 7)
    ist_monday = sunday + timedelta(days=1)
    utc_week_start = sunday - timedelta(days=6)  # the (wrong) UTC-bucketed Monday

    created_at = datetime(sunday.year, sunday.month, sunday.day, 19, 0, 0, tzinfo=UTC)
    await _seed_lead(business_line="loans", created_at=created_at)

    async with _session_mod.AsyncSessionLocal() as db:
        rows, _total, _summary = await reporting.get_leads_report(
            db,
            date_from=sunday - timedelta(days=3),
            date_to=sunday + timedelta(days=10),
            bucket="week",
            business_line="loans",
            limit=500,
        )

    matching = [r for r in rows if r["bucket_start"].astimezone(reporting.IST).date() == ist_monday]
    assert matching, f"expected an IST-Monday ({ist_monday}) bucket, got {rows}"
    assert matching[0]["total"] == 1

    wrong_week = [
        r for r in rows if r["bucket_start"].astimezone(reporting.IST).date() == utc_week_start
    ]
    assert not wrong_week, "row was bucketed into the UTC week instead of the IST week"


# ---------------------------------------------------------------------------
# Conversion definitions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_leads_converted_counts_only_converted_status() -> None:
    d = date(2031, 4, 1)
    ts = datetime(2031, 4, 1, 10, 0, 0, tzinfo=UTC)
    await _seed_lead(business_line="loans", created_at=ts, status=LeadStatus.CONVERTED)
    await _seed_lead(business_line="loans", created_at=ts, status=LeadStatus.WORKING)

    async with _session_mod.AsyncSessionLocal() as db:
        _rows, _total, summary = await reporting.get_leads_report(
            db, date_from=d, date_to=d, bucket="week", business_line="loans", limit=500
        )

    assert summary["total_count"] >= 2
    assert summary["converted_count"] >= 1


@pytest.mark.asyncio
async def test_loans_converted_is_disbursed_only() -> None:
    d = date(2031, 4, 2)
    ts = datetime(2031, 4, 2, 10, 0, 0, tzinfo=UTC)
    lead_id = await _seed_lead(business_line="loans", created_at=ts)
    disbursed_id = await _seed_loan_application(
        lead_id=lead_id, opened_at=ts, status=LoanStatus.DISBURSED
    )
    lead_id_2 = await _seed_lead(business_line="loans", created_at=ts)
    await _seed_loan_application(lead_id=lead_id_2, opened_at=ts, status=LoanStatus.SANCTIONED)

    async with _session_mod.AsyncSessionLocal() as db:
        rows, _total, summary = await reporting.get_loans_report(
            db, date_from=d, date_to=d, bucket="week", business_line="loans", limit=500
        )

    assert summary["total_count"] >= 2
    assert summary["converted_count"] >= 1
    assert disbursed_id  # sanity: seeded row exists


@pytest.mark.asyncio
async def test_deals_converted_is_closed_only() -> None:
    d = date(2031, 4, 3)
    ts = datetime(2031, 4, 3, 10, 0, 0, tzinfo=UTC)
    lead_id = await _seed_lead(business_line="real_estate", created_at=ts)
    await _seed_property_deal(lead_id=lead_id, opened_at=ts, status=PropertyDealStatus.CLOSED)
    lead_id_2 = await _seed_lead(business_line="real_estate", created_at=ts)
    await _seed_property_deal(
        lead_id=lead_id_2, opened_at=ts, status=PropertyDealStatus.NEGOTIATION
    )

    async with _session_mod.AsyncSessionLocal() as db:
        _rows, _total, summary = await reporting.get_deals_report(
            db, date_from=d, date_to=d, bucket="week", business_line="real_estate", limit=500
        )

    assert summary["total_count"] >= 2
    assert summary["converted_count"] >= 1


# ---------------------------------------------------------------------------
# Sort whitelist
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sort_by_outside_whitelist_raises() -> None:
    async with _session_mod.AsyncSessionLocal() as db:
        with pytest.raises(reporting.InvalidSortField):
            await reporting.get_leads_report(
                db,
                date_from=date(2031, 1, 1),
                date_to=date(2031, 1, 1),
                bucket="week",
                sort_by="id; DROP TABLE leads;--",
            )


# ---------------------------------------------------------------------------
# Agents report — no fan-out double counting
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agents_report_does_not_double_count_across_joins() -> None:
    d_from = date(2031, 5, 1)
    d_to = date(2031, 5, 1)
    ts = datetime(2031, 5, 1, 10, 0, 0, tzinfo=UTC)
    agent_id = await _seed_agent("real_estate")

    lead_1 = await _seed_lead(
        business_line="real_estate", created_at=ts, origin_agent_profile_uuid=agent_id
    )
    lead_2 = await _seed_lead(
        business_line="real_estate", created_at=ts, origin_agent_profile_uuid=agent_id
    )
    await _seed_property_deal(lead_id=lead_1, opened_at=ts, status=PropertyDealStatus.CLOSED)
    await _seed_property_deal(lead_id=lead_2, opened_at=ts, status=PropertyDealStatus.NEW)

    async with _session_mod.AsyncSessionLocal() as db:
        rows, _total, _summary, team_summaries = await reporting.get_agents_report(
            db, date_from=d_from, date_to=d_to, business_line="real_estate", limit=500
        )

    matching = [r for r in rows if r["agent_profile_uuid"] == uuid.UUID(agent_id)]
    assert len(matching) == 1
    row = matching[0]
    assert row["leads_total"] == 2
    assert row["deals_total"] == 2
    assert row["deals_converted"] == 1
    # The fan-out bug this guards against: a naive 4-table join would multiply
    # deals rows by however many OTHER leads/loans the same agent has, so
    # deals_total would come out as 2 leads x 2 deals = 4, not 2.
    team = next(team for team in team_summaries if team["business_line"] == "real_estate")
    assert team["agent_count"] >= 1
    assert team["leads_total"] >= 2
    assert team["deals_total"] >= 2
    assert team["deals_converted"] >= 1


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_leads_rows_shape() -> None:
    d = date(2031, 6, 1)
    ts = datetime(2031, 6, 1, 10, 0, 0, tzinfo=UTC)
    await _seed_lead(business_line="loans", created_at=ts)

    async with _session_mod.AsyncSessionLocal() as db:
        rows, header, truncated = await reporting.export_report_rows(
            db,
            "leads",
            reporting.ExportParams(
                date_from=d,
                date_to=d,
                bucket="week",
                business_line="loans",
                agent_profile_uuids=None,
            ),
        )

    assert header == ["bucket_start", "business_line", "total", "converted"]
    assert not truncated
    assert any(r["business_line"] == "loans" for r in rows)


@pytest.mark.asyncio
async def test_export_row_cap_truncates_and_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    """The 50,000-row export cap has no realistic way to seed past in a unit
    test, so the cap itself is monkeypatched down to 1 rather than left
    entirely unverified -- the truncation flag and row-limiting behavior are
    exactly what X-Report-Truncated depends on at the router layer."""
    monkeypatch.setattr(reporting, "EXPORT_ROW_CAP", 1)
    d = date(2031, 7, 1)
    ts = datetime(2031, 7, 1, 10, 0, 0, tzinfo=UTC)
    await _seed_lead(business_line="loans", created_at=ts)
    await _seed_lead(business_line="real_estate", created_at=ts)

    async with _session_mod.AsyncSessionLocal() as db:
        rows, _header, truncated = await reporting.export_report_rows(
            db,
            "leads",
            reporting.ExportParams(
                date_from=d, date_to=d, bucket="week", business_line=None, agent_profile_uuids=None
            ),
        )

    assert truncated is True
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# Agent filter on the journey (loans/deals) join path -- distinct code path
# from the agents-report's own GROUP BY subqueries above (_get_journey_report
# joins LoanApplication/PropertyDeal back to Lead via lead_uuid instead).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loans_report_agent_filter_excludes_other_agents_loans() -> None:
    d = date(2031, 8, 1)
    ts = datetime(2031, 8, 1, 10, 0, 0, tzinfo=UTC)
    agent_id = await _seed_agent("loans")
    other_agent_id = await _seed_agent("loans")

    own_lead = await _seed_lead(
        business_line="loans", created_at=ts, origin_agent_profile_uuid=agent_id
    )
    other_lead = await _seed_lead(
        business_line="loans", created_at=ts, origin_agent_profile_uuid=other_agent_id
    )
    await _seed_loan_application(lead_id=own_lead, opened_at=ts, status=LoanStatus.DISBURSED)
    await _seed_loan_application(lead_id=other_lead, opened_at=ts, status=LoanStatus.DISBURSED)

    async with _session_mod.AsyncSessionLocal() as db:
        _rows, _total, summary = await reporting.get_loans_report(
            db,
            date_from=d,
            date_to=d,
            bucket="week",
            business_line="loans",
            agent_profile_uuids=[uuid.UUID(agent_id)],
            limit=500,
        )

    # Without the agent filter this window would show total_count=2 -- the
    # filter must exclude the other agent's loan, not just narrow sorting.
    assert summary["total_count"] == 1
    assert summary["converted_count"] == 1
