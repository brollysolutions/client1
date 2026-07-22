"""Property submissions — agent submit + Admin/Sub Admin review queue.

Submit and the queue reads run on the request session under RLS (agent sees own,
reviewer sees the queue). Approve/reject delegate to the bypass service so the
Property insert + status flip are atomic and the catalog keeps its SELECT-only grant.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    CurrentUser,
    get_active_user,
    require_re_agent,
    require_re_reviewer,
)
from app.db.session import get_db
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.schemas.property_submissions import (
    RejectRequest,
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionRead,
)
from app.services.property_submissions import (
    SubmissionAlreadyReviewed,
    approve_submission,
    reject_submission,
)

router = APIRouter()


@router.post("", response_model=SubmissionRead, status_code=status.HTTP_201_CREATED)
async def submit_property(
    payload: SubmissionCreate,
    current_user: CurrentUser = Depends(require_re_agent),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    submission = PropertySubmission(
        submitter_uuid=current_user.id,
        business_line="real_estate",
        **payload.model_dump(),
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return SubmissionRead.model_validate(submission, from_attributes=True)


@router.get("", response_model=SubmissionListResponse)
async def list_submissions(
    status: SubmissionStatus | None = None,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    # RLS scopes the rows: an agent sees only their own, a reviewer sees the queue,
    # anyone else sees nothing. Newest first.
    stmt = select(PropertySubmission).order_by(PropertySubmission.created_at.desc())
    if status is not None:
        stmt = stmt.where(PropertySubmission.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return SubmissionListResponse(
        submissions=[SubmissionRead.model_validate(r, from_attributes=True) for r in rows]
    )


@router.get("/{submission_id}", response_model=SubmissionRead)
async def get_submission(
    submission_id: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return SubmissionRead.model_validate(sub, from_attributes=True)


@router.post("/{submission_id}/approve", response_model=SubmissionRead)
async def approve(
    submission_id: UUID,
    current_user: CurrentUser = Depends(require_re_reviewer),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        property_id = await approve_submission(submission_id, current_user.id)
    except SubmissionAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This submission has already been reviewed.",
        ) from exc
    if property_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:  # pragma: no cover — reviewer RLS always sees the row it just approved
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return SubmissionRead.model_validate(sub, from_attributes=True)


@router.post("/{submission_id}/reject", response_model=SubmissionRead)
async def reject(
    submission_id: UUID,
    payload: RejectRequest,
    current_user: CurrentUser = Depends(require_re_reviewer),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        ok = await reject_submission(submission_id, current_user.id, payload.note)
    except SubmissionAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This submission has already been reviewed.",
        ) from exc
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return SubmissionRead.model_validate(sub, from_attributes=True)
