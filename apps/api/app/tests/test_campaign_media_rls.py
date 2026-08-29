"""Campaign Media Library RLS keeps the catalogue Sub Admin-only.

The API dependency is not the authorization boundary by itself. These checks use
the application database role directly to prove that platform Admin and Client
sessions cannot read or mutate catalogue rows, while a platform-scoped Sub
Admin can use the shared library.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT id FROM auth_users WHERE mobile = :mobile"),
                {"mobile": mobile},
            )
        ).fetchone()
        assert row is not None
        return str(row[0])


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


async def _set_context(conn, *, auth_user_uuid: str, role: str, platform_scope: str) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    await conn.execute(
        text(
            "SELECT set_config('app.auth_user_uuid', :uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', 'both', true),"
            "set_config('app.client_profile_uuid', '', true),"
            "set_config('app.agent_profile_uuid', '', true),"
            "set_config('app.staff_profile_uuid', '', true),"
            "set_config('app.platform_scope', :scope, true)"
        ),
        {"uuid": auth_user_uuid, "role": role, "scope": platform_scope},
    )


@pytest.mark.asyncio
async def test_campaign_media_rows_are_visible_only_to_sub_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    user_uuid = await _auth_user_uuid(mobile)
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                auth_user_uuid=user_uuid,
                role="sub_admin",
                platform_scope="true",
            )
            assert int(await conn.scalar(text("SELECT count(*) FROM campaign_media_assets"))) > 0

        for role, scope in (("admin", "true"), ("client", "false")):
            async with engine.begin() as conn:
                await _set_context(
                    conn,
                    auth_user_uuid=user_uuid,
                    role=role,
                    platform_scope=scope,
                )
                assert (
                    int(await conn.scalar(text("SELECT count(*) FROM campaign_media_assets"))) == 0
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_admin_cannot_mutate_campaign_media_rows_directly(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    user_uuid = await _auth_user_uuid(mobile)
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                auth_user_uuid=user_uuid,
                role="admin",
                platform_scope="true",
            )
            assert (
                await conn.execute(text("UPDATE campaign_media_assets SET title = title"))
            ).rowcount == 0
            assert (await conn.execute(text("DELETE FROM campaign_media_assets"))).rowcount == 0

        async with engine.begin() as conn:
            await _set_context(
                conn,
                auth_user_uuid=user_uuid,
                role="admin",
                platform_scope="true",
            )
            with pytest.raises(DBAPIError):
                await conn.execute(
                    text(
                        "INSERT INTO campaign_media_assets "
                        "(business_line, usage_type, title, alt_text, image_ref, mime_type, "
                        "source_type, created_by_uuid) VALUES "
                        "('loans', 'campaign', 'Admin asset', 'Admin-created artwork', "
                        ":image_ref, 'image/webp', 'bundled', :user_uuid)"
                    ),
                    {
                        "image_ref": f"/banner-templates/starter/admin-{uuid.uuid4()}.webp",
                        "user_uuid": user_uuid,
                    },
                )
    finally:
        await engine.dispose()
