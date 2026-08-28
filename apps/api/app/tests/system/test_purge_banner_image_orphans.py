"""Orphan-purge job tests for banner and dashboard-offer artwork.

purge_orphaned_uploads must delete only objects that are BOTH old enough
(clear of an in-progress form fill) AND unreferenced by any Banner or Offer
row. An abandoned upload survives regardless of reference if it is fresh,
and a referenced object survives regardless of age.

Requires the Docker stack; auto-skips without Redis (via the shared `client`
fixture import).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.services import banners, storage
from conftest import full_registration, unique_mobile

_OLD = datetime.now(UTC) - timedelta(hours=6)
_FRESH = datetime.now(UTC) - timedelta(minutes=5)


async def _author_uuid(client: AsyncClient) -> str:
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        from sqlalchemy import text

        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_banner_with_image_key(author: str, image_key: str) -> str:
    import app.db.session as _session_mod
    from app.models.banner import Banner

    async with _session_mod.AsyncSessionLocal() as db:
        banner = Banner(
            business_line="loans",
            banner_type="default",
            title="Orphan Purge Test Banner",
            image_key=image_key,
            created_by_uuid=uuid.UUID(author),
        )
        db.add(banner)
        await db.commit()
        return str(banner.id)


async def _seed_offer_with_image_key(author: str, image_key: str) -> str:
    import app.db.session as _session_mod
    from app.models.offer import Offer

    async with _session_mod.AsyncSessionLocal() as db:
        offer = Offer(
            business_line="loans",
            title="Orphan Purge Test Offer",
            discount_type="flat",
            discount_value=100,
            image_key=image_key,
            created_by_uuid=uuid.UUID(author),
        )
        db.add(offer)
        await db.commit()
        return str(offer.id)


def _fake_objects(objects: list[dict]):
    return lambda _prefix: objects


@pytest.mark.asyncio
async def test_deletes_old_unreferenced_image(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "public/banners/x/abandoned.jpg", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await banners.purge_orphaned_uploads()
    assert summary == {"scanned": 1, "deleted": 1}
    assert deleted_keys == ["public/banners/x/abandoned.jpg"]


@pytest.mark.asyncio
async def test_keeps_old_referenced_image(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    author = await _author_uuid(client)
    key = "public/banners/y/kept.jpg"
    banner_id = await _seed_banner_with_image_key(author, key)
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage, "list_objects", _fake_objects([{"key": key, "last_modified": _OLD}])
    )
    monkeypatch.setattr(storage, "delete_object", lambda k: deleted_keys.append(k))

    try:
        summary = await banners.purge_orphaned_uploads()
        assert summary["deleted"] == 0
        assert deleted_keys == []
    finally:
        from sqlalchemy import delete

        import app.db.session as _session_mod
        from app.models.banner import Banner

        async with _session_mod.AsyncSessionLocal() as db:
            await db.execute(delete(Banner).where(Banner.id == uuid.UUID(banner_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_keeps_old_offer_image(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    author = await _author_uuid(client)
    key = "public/banners/offer/kept.webp"
    offer_id = await _seed_offer_with_image_key(author, key)
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage, "list_objects", _fake_objects([{"key": key, "last_modified": _OLD}])
    )
    monkeypatch.setattr(storage, "delete_object", lambda value: deleted_keys.append(value))

    try:
        summary = await banners.purge_orphaned_uploads()
        assert summary["deleted"] == 0
        assert deleted_keys == []
    finally:
        from sqlalchemy import delete

        import app.db.session as _session_mod
        from app.models.offer import Offer

        async with _session_mod.AsyncSessionLocal() as db:
            await db.execute(delete(Offer).where(Offer.id == uuid.UUID(offer_id)))
            await db.commit()


@pytest.mark.asyncio
async def test_keeps_fresh_unreferenced_image(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A just-uploaded, not-yet-saved image (well within the 1h floor) must
    never be swept, referenced or not."""
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "public/banners/z/in-progress.jpg", "last_modified": _FRESH}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await banners.purge_orphaned_uploads()
    assert summary["deleted"] == 0
    assert deleted_keys == []


@pytest.mark.asyncio
async def test_purge_is_idempotent(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    deleted_keys: list[str] = []
    monkeypatch.setattr(
        storage,
        "list_objects",
        _fake_objects([{"key": "public/banners/w/abandoned.png", "last_modified": _OLD}]),
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    first = await banners.purge_orphaned_uploads()
    assert first["deleted"] == 1

    monkeypatch.setattr(storage, "list_objects", _fake_objects([]))
    second = await banners.purge_orphaned_uploads()
    assert second == {"scanned": 0, "deleted": 0}


@pytest.mark.asyncio
async def test_template_purge_removes_abandoned_private_and_public_objects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    staging = "private/banner-templates/staging/x/abandoned.webp"
    canonical = "public/banner-templates/11111111-1111-1111-1111-111111111111/artwork.webp"
    deleted_keys: list[str] = []

    def objects(prefix: str) -> list[dict]:
        if prefix.startswith("private/"):
            return [{"key": staging, "last_modified": _OLD}]
        return [{"key": canonical, "last_modified": _OLD}]

    monkeypatch.setattr(storage, "list_objects", objects)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    summary = await banners.purge_orphaned_template_uploads()
    assert summary == {"scanned": 2, "deleted": 2}
    assert deleted_keys == [staging, canonical]
