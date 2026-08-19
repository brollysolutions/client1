"""Admin audit log — GET /api/v1/admin/audit-log + the append-only guarantees.

Requires: running Postgres + Redis (docker compose up -d).

Every assertion here is scoped to a freshly-generated `entity_uuid` rather than
counting rows in `audit_log` globally. The test Postgres is shared and never
truncated, so this table accumulates real entries from every other test module
that happens to approve an agent or reject a payout — a bare `count(*)` or a
"first entry in the list" assertion would pass locally today and fail as soon as
another module is added.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.models.audit_log import AuditAction
from app.services.audit_log import AuditDetailRejected, record
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _token(user_id: str, *, role: str = "admin", platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": role, "business_line": "", "platform_scope": platform_scope}
    )


async def _make_staff(client: AsyncClient, *, role: str = "admin") -> tuple[str, str]:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    return _token(uid, role=role), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_entry(
    *,
    actor_uuid: str | None,
    action: AuditAction = AuditAction.ACCOUNT_REMOVED,
    entity_type: str = "auth_user",
    entity_uuid: str | None = None,
    actor_role: str | None = "admin",
    business_line: str | None = None,
    detail: dict | None = None,
) -> str:
    """Write one entry on a bypass (superuser) session, the way a job does."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        entry = await record(
            db,
            action=action,
            entity_type=entity_type,
            entity_uuid=uuid.UUID(entity_uuid) if entity_uuid else None,
            actor_uuid=uuid.UUID(actor_uuid) if actor_uuid else None,
            actor_role=actor_role,
            business_line=business_line,
            detail=detail,
        )
        await db.commit()
        return str(entry.id)


# ---------------------------------------------------------------------------
# Authorization on the read endpoint
# ---------------------------------------------------------------------------


async def test_no_auth_returns_401(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/admin/audit-log")
    assert resp.status_code == 401


async def test_client_forbidden(client: AsyncClient) -> None:
    client_token, _ = await full_registration(client, lines=["loans"])
    resp = await client.get("/api/v1/admin/audit-log", headers=_headers(client_token))
    assert resp.status_code == 403


async def test_sub_admin_forbidden(client: AsyncClient) -> None:
    """Sub Admin is excluded deliberately, unlike most other admin-ish surfaces:
    several audited actions ARE Sub Admin actions (payout maker-checker,
    property-submission review), and an oversight record the overseen party can
    read is a weaker control. This is the test that pins that decision."""
    token, _ = await _make_staff(client, role="sub_admin")
    resp = await client.get("/api/v1/admin/audit-log", headers=_headers(token))
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Append-only guarantees (privilege layer, not application code)
# ---------------------------------------------------------------------------


async def test_api_user_has_no_update_or_delete_privilege() -> None:
    """The append-only guarantee is a GRANT, not a convention. If a future
    migration widens this, the audit trail becomes rewritable and this fails."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text(
                    "SELECT privilege_type FROM information_schema.table_privileges "
                    "WHERE table_name = 'audit_log' AND grantee = 'api_user'"
                )
            )
        ).all()
    granted = {r[0] for r in rows}
    assert granted == {"SELECT", "INSERT"}, f"expected append-only grants, got {granted}"


@pytest.mark.parametrize(
    "statement", ["UPDATE audit_log SET actor_role = 'x'", "DELETE FROM audit_log"]
)
async def test_api_user_cannot_rewrite_history(statement: str) -> None:
    """Belt to the grant assertion's braces: prove the privilege actually bites
    when api_user tries it, rather than trusting the catalog alone."""
    from sqlalchemy.exc import ProgrammingError

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        with pytest.raises(ProgrammingError) as exc:
            await db.execute(text(statement))
        assert "permission denied" in str(exc.value).lower()
        await db.rollback()


async def test_no_write_endpoint_exists(client: AsyncClient) -> None:
    """There is no HTTP write surface at all — an audit log a caller can post to
    is one they can fabricate. 405 (or 404) both prove the route is absent; what
    must never happen is a 2xx."""
    admin_token, _ = await _make_staff(client)
    for method in ("post", "patch", "delete"):
        resp = await getattr(client, method)(
            "/api/v1/admin/audit-log", headers=_headers(admin_token)
        )
        assert resp.status_code in (404, 405), f"{method} unexpectedly reached a handler"


# ---------------------------------------------------------------------------
# RLS: truthful actor, and who may read
# ---------------------------------------------------------------------------


async def test_request_scoped_session_can_insert_own_actor_row(client: AsyncClient) -> None:
    """Regression test for a specific, non-obvious failure mode.

    `audit_log_select` is Admin-only, so if SQLAlchemy ever emits
    `INSERT ... RETURNING` for this model, every non-Admin write (notably
    self-service account deletion, performed by the CLIENT on their own session)
    starts failing the SELECT policy on the returned row. Verified by hand at
    build time — plain INSERT succeeds where INSERT ... RETURNING is rejected —
    but that is a property of the model's client-side defaults, which a future
    column with a server-side default would silently change.
    """
    import app.db.session as _session_mod

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    async with _session_mod.AsyncSessionLocal() as db:
        # Reproduce a request-scoped CLIENT context exactly as core/deps.py does.
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.auth_user_uuid', :u, true), "
                "set_config('app.role', 'client', true), "
                "set_config('app.platform_scope', 'line', true)"
            ),
            {"u": uid},
        )
        entry = await record(
            db,
            action=AuditAction.ACCOUNT_REMOVED,
            entity_type="auth_user",
            entity_uuid=uuid.UUID(uid),
            actor_uuid=uuid.UUID(uid),
            actor_role="client",
            detail={"self_service": True, "reason": None},
        )
        assert entry.id is not None
        await db.commit()


async def test_request_scoped_session_cannot_forge_another_actor(client: AsyncClient) -> None:
    """WITH CHECK pins actor_uuid to the session identity, so a session cannot
    attribute an action to somebody else."""
    from sqlalchemy.exc import ProgrammingError

    import app.db.session as _session_mod

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    other_mobile = unique_mobile()
    await full_registration(client, mobile=other_mobile, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.auth_user_uuid', :u, true), "
                "set_config('app.role', 'client', true), "
                "set_config('app.platform_scope', 'line', true)"
            ),
            {"u": uid},
        )
        with pytest.raises(ProgrammingError) as exc:
            await record(
                db,
                action=AuditAction.ACCOUNT_REMOVED,
                entity_type="auth_user",
                entity_uuid=uuid.UUID(other_uid),
                actor_uuid=uuid.UUID(other_uid),  # not me
                actor_role="client",
            )
        assert "row-level security" in str(exc.value).lower()
        await db.rollback()


async def test_request_scoped_session_cannot_write_a_system_row(client: AsyncClient) -> None:
    """A NULL actor means "the platform did this on a schedule". It must not be
    forgeable from a request — only the RLS-bypassing job session can write one."""
    from sqlalchemy.exc import ProgrammingError

    import app.db.session as _session_mod

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.auth_user_uuid', :u, true), "
                "set_config('app.role', 'admin', true), "
                "set_config('app.platform_scope', 'true', true)"
            ),
            {"u": uid},
        )
        with pytest.raises(ProgrammingError) as exc:
            await record(
                db,
                action=AuditAction.RETENTION_PURGED,
                entity_type="financial_records",
                entity_uuid=None,
                actor_uuid=None,
                actor_role=None,
            )
        assert "row-level security" in str(exc.value).lower()
        await db.rollback()


async def test_non_admin_session_reads_zero_rows(client: AsyncClient) -> None:
    """RLS is the wall behind require_admin: even bypassing the router entirely,
    a client-context session SELECTs nothing — including its own entries."""
    import app.db.session as _session_mod

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    marker = str(uuid.uuid4())
    await _seed_entry(actor_uuid=uid, actor_role="client", entity_uuid=marker)

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL ROLE api_user"))
        await db.execute(
            text(
                "SELECT set_config('app.auth_user_uuid', :u, true), "
                "set_config('app.role', 'client', true), "
                "set_config('app.platform_scope', 'line', true)"
            ),
            {"u": uid},
        )
        found = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE entity_uuid = :e"), {"e": marker}
        )
    assert found == 0


# ---------------------------------------------------------------------------
# Read endpoint behavior
# ---------------------------------------------------------------------------


async def test_admin_reads_a_seeded_entry(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_staff(client)
    marker = str(uuid.uuid4())
    entry_id = await _seed_entry(
        actor_uuid=admin_uid,
        entity_uuid=marker,
        business_line="loans",
        detail={"reason": "spam account", "self_service": False},
    )

    resp = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    (entry,) = body["entries"]
    assert entry["id"] == entry_id
    assert entry["action"] == "account_removed"
    assert entry["entity_type"] == "auth_user"
    assert entry["actor_uuid"] == admin_uid
    assert entry["actor_role"] == "admin"
    assert entry["business_line"] == "loans"
    assert entry["detail"] == {"reason": "spam account", "self_service": False}
    assert entry["actor_name"] is not None


async def test_system_entry_reads_back_with_null_actor(client: AsyncClient) -> None:
    admin_token, _ = await _make_staff(client)
    marker = str(uuid.uuid4())
    await _seed_entry(
        actor_uuid=None,
        actor_role=None,
        action=AuditAction.RETENTION_PURGED,
        entity_type="financial_records",
        entity_uuid=marker,
    )

    resp = await client.get(
        "/api/v1/admin/audit-log", params={"entity_uuid": marker}, headers=_headers(admin_token)
    )
    assert resp.status_code == 200
    (entry,) = resp.json()["entries"]
    assert entry["actor_uuid"] is None
    assert entry["actor_name"] is None
    assert entry["actor_role"] is None


async def test_filter_by_action_excludes_other_actions(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_staff(client)
    marker = str(uuid.uuid4())
    await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, action=AuditAction.AGENT_APPROVED)
    await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, action=AuditAction.AGENT_REJECTED)

    resp = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker, "action": "agent_approved"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["entries"][0]["action"] == "agent_approved"


async def test_filter_by_business_line_excludes_other_lines(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_staff(client)
    marker = str(uuid.uuid4())
    await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, business_line="loans")
    await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, business_line="real_estate")

    resp = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker, "business_line": "loans"},
        headers=_headers(admin_token),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["entries"][0]["business_line"] == "loans"


async def test_filter_by_actor(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_staff(client)
    _, other_uid = await _make_staff(client)
    marker = str(uuid.uuid4())
    await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker)
    await _seed_entry(actor_uuid=other_uid, entity_uuid=marker)

    resp = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker, "actor_uuid": other_uid},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["entries"][0]["actor_uuid"] == other_uid


async def test_ordering_is_newest_first_and_pagination_reports_full_total(
    client: AsyncClient,
) -> None:
    admin_token, admin_uid = await _make_staff(client)
    marker = str(uuid.uuid4())
    first = await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, detail={"seq": 1})
    second = await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, detail={"seq": 2})
    third = await _seed_entry(actor_uuid=admin_uid, entity_uuid=marker, detail={"seq": 3})

    resp = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker, "limit": 2},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200
    body = resp.json()
    # total counts every match, not just this page — the console needs that to
    # decide whether "load more" means anything.
    assert body["total"] == 3
    assert [e["id"] for e in body["entries"]] == [third, second]

    resp2 = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": marker, "limit": 2, "offset": 2},
        headers=_headers(admin_token),
    )
    assert [e["id"] for e in resp2.json()["entries"]] == [first]


async def test_limit_is_bounded(client: AsyncClient) -> None:
    """An unbounded page size on a table that only ever grows is a slow-motion
    outage; 200 is the ceiling."""
    admin_token, _ = await _make_staff(client)
    resp = await client.get(
        "/api/v1/admin/audit-log", params={"limit": 5000}, headers=_headers(admin_token)
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# The PII guard on `detail`
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_key",
    [
        "mobile",
        "recipient_mobile",
        "email",
        "applicant_email",
        "password",
        "access_token",
        "otp",
        "aadhaar_number",
        "pan",
        "kyc_url",
        "monthly_income",
        "address",
    ],
)
async def test_detail_rejects_pii_shaped_keys(bad_key: str) -> None:
    """`detail` is free-form JSONB that Admin reads back in a console, which makes
    it an easy accidental home for exactly what security rules forbid logging.
    Enforced, not merely documented — and substring-matched, so
    `recipient_mobile` is caught as well as `mobile`."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        with pytest.raises(AuditDetailRejected):
            await record(
                db,
                action=AuditAction.ACCOUNT_REMOVED,
                entity_type="auth_user",
                entity_uuid=None,
                actor_uuid=None,
                actor_role=None,
                detail={bad_key: "whatever"},
            )
        await db.rollback()


@pytest.mark.parametrize(
    "innocent_key",
    ["expanded_scope", "company_name", "panel_id", "spans", "tokenized_count_ok"],
)
async def test_detail_does_not_false_positive_on_ordinary_words(innocent_key: str) -> None:
    """The guard matches snake_case TOKENS, not raw substrings. A substring check
    would reject `expanded_scope` and `company_name` because both contain "pan",
    which would make the guard an obstacle rather than a safeguard. Note
    `tokenized_count_ok` is allowed while `access_token` is not: "tokenized" is
    its own token and is not "token"."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        entry = await record(
            db,
            action=AuditAction.STAFF_CREATED,
            entity_type="staff_profile",
            entity_uuid=uuid.uuid4(),
            actor_uuid=None,
            actor_role=None,
            detail={innocent_key: "value"},
        )
        assert entry.id is not None
        await db.rollback()


async def test_detail_allows_ordinary_keys() -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        entry = await record(
            db,
            action=AuditAction.PAYOUT_APPROVED,
            entity_type="payout",
            entity_uuid=uuid.uuid4(),
            actor_uuid=None,
            actor_role=None,
            detail={"amount_paise": 50000, "payout_type": "referral_bonus", "reason": "ok"},
        )
        assert entry.id is not None
        await db.rollback()


# ---------------------------------------------------------------------------
# End-to-end: a real audited action produces a real entry
# ---------------------------------------------------------------------------


async def test_advancing_a_support_ticket_writes_an_audit_entry(client: AsyncClient) -> None:
    """The point of the whole slice: an audited action, taken through the real
    HTTP surface, shows up in the trail attributed to the real actor."""
    import app.db.session as _session_mod
    from app.models.support_ticket import SupportCategory, SupportTicket

    admin_token, admin_uid = await _make_staff(client)
    _, requester_mobile = await full_registration(client, lines=["loans"])
    requester_uid = await _auth_user_uuid(requester_mobile)

    async with _session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=uuid.UUID(requester_uid),
            category=SupportCategory.LOST_MOBILE,
            subject=f"Ticket {uuid.uuid4().hex}",
            body="Lost my phone.",
            status="open",
        )
        db.add(ticket)
        await db.commit()
        ticket_id = str(ticket.id)

    resp = await client.patch(
        f"/api/v1/admin/support-tickets/{ticket_id}",
        json={"status": "in_progress"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200

    feed = await client.get(
        "/api/v1/admin/audit-log",
        params={"entity_uuid": ticket_id, "action": "support_ticket_advanced"},
        headers=_headers(admin_token),
    )
    assert feed.status_code == 200
    body = feed.json()
    assert body["total"] == 1
    (entry,) = body["entries"]
    assert entry["actor_uuid"] == admin_uid
    assert entry["actor_role"] == "admin"
    assert entry["entity_type"] == "support_ticket"
    assert entry["detail"]["from_status"] == "open"
    assert entry["detail"]["to_status"] == "in_progress"
    assert entry["detail"]["category"] == "lost_mobile"
    # The ticket's own free text must not be copied into the audit trail — it is
    # user-authored and can carry the reporter's own PII.
    assert "subject" not in entry["detail"]
    assert "body" not in entry["detail"]


async def test_rolled_back_action_leaves_no_audit_entry() -> None:
    """The reason record() takes the caller's session instead of opening its own:
    an audit row must not be able to outlive the action it claims happened."""
    import app.db.session as _session_mod

    marker = str(uuid.uuid4())
    async with _session_mod.AsyncSessionLocal() as db:
        await record(
            db,
            action=AuditAction.ACCOUNT_REMOVED,
            entity_type="auth_user",
            entity_uuid=uuid.UUID(marker),
            actor_uuid=None,
            actor_role=None,
        )
        await db.rollback()

    async with _session_mod.AsyncSessionLocal() as db:
        found = await db.scalar(
            text("SELECT count(*) FROM audit_log WHERE entity_uuid = :e"), {"e": marker}
        )
    assert found == 0


@pytest.mark.asyncio
async def test_cross_line_action_is_recorded_as_line_neutral() -> None:
    """A cross-line entity must not blow up the audit write.

    Banners and offers may legitimately be `both`
    (ck_banners_business_line_content_audience), but an audit row's line is a
    scope, and ck_audit_log_business_line_optional_operational allows only a
    concrete line or NULL. Callers forward their entity's own column, so
    record() normalizes `both` to NULL -- without that, authoring any
    cross-line banner raised a CheckViolation and surfaced as a 500.
    """
    import app.db.session as _session_mod

    marker = uuid.uuid4()
    async with _session_mod.AsyncSessionLocal() as db:
        entry = await record(
            db,
            action=AuditAction.BANNER_CREATED,
            entity_type="banner",
            entity_uuid=marker,
            actor_uuid=None,
            actor_role=None,
            business_line="both",
        )
        assert entry.business_line is None
        await db.commit()

    async with _session_mod.AsyncSessionLocal() as db:
        stored = await db.scalar(
            text("SELECT business_line FROM audit_log WHERE entity_uuid = :e"), {"e": str(marker)}
        )
        assert stored is None
        await db.execute(text("DELETE FROM audit_log WHERE entity_uuid = :e"), {"e": str(marker)})
        await db.commit()


@pytest.mark.asyncio
async def test_concrete_lines_are_recorded_unchanged() -> None:
    """The normalization above must not touch an ordinary line-scoped entry."""
    import app.db.session as _session_mod

    marker = uuid.uuid4()
    async with _session_mod.AsyncSessionLocal() as db:
        entry = await record(
            db,
            action=AuditAction.BANNER_CREATED,
            entity_type="banner",
            entity_uuid=marker,
            actor_uuid=None,
            actor_role=None,
            business_line="loans",
        )
        assert entry.business_line == "loans"
        await db.execute(text("DELETE FROM audit_log WHERE entity_uuid = :e"), {"e": str(marker)})
        await db.commit()
