"""Content blocks — Sub Admin create/edit + publish/archive (no Admin gate).

Every route runs on the request session under RLS (narrow sub_admin-only
allowlist — migration d7e8f9a0b1c2). Admin only gets the list/detail GET routes
(read-only oversight); there is no approve/reject step and no bypass service.

This slice is the admin CRUD side only — no public renderer consumes these blocks
yet (customer-facing content serving is out of scope, same as banner serving).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    CurrentUser,
    get_active_user,
    is_platform_admin,
    require_sub_admin_or_platform_admin,
)
from app.db.session import get_db
from app.models.content_block import ContentBlock, ContentStatus
from app.schemas.content import (
    ContentBlockCreate,
    ContentBlockListResponse,
    ContentBlockRead,
    ContentBlockUpdate,
)
from app.services.content import (
    ContentBodyRequired,
    ContentIllegalTransition,
    ContentNotOwned,
    advance_content_block,
)

router = APIRouter()

# Published copy stays editable in place — there is no approval gate on this
# table (spec Open Item A, resolved as publish-directly), so a typo fix on live
# content must not require archiving and re-creating the block. Archived is
# terminal and frozen.
_EDITABLE_STATUSES = (ContentStatus.DRAFT, ContentStatus.PUBLISHED)

_SLUG_TAKEN = "That slug is already in use by another content block."


@router.post("", response_model=ContentBlockRead, status_code=status.HTTP_201_CREATED)
async def create_content_block(
    payload: ContentBlockCreate,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockRead:
    block = ContentBlock(created_by_uuid=current_user.id, **payload.model_dump())
    db.add(block)
    try:
        await db.commit()
    except IntegrityError as exc:
        # uq_content_blocks_slug — the only unique constraint on this table.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_SLUG_TAKEN) from exc
    await db.refresh(block)
    return ContentBlockRead.model_validate(block, from_attributes=True)


@router.get("", response_model=ContentBlockListResponse)
async def list_content_blocks(
    status_filter: ContentStatus | None = None,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockListResponse:
    # RLS scopes the rows: sub_admin and admin see the shared queue, anyone else
    # sees nothing. Newest first.
    stmt = select(ContentBlock).order_by(ContentBlock.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(ContentBlock.status == status_filter)
    rows = (await db.execute(stmt)).scalars().all()
    return ContentBlockListResponse(
        content_blocks=[ContentBlockRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/{block_id}", response_model=ContentBlockRead)
async def get_content_block(
    block_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockRead:
    block = await db.scalar(select(ContentBlock).where(ContentBlock.id == block_id))
    if block is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content block not found."
        )
    return ContentBlockRead.model_validate(block, from_attributes=True)


@router.patch("/{block_id}", response_model=ContentBlockRead)
async def update_content_block(
    block_id: UUID,
    payload: ContentBlockUpdate,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockRead:
    block = await db.scalar(select(ContentBlock).where(ContentBlock.id == block_id))
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content block not found."
        )
    # App-layer guard, mirroring banners/offers: sub_admin's shared-visibility
    # SELECT sees every block, so ownership must be checked explicitly rather
    # than relying on a silent RLS zero-row no-op.
    if not is_platform_admin(current_user) and block.created_by_uuid != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit content blocks you created.",
        )
    if block.status not in _EDITABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An archived content block cannot be edited.",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(block, field, value)
    # A published block must keep a non-empty body — the publish gate would have
    # rejected it, so blanking it afterwards would smuggle empty copy live.
    if block.status is ContentStatus.PUBLISHED and not (block.body or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A published content block must have a body.",
        )
    await db.commit()
    await db.refresh(block)
    return ContentBlockRead.model_validate(block, from_attributes=True)


async def _advance(
    block_id: UUID, target: ContentStatus, current_user: CurrentUser, db: AsyncSession
) -> ContentBlockRead:
    try:
        block = await advance_content_block(
            block_id, current_user.id, target, db, can_manage_any=is_platform_admin(current_user)
        )
    except ContentNotOwned as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only advance content blocks you created.",
        ) from exc
    except ContentIllegalTransition as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This content block cannot move to that status from its current status.",
        ) from exc
    except ContentBodyRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A content block needs a body before it can be published.",
        ) from exc
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Content block not found."
        )
    return ContentBlockRead.model_validate(block, from_attributes=True)


@router.post("/{block_id}/publish", response_model=ContentBlockRead)
async def publish(
    block_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockRead:
    return await _advance(block_id, ContentStatus.PUBLISHED, current_user, db)


@router.post("/{block_id}/archive", response_model=ContentBlockRead)
async def archive(
    block_id: UUID,
    current_user: CurrentUser = Depends(require_sub_admin_or_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ContentBlockRead:
    return await _advance(block_id, ContentStatus.ARCHIVED, current_user, db)
