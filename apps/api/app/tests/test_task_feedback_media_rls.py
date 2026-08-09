"""RLS keeps property-visit feedback between its assignee and platform Admin."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.task import TaskFeedbackMedia

from .test_employee_task_documents import _seed_employee, _seed_task


async def _select_as(
    *,
    role: str,
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
    business_line: str = "real_estate",
) -> list[str]:
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    engine = create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    try:
        async with engine.begin() as connection:
            await connection.execute(text("SET LOCAL ROLE api_user"))
            await connection.execute(
                text(
                    "SELECT "
                    "set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :line, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :staff, true),"
                    "set_config('app.platform_scope', :platform, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "line": business_line,
                    "staff": staff_profile_uuid,
                    "platform": platform_scope,
                },
            )
            rows = await connection.execute(text("SELECT id FROM task_feedback_media"))
            return [str(row[0]) for row in rows.fetchall()]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_feedback_rls_role_and_assignment_matrix(client: AsyncClient) -> None:
    owner_auth, owner_profile = await _seed_employee("real_estate")
    _, other_profile = await _seed_employee("real_estate")
    _, loans_profile = await _seed_employee("loans")
    task_id = await _seed_task(
        "real_estate", owner_profile, task_type="property_visit", status="assigned"
    )
    media_id = uuid.uuid4()

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        session.add(
            TaskFeedbackMedia(
                id=media_id,
                task_uuid=uuid.UUID(task_id),
                business_line="real_estate",
                kind="image",
                content_type="image/jpeg",
                object_key=f"private/task-feedback/canonical/{task_id}/{media_id}/asset.jpg",
                size_bytes=1024,
                uploaded_by_uuid=uuid.UUID(owner_auth),
                sanitized_at=datetime.now(UTC),
            )
        )
        await session.commit()

    assert str(media_id) in await _select_as(role="employee", staff_profile_uuid=owner_profile)
    assert str(media_id) not in await _select_as(role="employee", staff_profile_uuid=other_profile)
    assert str(media_id) not in await _select_as(
        role="employee", staff_profile_uuid=loans_profile, business_line="loans"
    )
    assert str(media_id) not in await _select_as(
        role="telecaller", staff_profile_uuid=other_profile
    )
    assert str(media_id) not in await _select_as(role="client")
    assert str(media_id) not in await _select_as(role="sub_admin", platform_scope="true")
    assert str(media_id) in await _select_as(role="admin", platform_scope="true")
