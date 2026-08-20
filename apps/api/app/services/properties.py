"""Shared response projection helpers for managed property media."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.property_media import PropertyMedia
from app.schemas.properties import PropertyMediaRead
from app.services import storage


async def media_urls_by_property(
    db: AsyncSession, property_ids: list[UUID]
) -> dict[UUID, list[str]]:
    result: dict[UUID, list[str]] = {property_id: [] for property_id in property_ids}
    if not property_ids:
        return result
    rows = (
        await db.scalars(
            select(PropertyMedia)
            .where(PropertyMedia.property_uuid.in_(property_ids))
            .order_by(PropertyMedia.position, PropertyMedia.id)
        )
    ).all()
    for asset in rows:
        if asset.kind != "image":
            continue
        url = storage.public_asset_url(asset.object_key)
        if url is not None:
            result.setdefault(asset.property_uuid, []).append(url)
    return result


async def media_by_property(
    db: AsyncSession, property_ids: list[UUID]
) -> dict[UUID, list[PropertyMediaRead]]:
    result: dict[UUID, list[PropertyMediaRead]] = {property_id: [] for property_id in property_ids}
    if not property_ids:
        return result
    rows = (
        await db.scalars(
            select(PropertyMedia)
            .where(PropertyMedia.property_uuid.in_(property_ids))
            .order_by(PropertyMedia.position, PropertyMedia.id)
        )
    ).all()
    for asset in rows:
        url = storage.public_asset_url(asset.object_key)
        if url is not None:
            result.setdefault(asset.property_uuid, []).append(
                PropertyMediaRead(
                    kind=asset.kind,
                    url=url,
                    content_type=asset.content_type,
                )
            )
    return result
