"""Owner isolation and Admin delete-only access for personalization data."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import full_registration


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


async def _user_uuid(mobile: str) -> uuid.UUID:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        value = await db.scalar(
            text("SELECT id FROM auth_users WHERE mobile = :mobile"), {"mobile": mobile}
        )
        assert value is not None
        return uuid.UUID(str(value))


async def _seed_preference(user_id: uuid.UUID) -> None:
    import app.db.session as session_module
    from app.models.personalization import PersonalizationPreference

    async with session_module.AsyncSessionLocal() as db:
        db.add(
            PersonalizationPreference(
                auth_user_uuid=user_id,
                personalization_enabled=True,
                personalization_consented_at=datetime.now(UTC),
            )
        )
        await db.commit()


async def _set_context(conn, *, user_id: uuid.UUID, role: str, platform: bool = False) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    await conn.execute(
        text(
            "SELECT set_config('app.auth_user_uuid', :user_id, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', 'both', true),"
            "set_config('app.platform_scope', :platform, true)"
        ),
        {"user_id": str(user_id), "role": role, "platform": str(platform).lower()},
    )


@pytest.mark.asyncio
async def test_owner_cannot_read_or_update_another_users_preference(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client)
    _, other_mobile = await full_registration(client)
    owner_id = await _user_uuid(owner_mobile)
    other_id = await _user_uuid(other_mobile)
    await _seed_preference(owner_id)
    await _seed_preference(other_id)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, user_id=other_id, role="client")
            visible = (
                (await conn.execute(text("SELECT auth_user_uuid FROM personalization_preferences")))
                .scalars()
                .all()
            )
            assert visible == [other_id]
            result = await conn.execute(
                text(
                    "UPDATE personalization_preferences SET personalization_enabled = false "
                    "WHERE auth_user_uuid = :owner_id"
                ),
                {"owner_id": owner_id},
            )
            assert result.rowcount == 0
            with pytest.raises(Exception):  # noqa: B017 - explicit DB authorization failure
                await conn.scalar(
                    text("SELECT erase_personalization_preference(:owner_id)"),
                    {"owner_id": owner_id},
                )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_platform_admin_cannot_read_but_can_use_scoped_erasure_function(
    client: AsyncClient,
) -> None:
    _, mobile = await full_registration(client)
    owner_id = await _user_uuid(mobile)
    await _seed_preference(owner_id)

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, user_id=uuid.uuid4(), role="admin", platform=True)
            visible = (
                (await conn.execute(text("SELECT auth_user_uuid FROM personalization_preferences")))
                .scalars()
                .all()
            )
            assert owner_id not in visible
            removed = await conn.scalar(
                text("SELECT erase_personalization_preference(:owner_id)"),
                {"owner_id": owner_id},
            )
            assert removed is True
    finally:
        await engine.dispose()
