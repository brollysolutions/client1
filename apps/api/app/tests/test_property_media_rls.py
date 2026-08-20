"""Managed property-media RLS ownership and publication boundaries."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.property import Property
from app.models.property_media import PropertyMedia, PropertySubmissionMedia
from app.models.property_submission import PropertySubmission
from conftest import full_registration


async def _user_uuid(mobile: str) -> uuid.UUID:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        return uuid.UUID(
            str(
                await session.scalar(
                    text("SELECT id FROM auth_users WHERE mobile = :mobile"),
                    {"mobile": mobile},
                )
            )
        )


async def _seed_submission(owner: uuid.UUID) -> uuid.UUID:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        submission = PropertySubmission(
            submitter_uuid=owner,
            business_line="real_estate",
            title="Managed media listing",
            type="Apartment",
            location="Baner, Pune",
            category="apartments",
            city="Pune",
            locality="Baner",
            pincode="411045",
            price_paise=5_000_000,
            furnishing="semi",
            construction_status="ready",
            rera_number="RERA/MEDIA/1",
        )
        session.add(submission)
        await session.commit()
        return submission.id


async def _seed_private(owner: uuid.UUID) -> uuid.UUID:
    import app.db.session as session_module

    submission_id = await _seed_submission(owner)
    async with session_module.AsyncSessionLocal() as session:
        asset = PropertySubmissionMedia(
            submission_uuid=submission_id,
            business_line="real_estate",
            kind="image",
            content_type="image/jpeg",
            object_key=(f"private/property-submissions/canonical/{owner}/{uuid.uuid4()}/asset.jpg"),
            size_bytes=1024,
            position=0,
        )
        session.add(asset)
        await session.commit()
        return asset.id


async def _seed_public(*, active: bool) -> uuid.UUID:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        prop = Property(
            business_line="real_estate",
            active=active,
            title="Published media listing",
            type="Apartment",
            location="Baner, Pune",
            price_display="₹50 L",
            category="apartments",
            city="Pune",
            locality="Baner",
            pincode="411045",
            price_paise=5_000_000,
            furnishing="semi",
            construction_status="ready",
            rera_number="RERA/MEDIA/2",
        )
        session.add(prop)
        await session.flush()
        asset = PropertyMedia(
            property_uuid=prop.id,
            business_line="real_estate",
            content_type="image/jpeg",
            object_key=f"public/properties/{prop.id}/{uuid.uuid4()}/image.jpg",
            size_bytes=1024,
            position=0,
        )
        session.add(asset)
        await session.commit()
        return asset.id


def _engine():
    return create_async_engine(
        settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432"),
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )


async def _select_ids(
    table: str,
    *,
    user_uuid: uuid.UUID | None = None,
    role: str = "client",
    business_line: str = "both",
    platform_scope: str = "false",
) -> list[uuid.UUID]:
    assert table in {"property_submission_media", "property_media"}
    engine = _engine()
    try:
        async with engine.begin() as connection:
            await connection.execute(text("SET LOCAL ROLE api_user"))
            await connection.execute(
                text(
                    "SELECT set_config('app.auth_user_uuid', :user_uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :business_line, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', '', true),"
                    "set_config('app.platform_scope', :platform_scope, true)"
                ),
                {
                    "user_uuid": str(user_uuid or uuid.uuid4()),
                    "role": role,
                    "business_line": business_line,
                    "platform_scope": platform_scope,
                },
            )
            rows = await connection.scalars(text(f"SELECT id FROM {table}"))  # noqa: S608
            return list(rows)
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_private_media_is_owner_or_platform_admin_only(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner = await _user_uuid(owner_mobile)
    media_id = await _seed_private(owner)
    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other = await _user_uuid(other_mobile)

    assert media_id in await _select_ids(
        "property_submission_media",
        user_uuid=owner,
        role="agent",
        business_line="real_estate",
    )
    assert media_id not in await _select_ids("property_submission_media", user_uuid=owner)
    assert media_id not in await _select_ids("property_submission_media", user_uuid=other)
    assert media_id in await _select_ids(
        "property_submission_media", role="admin", platform_scope="true"
    )
    assert media_id not in await _select_ids(
        "property_submission_media", role="sub_admin", platform_scope="true"
    )


@pytest.mark.asyncio
async def test_private_media_insert_requires_owner_submission_and_key(
    client: AsyncClient,
) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner = await _user_uuid(owner_mobile)
    submission_id = await _seed_submission(owner)
    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other = await _user_uuid(other_mobile)

    async def insert_as(
        context_owner: uuid.UUID,
        object_owner: uuid.UUID,
        *,
        position: int = 0,
        namespace: str = "canonical",
        role: str = "agent",
    ) -> None:
        engine = _engine()
        try:
            async with engine.begin() as connection:
                await connection.execute(text("SET LOCAL ROLE api_user"))
                await connection.execute(
                    text(
                        "SELECT set_config('app.auth_user_uuid', :user_uuid, true),"
                        "set_config('app.role', :role, true),"
                        "set_config('app.business_line', 'real_estate', true),"
                        "set_config('app.platform_scope', 'false', true)"
                    ),
                    {"user_uuid": str(context_owner), "role": role},
                )
                await connection.execute(
                    text(
                        "INSERT INTO property_submission_media "
                        "(id, submission_uuid, business_line, kind, content_type, object_key, "
                        "size_bytes, position) VALUES "
                        "(gen_random_uuid(), :submission_id, 'real_estate', 'image', "
                        "'image/jpeg', :object_key, 1024, :position)"
                    ),
                    {
                        "submission_id": submission_id,
                        "object_key": (
                            f"private/property-submissions/{namespace}/"
                            f"{object_owner}/{uuid.uuid4()}/asset.jpg"
                        ),
                        "position": position,
                    },
                )
        finally:
            await engine.dispose()

    with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
        await insert_as(owner, other)
    with pytest.raises(Exception):  # noqa: B017 -- Clients cannot attach listing media
        await insert_as(owner, owner, role="client")
    await insert_as(owner, owner)
    with pytest.raises(Exception):  # noqa: B017 — asyncpg row-security violation
        await insert_as(other, other, position=1)
    with pytest.raises(Exception):  # noqa: B017 -- staging keys are never durable rows
        await insert_as(owner, owner, position=1, namespace="staging")


@pytest.mark.asyncio
async def test_public_media_requires_active_property_except_for_admin(
    client: AsyncClient,
) -> None:
    active_id = await _seed_public(active=True)
    inactive_id = await _seed_public(active=False)
    client_ids = await _select_ids("property_media")
    admin_ids = await _select_ids("property_media", role="admin", platform_scope="true")

    assert active_id in client_ids
    assert inactive_id not in client_ids
    assert {active_id, inactive_id}.issubset(set(admin_ids))
