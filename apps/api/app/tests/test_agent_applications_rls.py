"""agent_applications RLS — the applicant sees only their own linked row; no
other role gets a bypass short of Admin's platform_scope branch.

Unlike leads_rls (which has staff/agent branches keyed on business_line),
agent_applications_rls (migration a0b1c2d3e4f5) has exactly two disjuncts:
  * (platform_scope='true' AND role='admin')  -- Admin bypass
  * applicant_auth_user_uuid = app.auth_user_uuid  -- own row only, no role gate

This slice's public submit endpoint (services/agent_applications.py::submit)
writes on a superuser bypass session and deliberately did NOT touch this
policy (see migration c1d2e3f4a5b6's docstring) — these tests are a
regression guard proving that reasoning still holds: no line-scoped staff
role gets a bypass, and the applicant-visibility branch has no role
condition attached to it (any authenticated identity whose auth_user_uuid
matches the row's applicant_auth_user_uuid sees it, by design).

Requires the Docker stack with migrations applied; auto-skips without Redis
(via the shared `client` fixture import).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import unique_mobile


async def _seed_auth_user() -> str:
    """Insert a bare User row via the app superuser. Returns its id.

    applicant_auth_user_uuid carries a real FK to auth_users (ondelete="SET
    NULL"), so a random uuid4 alone would violate the constraint.
    """
    import app.db.session as _session_mod
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Applicant",
            mobile=unique_mobile(),
            email=f"applicant_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.commit()
        return str(user.id)


async def _seed_application(
    business_line: str = "loans", applicant_auth_user_uuid: str | None = None
) -> str:
    """Insert an AgentApplication via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with _session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            applicant_auth_user_uuid=(
                uuid.UUID(applicant_auth_user_uuid) if applicant_auth_user_uuid else None
            ),
            first_name="Ravi",
            last_name="Kumar",
            mobile=unique_mobile(),
            business_line=business_line,
            status=SubmissionStatus.PENDING,
        )
        db.add(application)
        await db.commit()
        return str(application.id)


async def _select_visible_count(
    *,
    role: str,
    auth_user_uuid: str,
    business_line: str = "",
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
    application_id: str,
) -> int:
    """Run a SELECT as api_user under the given RLS context. Returns rowcount."""
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
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT "
                    "set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :bl, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', :staff_uuid, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": auth_user_uuid,
                    "role": role,
                    "bl": business_line,
                    "staff_uuid": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(
                text("SELECT count(*) FROM agent_applications WHERE id = :id"),
                {"id": application_id},
            )
            return result.scalar_one()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_applicant_sees_own_application(client: AsyncClient) -> None:
    applicant_uuid = await _seed_auth_user()
    app_id = await _seed_application(applicant_auth_user_uuid=applicant_uuid)
    count = await _select_visible_count(
        role="client", auth_user_uuid=applicant_uuid, application_id=app_id
    )
    assert count == 1, "applicant could not see their own agent_application row"


@pytest.mark.asyncio
async def test_other_client_cannot_see_someone_elses_application(client: AsyncClient) -> None:
    applicant_uuid = await _seed_auth_user()
    other_uuid = await _seed_auth_user()
    app_id = await _seed_application(applicant_auth_user_uuid=applicant_uuid)
    count = await _select_visible_count(
        role="client", auth_user_uuid=other_uuid, application_id=app_id
    )
    assert count == 0, "a different client saw another applicant's agent_application row"


@pytest.mark.asyncio
async def test_line_sub_admin_cannot_see_application(client: AsyncClient) -> None:
    """agent_applications_rls has no business_line predicate for staff at
    all — a line-scoped sub_admin (platform_scope='false') must see nothing,
    even on the matching line."""
    app_id = await _seed_application(business_line="loans")
    count = await _select_visible_count(
        role="sub_admin",
        auth_user_uuid=str(uuid.uuid4()),
        business_line="loans",
        application_id=app_id,
    )
    assert count == 0, "a line sub_admin saw an agent_application via a nonexistent line branch"


@pytest.mark.asyncio
async def test_admin_sees_all_applications(client: AsyncClient) -> None:
    app_id = await _seed_application(business_line="real_estate")
    count = await _select_visible_count(
        role="admin",
        auth_user_uuid=str(uuid.uuid4()),
        platform_scope="true",
        application_id=app_id,
    )
    assert count == 1, "admin platform_scope bypass did not see the application"


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cannot_see_application(client: AsyncClient) -> None:
    """a0b1c2d3e4f5 narrowed the platform_scope bypass to role='admin' only —
    a platform-scoped sub_admin must NOT get the bypass on this table."""
    app_id = await _seed_application(business_line="loans")
    count = await _select_visible_count(
        role="sub_admin",
        auth_user_uuid=str(uuid.uuid4()),
        platform_scope="true",
        application_id=app_id,
    )
    assert count == 0, "sub_admin read an agent_application via the platform_scope bypass"
