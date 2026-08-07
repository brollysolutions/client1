"""Admin analytics & reporting API — authz, streaming export, and the
platform-scope guard finding (FR-16.1-16.3, feature-status.md §3 #2).

Mirrors test_loan_config_api.py's own-fixtures-per-test shape: every test
mints its own token, and every seeded row lives in a unique, far-future date
window so no test's total can be polluted by another test's rows (or by
unrelated seed data accumulated in the shared dev/test Postgres across runs).
"""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _line_scoped_admin_token(uid: str) -> str:
    """A role=admin token that is NOT platform-scoped -- the finding this
    slice is built around. deps.require_admin alone would accept this."""
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "loans", "platform_scope": "false"}
    )


def _client_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


def _agent_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "agent", "business_line": "loans", "platform_scope": "false"}
    )


def _telecaller_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )


def _employee_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "employee", "business_line": "loans", "platform_scope": "false"}
    )


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    return {"Authorization": f"Bearer {_admin_token(uid)}"}


async def _seed_lead(*, business_line: str | None, created_at: datetime) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            origin=LeadOrigin.DIRECT,
            created_at=created_at,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


# ---------------------------------------------------------------------------
# Authz matrix
# ---------------------------------------------------------------------------

_ROUTES = [
    "/api/v1/admin/reports/leads",
    "/api/v1/admin/reports/loans",
    "/api/v1/admin/reports/deals",
    "/api/v1/admin/reports/agents",
]

_QS = "?date_from=2032-01-01&date_to=2032-01-07"


def test_xlsx_writer_keeps_formula_like_text_literal() -> None:
    """A unit-level guard that runs without Postgres as well as the route test.

    XlsxWriter treats a string written through `write()` as a formula by
    default. The export writer must use literal-string cells so a user name
    cannot become an executable workbook formula.
    """
    from app.api.v1.reporting import _xlsx_response

    response = _xlsx_response(
        [{"agent_name": "=1+1", "total": 2}], ["agent_name", "total"], False, "report.xlsx"
    )
    with zipfile.ZipFile(io.BytesIO(response.body)) as workbook:
        contents = b"".join(workbook.read(name) for name in workbook.namelist())

    assert b"<f>" not in contents
    assert b"'=1+1" in contents


@pytest.mark.asyncio
async def test_all_report_routes_return_200_for_admin(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    for route in _ROUTES:
        res = await client.get(f"{route}{_QS}", headers=headers)
        assert res.status_code == 200, f"{route}: {res.text}"
        body = res.json()
        assert "rows" in body and "total" in body and "summary" in body


@pytest.mark.asyncio
async def test_all_report_routes_403_for_client(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_client_token(uid)}"}
    for route in _ROUTES:
        res = await client.get(f"{route}{_QS}", headers=headers)
        assert res.status_code == 403, f"{route}: {res.text}"


@pytest.mark.asyncio
async def test_all_report_routes_403_for_sub_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    for route in _ROUTES:
        res = await client.get(f"{route}{_QS}", headers=headers)
        assert res.status_code == 403, f"{route}: {res.text}"


@pytest.mark.asyncio
async def test_all_report_routes_403_for_agent_telecaller_employee(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    for token_fn in (_agent_token, _telecaller_token, _employee_token):
        headers = {"Authorization": f"Bearer {token_fn(uid)}"}
        for route in _ROUTES:
            res = await client.get(f"{route}{_QS}", headers=headers)
            assert res.status_code == 403, f"{token_fn.__name__} {route}: {res.text}"


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get(f"/api/v1/admin/reports/leads{_QS}")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_line_scoped_admin_rejected(client: AsyncClient) -> None:
    """The finding this slice is built around: role=admin with
    platform_scope=false must NOT pass -- deps.require_admin alone would let
    it through and return a silently partial (line-filtered) result."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_line_scoped_admin_token(uid)}"}
    for route in _ROUTES:
        res = await client.get(f"{route}{_QS}", headers=headers)
        assert res.status_code == 403, f"{route}: {res.text}"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_date_from_after_date_to_422(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    res = await client.get(
        "/api/v1/admin/reports/leads?date_from=2032-02-01&date_to=2032-01-01", headers=headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_sort_by_invalid_field_422(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    res = await client.get(
        f"/api/v1/admin/reports/leads{_QS}&sort_by=not_a_real_column", headers=headers
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# NULL business_line -> unassigned
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unassigned_leads_group_via_api(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    d = date(2032, 3, 15)
    await _seed_lead(business_line=None, created_at=datetime(2032, 3, 15, 8, 0, tzinfo=UTC))

    res = await client.get(
        f"/api/v1/admin/reports/leads?date_from={d}&date_to={d}", headers=headers
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert any(r["business_line"] == "unassigned" for r in body["rows"])


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_export_leads_csv_shape(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    d = date(2032, 4, 20)
    await _seed_lead(business_line="loans", created_at=datetime(2032, 4, 20, 8, 0, tzinfo=UTC))

    res = await client.get(
        f"/api/v1/admin/reports/leads/export?date_from={d}&date_to={d}&business_line=loans",
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    assert f"leads-loans-{d}_{d}.csv" in res.headers["content-disposition"]
    assert res.headers.get("x-report-truncated") is None

    raw = res.content
    assert raw[:3] == b"\xef\xbb\xbf"  # UTF-8 BOM
    text_body = raw.decode("utf-8-sig")
    lines = [line for line in text_body.splitlines() if line]
    assert lines[0] == "bucket_start,business_line,total,converted"
    # httpx fully drains the StreamingResponse -- this also proves the
    # generator never touched a torn-down session (the fetch-then-format guard).
    assert len(lines) >= 2


@pytest.mark.asyncio
async def test_export_leads_xlsx_shape(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    d = date(2032, 4, 21)
    await _seed_lead(business_line="loans", created_at=datetime(2032, 4, 21, 8, 0, tzinfo=UTC))

    res = await client.get(
        f"/api/v1/admin/reports/leads/export.xlsx?date_from={d}&date_to={d}&business_line=loans",
        headers=headers,
    )

    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert f"leads-loans-{d}_{d}.xlsx" in res.headers["content-disposition"]
    with zipfile.ZipFile(io.BytesIO(res.content)) as workbook:
        assert "xl/workbook.xml" in workbook.namelist()
        assert b"bucket_start" in b"".join(workbook.read(name) for name in workbook.namelist())


async def _seed_agent_with_name(first_name: str, business_line: str = "loans") -> str:
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name=first_name,
            last_name="Test",
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


@pytest.mark.asyncio
async def test_export_agents_csv_escapes_formula_leading_name(client: AsyncClient) -> None:
    """CSV/formula-injection guard: an agent's first_name is free text they
    supply themselves at registration, not the admin who later opens this
    export in Excel. A name starting with '=' must render as inert text, not
    a live formula."""
    headers = await _admin_headers(client)
    d = date(2032, 5, 10)
    await _seed_agent_with_name('=1+1")+cmd|"/c calc"!A1', business_line="loans")

    res = await client.get(
        f"/api/v1/admin/reports/agents/export?date_from={d}&date_to={d}&business_line=loans",
        headers=headers,
    )
    assert res.status_code == 200, res.text
    text_body = res.content.decode("utf-8-sig")
    assert '="1+1' not in text_body  # never an unescaped raw formula
    assert "'=1+1" in text_body  # leading single-quote neutralizes it


@pytest.mark.asyncio
async def test_export_agents_xlsx_neutralizes_formula_leading_name(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    d = date(2032, 5, 11)
    await _seed_agent_with_name('=1+1")+cmd|"/c calc"!A1', business_line="loans")

    res = await client.get(
        f"/api/v1/admin/reports/agents/export.xlsx?date_from={d}&date_to={d}&business_line=loans",
        headers=headers,
    )

    assert res.status_code == 200, res.text
    with zipfile.ZipFile(io.BytesIO(res.content)) as workbook:
        contents = b"".join(workbook.read(name) for name in workbook.namelist())
    assert b"<f>" not in contents
    assert b"'=1+1" in contents


@pytest.mark.asyncio
async def test_export_forbidden_for_non_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_client_token(uid)}"}
    res = await client.get(f"/api/v1/admin/reports/leads/export{_QS}", headers=headers)
    assert res.status_code == 403
