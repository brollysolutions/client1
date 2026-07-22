"""Client property bookmarks — save, list, and remove own.

Real-estate line. RLS (migration 5e6f7a8b9c1d) is the access boundary: a
client sees only their own bookmarks; there is no staff/agent read branch
(private list). The client never supplies user_uuid/business_line — the
router stamps user_uuid from the authenticated identity and business_line as
a literal "real_estate".

Saving is idempotent: bookmarking an already-saved property returns the
existing row rather than erroring (ON CONFLICT DO NOTHING keyed on the
(user_uuid, property_ref) unique index).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user
from app.db.session import get_db
from app.models.bookmark import Bookmark
from app.schemas.bookmarks import BookmarkCreate, BookmarkListResponse, BookmarkRead

router = APIRouter()


def _require_client(current_user: CurrentUser) -> None:
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can bookmark a property.",
        )


@router.get("", response_model=BookmarkListResponse)
async def list_bookmarks(
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkListResponse:
    result = await db.execute(select(Bookmark).order_by(Bookmark.created_at.desc()))
    bookmarks = result.scalars().all()
    return BookmarkListResponse(
        bookmarks=[BookmarkRead.model_validate(b, from_attributes=True) for b in bookmarks]
    )


@router.post("", response_model=BookmarkRead, status_code=status.HTTP_200_OK)
async def create_bookmark(
    req: BookmarkCreate,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkRead:
    _require_client(current_user)
    stmt = (
        pg_insert(Bookmark)
        .values(
            user_uuid=current_user.id,
            business_line="real_estate",
            property_ref=req.property_ref,
            title=req.title,
            locality=req.locality,
            city=req.city,
        )
        .on_conflict_do_nothing(index_elements=[Bookmark.user_uuid, Bookmark.property_ref])
    )
    await db.execute(stmt)
    await db.commit()

    result = await db.execute(
        select(Bookmark).where(
            Bookmark.user_uuid == current_user.id,
            Bookmark.property_ref == req.property_ref,
        )
    )
    bookmark = result.scalar_one()
    return BookmarkRead.model_validate(bookmark, from_attributes=True)


@router.delete("/{property_ref}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    property_ref: str,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    _require_client(current_user)
    # Idempotent: deleting an id that isn't bookmarked removes zero rows, no error.
    await db.execute(
        delete(Bookmark).where(
            Bookmark.user_uuid == current_user.id,
            Bookmark.property_ref == property_ref,
        )
    )
    await db.commit()
