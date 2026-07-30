"""Unified Admin document verification — task_documents + loan_documents (FR-7.4).

Gated by `deps.require_platform_admin` (feature-status.md §2-20), not the
role-only `deps.require_admin`: `task_documents_update`'s bypass branch
needs `role='admin' AND platform_scope='true'`. Mounted as its own router
(not appended to the already-large api/v1/admin.py) at
/api/v1/admin/document-verification, exactly as commissions and reporting
were.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_active_user, require_platform_admin
from app.db.session import get_db
from app.schemas.document_verification import (
    DocumentSourceLiteral,
    DocumentSubjectListResponse,
    DocumentSubjectRead,
    DocumentVerifyRequest,
    VerifiableDocumentListResponse,
    VerifiableDocumentRead,
)
from app.services import document_verification, storage

router = APIRouter()


def _to_subject_read(s: document_verification.DocumentSubject) -> DocumentSubjectRead:
    return DocumentSubjectRead(
        source=s.source,
        subject_uuid=s.subject_uuid,
        lead_uuid=s.lead_uuid,
        lead_name=s.lead_name,
        lead_mobile_masked=s.lead_mobile_masked,
        business_line=s.business_line,
        subject_label=s.subject_label,
        total_count=s.total_count,
        verified_count=s.verified_count,
        latest_upload_at=s.latest_upload_at,
    )


def _to_document_read(d: document_verification.VerifiableDocument) -> VerifiableDocumentRead:
    return VerifiableDocumentRead(
        source=d.source,
        document_id=d.document_id,
        subject_uuid=d.subject_uuid,
        doc_type=d.doc_type,
        verified=d.verified,
        review_note=d.review_note,
        verified_at=d.verified_at,
        verified_by_name=d.verified_by_name,
        uploaded_at=d.uploaded_at,
        download_url=storage.presign_download(d.object_key),
    )


@router.get("/subjects", response_model=DocumentSubjectListResponse)
async def list_subjects(
    only_unverified: bool = Query(default=True),
    business_line: Literal["loans", "real_estate"] | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentSubjectListResponse:
    await require_platform_admin(current_user)
    subjects, total = await document_verification.list_subjects(
        db,
        only_unverified=only_unverified,
        business_line=business_line,
        limit=limit,
        offset=offset,
    )
    return DocumentSubjectListResponse(
        subjects=[_to_subject_read(s) for s in subjects], total=total
    )


@router.get("/documents", response_model=VerifiableDocumentListResponse)
async def list_documents(
    source: DocumentSourceLiteral,
    subject_uuid: UUID,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> VerifiableDocumentListResponse:
    await require_platform_admin(current_user)
    documents = await document_verification.list_documents(
        db, source=source, subject_uuid=subject_uuid
    )
    return VerifiableDocumentListResponse(documents=[_to_document_read(d) for d in documents])


@router.patch("/documents/{document_id}", response_model=VerifiableDocumentRead)
async def verify_document(
    document_id: UUID,
    payload: DocumentVerifyRequest,
    source: DocumentSourceLiteral,
    current_user: CurrentUser = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
) -> VerifiableDocumentRead:
    """`source` is a required query param: `document_id` alone is ambiguous
    across two tables, and two route families would mean more URLs for one
    operation."""
    await require_platform_admin(current_user)
    try:
        document = await document_verification.set_verification(
            db,
            source=source,
            document_id=document_id,
            verified=payload.verified,
            review_note=payload.review_note,
            actor_uuid=current_user.id,
            actor_staff_profile_uuid=current_user.staff_profile_uuid,
            actor_role=current_user.role,
        )
    except document_verification.DocumentNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.") from exc
    except document_verification.DocumentNoteRequired as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A note is required when marking a document unverified.",
        ) from exc
    return _to_document_read(document)
