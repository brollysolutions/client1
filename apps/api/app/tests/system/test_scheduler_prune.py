"""Scheduler prune-job tests (audit P-perf4).

prune_expired_refresh_tokens must delete rows past expires_at (revoked or not),
keep live rows, and be idempotent. Requires the Docker stack; auto-skips without
Redis.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, text

from app.models.auth import RefreshToken
from app.scheduler.main import prune_expired_refresh_tokens
from conftest import full_registration, unique_mobile


async def _user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _insert_token(user_id: str, *, expired: bool, revoked: bool = False) -> str:
    import app.db.session as _session_mod

    now = datetime.now(UTC)
    expires_at = now - timedelta(days=1) if expired else now + timedelta(days=30)
    async with _session_mod.AsyncSessionLocal() as db:
        token = RefreshToken(
            auth_user_uuid=user_id,
            token_hash=f"hash-{now.timestamp()}-{expired}-{revoked}",
            issued_at=now - timedelta(days=31 if expired else 0),
            expires_at=expires_at,
            revoked=revoked,
        )
        db.add(token)
        await db.commit()
        return str(token.id)


async def _count_by_id(token_id: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return (
            await db.execute(
                select(func.count()).select_from(RefreshToken).where(RefreshToken.id == token_id)
            )
        ).scalar_one()


@pytest.mark.asyncio
async def test_prune_deletes_expired_keeps_live(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    user_id = await _user_id(mobile)

    expired_id = await _insert_token(user_id, expired=True)
    expired_revoked_id = await _insert_token(user_id, expired=True, revoked=True)
    live_id = await _insert_token(user_id, expired=False)

    await prune_expired_refresh_tokens()

    assert await _count_by_id(expired_id) == 0, "expired token not pruned"
    assert await _count_by_id(expired_revoked_id) == 0, "expired revoked token not pruned"
    assert await _count_by_id(live_id) == 1, "live token wrongly pruned"


@pytest.mark.asyncio
async def test_prune_is_idempotent(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile)
    user_id = await _user_id(mobile)
    live_id = await _insert_token(user_id, expired=False)

    await prune_expired_refresh_tokens()
    await prune_expired_refresh_tokens()  # second run must not error

    assert await _count_by_id(live_id) == 1
