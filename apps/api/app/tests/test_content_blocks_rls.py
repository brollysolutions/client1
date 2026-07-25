"""content_blocks RLS — shared sub_admin visibility + narrow positive allowlist.

Verifies migration d7e8f9a0b1c2: sub_admin sees EVERY content block (shared
content-team surface), admin sees every block too (read-only oversight), and every
other role (telecaller/employee/agent/client) sees NOTHING — denial by absence of
a grant, not a filtered policy. Also checks INSERT WITH CHECK (only sub_admin,
only as a fresh draft, only owning their own row) and that UPDATE is rejected for
a non-owner sub_admin — like offers, ownership is the only RLS-enforced axis;
status-direction is app-layer.

Additionally covers the one thing content_blocks does that neither banners nor
offers do: a NULL business_line (cross-line/global content) must be visible and
insertable, and the shared immutability trigger must still refuse to change a
line tag once it is set.

Requires the Docker stack with migrations applied; auto-skips without Redis.
Mirrors test_offers_rls.py's harness.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _unique_slug() -> str:
    return f"block-{uuid.uuid4().hex[:12]}"


async def _seed_block(
    created_by_uuid: str,
    status: str = "draft",
    business_line: str | None = "loans",
) -> str:
    """Insert a content block via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.content_block import ContentBlock

    async with _session_mod.AsyncSessionLocal() as db:
        block = ContentBlock(
            slug=_unique_slug(),
            section="homepage-hero",
            title="Why choose us",
            body="Some marketing copy.",
            business_line=business_line,
            status=status,
            created_by_uuid=uuid.UUID(created_by_uuid),
        )
        db.add(block)
        await db.commit()
        return str(block.id)


def _engine():
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    return create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )


async def _set_context(conn, auth_user_uuid: str, role: str, business_line: str, ps: str) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    await conn.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', :bl, true),"
            "set_config('app.client_profile_uuid', '', true),"
            "set_config('app.agent_profile_uuid', '', true),"
            "set_config('app.staff_profile_uuid', '', true),"
            "set_config('app.platform_scope', :ps, true)"
        ),
        {"uuid": auth_user_uuid, "role": role, "bl": business_line, "ps": ps},
    )


async def _select_as(
    *,
    auth_user_uuid: str = "",
    role: str = "client",
    business_line: str = "",
    platform_scope: str = "false",
) -> list[dict]:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn, auth_user_uuid or str(uuid.uuid4()), role, business_line, platform_scope
            )
            result = await conn.execute(text("SELECT id FROM content_blocks"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sub_admin_sees_every_block_not_just_own(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    block_id = await _seed_block(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid, role="sub_admin", platform_scope="true")
    assert uuid.UUID(block_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_sub_admin_sees_global_null_line_block(client: AsyncClient) -> None:
    """NULL business_line = cross-line/global content — must not be filtered out."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    block_id = await _seed_block(uid, business_line=None)

    rows = await _select_as(auth_user_uuid=uid, role="sub_admin", platform_scope="true")
    assert uuid.UUID(block_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_admin_sees_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    block_id = await _seed_block(uid)

    rows = await _select_as(role="admin", platform_scope="true")
    assert uuid.UUID(block_id) in [r["id"] for r in rows]


@pytest.mark.asyncio
async def test_telecaller_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_block(uid)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_employee_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_block(uid)

    rows = await _select_as(role="employee", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_agent_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_block(uid)

    rows = await _select_as(role="agent", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_plain_client_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_block(uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    rows = await _select_as(auth_user_uuid=other_uid, role="client")
    assert rows == []


@pytest.mark.asyncio
async def test_insert_check_rejects_non_draft_initial_status(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "sub_admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO content_blocks "
                        "(id, slug, section, title, body, status, created_by_uuid) VALUES "
                        "(gen_random_uuid(), :slug, 'homepage-hero', 'Sneaky live copy', "
                        "'body', 'published', :uuid)"
                    ),
                    {"uuid": uid, "slug": _unique_slug()},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_insert_check_rejects_foreign_creator(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "sub_admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO content_blocks "
                        "(id, slug, section, title, body, status, created_by_uuid) VALUES "
                        "(gen_random_uuid(), :slug, 'homepage-hero', 'Spoofed owner', "
                        "'body', 'draft', gen_random_uuid())"
                    ),
                    {"slug": _unique_slug()},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_insert_rejected_for_non_sub_admin(client: AsyncClient) -> None:
    """Denial by absence: an admin has SELECT oversight but no INSERT policy."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
                await conn.execute(
                    text(
                        "INSERT INTO content_blocks "
                        "(id, slug, section, title, body, status, created_by_uuid) VALUES "
                        "(gen_random_uuid(), :slug, 'homepage-hero', 'Admin-authored', "
                        "'body', 'draft', :uuid)"
                    ),
                    {"uuid": uid, "slug": _unique_slug()},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_update_rejected_for_non_owner(client: AsyncClient) -> None:
    """Ownership is the only RLS-enforced write axis (same as offers)."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    block_id = await _seed_block(owner_uid)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, other_uid, "sub_admin", "both", "true")
            result = await conn.execute(
                text("UPDATE content_blocks SET title = 'Hijacked' WHERE id = :id"),
                {"id": block_id},
            )
            # RLS USING clause excludes the row (not the owner) — zero-row no-op.
            assert result.rowcount == 0
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_business_line_immutable_once_set(client: AsyncClient) -> None:
    """The shared trigger is attached even though the column is nullable: a global
    block may be line-tagged once, but a tagged block can never be re-tagged."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    block_id = await _seed_block(uid, business_line="loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, uid, "sub_admin", "both", "true")
            with pytest.raises(Exception):  # noqa: B017 — trigger check_violation
                await conn.execute(
                    text("UPDATE content_blocks SET business_line = 'real_estate' WHERE id = :id"),
                    {"id": block_id},
                )
    finally:
        await engine.dispose()
