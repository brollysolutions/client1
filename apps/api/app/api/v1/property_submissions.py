"""Property submissions — submitter intake plus the platform Admin review queue.

Submit and reads run on the request session under RLS (submitters see their own,
Admin sees the queue). Owner updates, withdrawal, approve, and reject delegate to
explicitly authorized bypass services so catalogue changes remain atomic while
the public property table keeps its SELECT-only request-session grant.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache
from app.core.deps import (
    CurrentUser,
    get_cache,
    require_platform_admin,
    require_re_submitter,
)
from app.db.session import get_db
from app.models.property_media import PropertyMedia, PropertySubmissionMedia
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.schemas.property_submissions import (
    PropertyMediaUploadRequest,
    PropertyMediaUploadResponse,
    RejectRequest,
    ReraReviewRequest,
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionMediaAccessResponse,
    SubmissionMediaRead,
    SubmissionRead,
    SubmissionUpdate,
)
from app.services import storage
from app.services.property_submissions import (
    InvalidReraReview,
    MediaContentMismatch,
    MediaNotReady,
    MediaObjectChanged,
    MediaObjectKeyMismatch,
    MediaStorageUnavailable,
    MediaUploadMissing,
    MediaUploadRateExceeded,
    ReraReviewRequired,
    SubmissionAlreadyReviewed,
    SubmissionNotEditable,
    approve_submission,
    create_submission,
    presign_media_upload,
    reject_submission,
    review_rera,
    verify_stored_media,
    withdraw_submission,
)
from app.services.property_submissions import (
    update_submission as update_submission_service,
)

router = APIRouter()


def _to_read(
    submission: PropertySubmission,
    media: list[PropertySubmissionMedia],
) -> SubmissionRead:
    base = SubmissionRead.model_validate(submission, from_attributes=True)
    return base.model_copy(
        update={
            "media": [
                SubmissionMediaRead.model_validate(asset, from_attributes=True) for asset in media
            ]
        }
    )


async def _media_for_submissions(
    db: AsyncSession, submission_ids: list[UUID]
) -> dict[UUID, list[PropertySubmissionMedia]]:
    result: dict[UUID, list[PropertySubmissionMedia]] = {item: [] for item in submission_ids}
    if not submission_ids:
        return result
    rows = (
        await db.scalars(
            select(PropertySubmissionMedia)
            .where(PropertySubmissionMedia.submission_uuid.in_(submission_ids))
            .order_by(PropertySubmissionMedia.position, PropertySubmissionMedia.id)
        )
    ).all()
    for asset in rows:
        result.setdefault(asset.submission_uuid, []).append(asset)
    return result


@router.post("/media-upload-url", response_model=PropertyMediaUploadResponse)
async def get_property_media_upload_url(
    payload: PropertyMediaUploadRequest,
    current_user: CurrentUser = Depends(require_re_submitter),
    cache: RedisCache = Depends(get_cache),
) -> PropertyMediaUploadResponse:
    try:
        url, fields, object_key, max_bytes = await presign_media_upload(
            cache,
            current_user.id,
            content_type=payload.content_type,
        )
    except MediaUploadRateExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many upload attempts. Try again later.",
        ) from exc
    return PropertyMediaUploadResponse(
        object_key=object_key,
        upload_url=url,
        fields=fields,
        max_bytes=max_bytes,
    )


@router.post("", response_model=SubmissionRead, status_code=status.HTTP_201_CREATED)
async def submit_property(
    payload: SubmissionCreate,
    current_user: CurrentUser = Depends(require_re_submitter),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        submission = await create_submission(db, payload, current_user.id)
    except MediaObjectKeyMismatch as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A media key does not belong to this account.",
        ) from exc
    except MediaUploadMissing as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="An uploaded media object is missing or exceeds the allowed size.",
        ) from exc
    except MediaContentMismatch as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded media content does not match its declared type.",
        ) from exc
    except MediaStorageUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Media storage could not be verified. Try again.",
        ) from exc
    media = await _media_for_submissions(db, [submission.id])
    return _to_read(submission, media[submission.id])


@router.get("", response_model=SubmissionListResponse)
async def list_submissions(
    response: Response,
    status: SubmissionStatus | None = None,
    mine: bool = False,
    current_user: CurrentUser = Depends(require_re_submitter),
    db: AsyncSession = Depends(get_db),
) -> SubmissionListResponse:
    response.headers["Cache-Control"] = "private, no-store"
    # RLS scopes the rows: an agent sees only their own, a reviewer sees the queue,
    # anyone else sees nothing. Newest first.
    stmt = select(PropertySubmission).order_by(PropertySubmission.created_at.desc())
    if status is not None:
        stmt = stmt.where(PropertySubmission.status == status)
    if mine:
        stmt = stmt.where(PropertySubmission.submitter_uuid == current_user.id)
    rows = (await db.execute(stmt)).scalars().all()
    media = await _media_for_submissions(db, [row.id for row in rows])
    return SubmissionListResponse(submissions=[_to_read(row, media[row.id]) for row in rows])


@router.get("/{submission_id}", response_model=SubmissionRead)
async def get_submission(
    submission_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(require_re_submitter),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    response.headers["Cache-Control"] = "private, no-store"
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:
        # 404, never 403: an RLS-filtered row is indistinguishable from missing.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    media = await _media_for_submissions(db, [sub.id])
    return _to_read(sub, media[sub.id])


@router.patch("/{submission_id}", response_model=SubmissionRead)
async def update_submission(
    submission_id: UUID,
    payload: SubmissionUpdate,
    response: Response,
    current_user: CurrentUser = Depends(require_re_submitter),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    response.headers["Cache-Control"] = "private, no-store"
    try:
        updated = await update_submission_service(
            submission_id,
            payload,
            current_user.id,
            actor_role=current_user.role,
            platform_scope=current_user.platform_scope,
        )
    except SubmissionNotEditable as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A withdrawn listing cannot be edited.",
        ) from exc
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:  # pragma: no cover - authorization and service checks agree
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    media = await _media_for_submissions(db, [sub.id])
    return _to_read(sub, media[sub.id])


@router.delete("/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    submission_id: UUID,
    current_user: CurrentUser = Depends(require_re_submitter),
) -> Response:
    withdrawn = await withdraw_submission(
        submission_id,
        current_user.id,
        actor_role=current_user.role,
        platform_scope=current_user.platform_scope,
    )
    if not withdrawn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{submission_id}/media/{media_id}/access",
    response_model=SubmissionMediaAccessResponse,
)
async def access_submission_media(
    submission_id: UUID,
    media_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(require_re_submitter),
    db: AsyncSession = Depends(get_db),
) -> SubmissionMediaAccessResponse:
    response.headers["Cache-Control"] = "private, no-store"
    asset = await db.scalar(
        select(PropertySubmissionMedia).where(
            PropertySubmissionMedia.id == media_id,
            PropertySubmissionMedia.submission_uuid == submission_id,
        )
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    if asset.kind in {"image", "panorama"}:
        approved_property_id = await db.scalar(
            select(PropertySubmission.approved_property_id).where(
                PropertySubmission.id == submission_id
            )
        )
        if approved_property_id is not None:
            public_key = await db.scalar(
                select(PropertyMedia.object_key).where(
                    PropertyMedia.property_uuid == approved_property_id,
                    PropertyMedia.object_key.startswith(
                        f"public/properties/{approved_property_id}/{asset.id}/"
                    ),
                )
            )
            if public_key is not None:
                return SubmissionMediaAccessResponse(url=storage.presign_preview(public_key))
    try:
        await verify_stored_media(asset)
    except MediaNotReady as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This media item is still being processed or could not be processed.",
        ) from exc
    except MediaObjectChanged as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This media object changed after submission.",
        ) from exc
    except MediaStorageUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Media storage could not be verified. Try again.",
        ) from exc
    url = (
        storage.presign_preview(asset.object_key)
        if asset.kind in {"image", "panorama"}
        else storage.presign_download(asset.object_key)
    )
    return SubmissionMediaAccessResponse(url=url)


@router.post("/{submission_id}/approve", response_model=SubmissionRead)
async def approve(
    submission_id: UUID,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        property_id = await approve_submission(
            submission_id, current_user.id, reviewer_role=current_user.role
        )
    except SubmissionAlreadyReviewed as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This submission has already been reviewed.",
        ) from exc
    except ReraReviewRequired as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Complete the RERA applicability review before approval.",
        ) from exc
    except MediaNotReady as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="All media must finish processing before approval.",
        ) from exc
    except MediaObjectChanged as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submitted media changed after verification and cannot be approved.",
        ) from exc
    except MediaStorageUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Media storage could not publish this listing. Try again.",
        ) from exc
    if property_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:  # pragma: no cover — reviewer RLS always sees the row it just approved
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    media = await _media_for_submissions(db, [sub.id])
    return _to_read(sub, media[sub.id])


@router.post("/{submission_id}/rera-review", response_model=SubmissionRead)
async def record_rera_review(
    submission_id: UUID,
    payload: ReraReviewRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        ok = await review_rera(
            submission_id,
            current_user.id,
            payload.status,
            payload.note,
            reviewer_role=current_user.role,
        )
    except InvalidReraReview as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The RERA review outcome does not match the submitted applicability details.",
        ) from exc
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    sub = await db.scalar(select(PropertySubmission).where(PropertySubmission.id == submission_id))
    if sub is None:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    media = await _media_for_submissions(db, [sub.id])
    return _to_read(sub, media[sub.id])


@router.post("/{submission_id}/reject", response_model=SubmissionRead)
async def reject(
    submission_id: UUID,
    payload: RejectRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> SubmissionRead:
    try:
        ok = await reject_submission(
            submission_id, current_user.id, payload.note, reviewer_role=current_user.role
        )
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
    media = await _media_for_submissions(db, [sub.id])
    return _to_read(sub, media[sub.id])
