"""Content-block lifecycle advance — request-session only, no bypass.

Like offers (and unlike banners) content_blocks has no Admin-approval step, so
every write runs on the request session under RLS (narrow sub_admin-only
allowlist, migration d7e8f9a0b1c2). advance_content_block enforces the
forward-only status machine in the app layer; RLS only gates role + ownership.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content_block import ContentBlock, ContentStatus

# Forward-only edges. A draft can be archived without ever going live (abandoned
# copy); archived is terminal — nothing is ever un-archived or un-published.
_TRANSITIONS: dict[ContentStatus, set[ContentStatus]] = {
    ContentStatus.DRAFT: {ContentStatus.PUBLISHED, ContentStatus.ARCHIVED},
    ContentStatus.PUBLISHED: {ContentStatus.ARCHIVED},
    ContentStatus.ARCHIVED: set(),
}


class ContentIllegalTransition(Exception):
    """Raised when an advance targets a status not reachable from the current one."""


class ContentNotOwned(Exception):
    """Raised when an advance targets a block created by a different sub_admin.

    Distinct from "not found" — shared-visibility SELECT means the caller can
    already see this row in their queue, so a 404 here would be confusing."""


class ContentBodyRequired(Exception):
    """Raised when publishing a block whose body is empty.

    A content rule, not a DB constraint: an already-archived block whose body was
    blanked must stay archivable."""


async def advance_content_block(
    block_id: UUID, owner_uuid: UUID, target_status: ContentStatus, db: AsyncSession
) -> ContentBlock | None:
    # Unlocked existence/ownership check first: Postgres RLS applies a table's
    # UPDATE policy (not just SELECT) to a `SELECT ... FOR UPDATE`, so locking up
    # front would make a non-owner's row disappear (404) instead of the intended
    # 403 — the caller must already satisfy content_blocks_update's ownership
    # predicate before a locked re-select is safe to issue.
    block = await db.scalar(select(ContentBlock).where(ContentBlock.id == block_id))
    if block is None:
        return None
    if block.created_by_uuid != owner_uuid:
        raise ContentNotOwned
    # Ownership confirmed — re-select FOR UPDATE to serialize concurrent advances
    # from the same owner (e.g. a double-clicked publish), mirroring offers.
    block = await db.scalar(
        select(ContentBlock).where(ContentBlock.id == block_id).with_for_update()
    )
    if target_status not in _TRANSITIONS.get(block.status, set()):
        raise ContentIllegalTransition
    if target_status is ContentStatus.PUBLISHED and not (block.body or "").strip():
        raise ContentBodyRequired
    block.status = target_status
    await db.commit()
    await db.refresh(block)
    return block
