"""Unified Admin document verification — task_documents (employee-collected)
+ loan_documents (client-uploaded), FR-7.4.

Runs on the CALLER's request session, not a bypass session: both
`task_documents_update` (migration c8d9e0f1a2b3) and `loan_documents_update`
(migration f5a6b7c8d9e0) already have a genuine admin-only branch, and the
column-scoped GRANT covers exactly the four verification columns on both
tables — the same posture `services/support_tickets.py` takes, and for the
identical reason: RLS has a real admin branch and the GRANT already covers
the columns, so there is no RLS gap here to route a bypass session around.

"Completeness" is deliberately NOT a machine-checked required-document
matrix (no such thing is defined anywhere in spec) — it surfaces here only
as an aggregate ("3 of 5 verified") per subject. `verified` stays a plain
boolean; "rejected" is `verified=false` plus a non-null `review_note`.

Subject attribution is the LEAD, not the task or the loan application
directly: `tasks.lead_uuid` and `loan_applications.lead_uuid` are both
NOT NULL and are the only key that already exists on both sides with no
schema change. The console groups documents from both sources under the
same lead in the UI; the query itself is NOT a SQL UNION (two unrelated
table shapes) — two independently capped subqueries, merged and sorted in
Python, mirroring services/commissions.py::list_eligible_deals exactly.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.masking import mask_mobile
from app.models.audit_log import AuditAction
from app.models.lead import Lead
from app.models.loan import LoanApplication, LoanType
from app.models.loan_document import LoanDocument
from app.models.notification import NotificationType
from app.models.profile import ClientProfile, StaffProfile
from app.models.task import Task, TaskDocument
from app.services.audit_log import record as record_audit
from app.services.notifications import emit_notification

_SUBQUERY_CAP = 200

DocumentSource = Literal["task", "loan_application"]


class DocumentNotFound(Exception):
    pass


class DocumentNoteRequired(Exception):
    """Unverifying a document (verified -> False) requires a non-empty
    review_note — that note is the only thing that tells the uploader what
    to fix."""


@dataclass(frozen=True)
class DocumentSubject:
    source: DocumentSource
    subject_uuid: uuid.UUID
    lead_uuid: uuid.UUID
    lead_name: str | None
    lead_mobile_masked: str
    business_line: str
    subject_label: str
    total_count: int
    verified_count: int
    latest_upload_at: datetime


@dataclass(frozen=True)
class VerifiableDocument:
    source: DocumentSource
    document_id: uuid.UUID
    subject_uuid: uuid.UUID
    doc_type: str
    verified: bool
    review_note: str | None
    verified_at: datetime | None
    verified_by_name: str | None
    uploaded_at: datetime
    object_key: str  # never leaves the service — router mints download_url


def _name_expr(user_model):
    full_name = func.concat_ws(" ", user_model.first_name, user_model.last_name)
    return func.nullif(func.trim(full_name), "")


async def list_subjects(
    db: AsyncSession,
    *,
    only_unverified: bool = True,
    business_line: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DocumentSubject], int]:
    task_stmt = (
        select(
            Task.id.label("subject_uuid"),
            Task.lead_uuid,
            Task.business_line,
            Task.task_type,
            Lead.name.label("lead_name"),
            Lead.mobile.label("lead_mobile"),
            func.count(TaskDocument.id).label("total_count"),
            func.count(TaskDocument.id)
            .filter(TaskDocument.verified.is_(True))
            .label("verified_count"),
            func.max(TaskDocument.uploaded_at).label("latest_upload_at"),
        )
        .join(TaskDocument, TaskDocument.task_uuid == Task.id)
        .join(Lead, Lead.id == Task.lead_uuid)
        .group_by(Task.id, Lead.name, Lead.mobile)
    )
    loan_stmt = (
        select(
            LoanApplication.id.label("subject_uuid"),
            LoanApplication.lead_uuid,
            LoanApplication.business_line,
            LoanType.label.label("loan_type_label"),
            Lead.name.label("lead_name"),
            Lead.mobile.label("lead_mobile"),
            func.count(LoanDocument.id).label("total_count"),
            func.count(LoanDocument.id)
            .filter(LoanDocument.verified.is_(True))
            .label("verified_count"),
            func.max(LoanDocument.uploaded_at).label("latest_upload_at"),
        )
        .join(LoanDocument, LoanDocument.loan_application_uuid == LoanApplication.id)
        .join(Lead, Lead.id == LoanApplication.lead_uuid)
        .join(LoanType, LoanType.id == LoanApplication.loan_type_id)
        .group_by(LoanApplication.id, LoanType.label, Lead.name, Lead.mobile)
    )

    if business_line is not None:
        task_stmt = task_stmt.where(Task.business_line == business_line)
        loan_stmt = loan_stmt.where(LoanApplication.business_line == business_line)
    if only_unverified:
        task_stmt = task_stmt.having(
            func.count(TaskDocument.id).filter(TaskDocument.verified.is_(False)) > 0
        )
        loan_stmt = loan_stmt.having(
            func.count(LoanDocument.id).filter(LoanDocument.verified.is_(False)) > 0
        )

    task_stmt = task_stmt.order_by(func.max(TaskDocument.uploaded_at).desc()).limit(_SUBQUERY_CAP)
    loan_stmt = loan_stmt.order_by(func.max(LoanDocument.uploaded_at).desc()).limit(_SUBQUERY_CAP)

    task_rows = (await db.execute(task_stmt)).all()
    loan_rows = (await db.execute(loan_stmt)).all()

    subjects = [
        DocumentSubject(
            source="task",
            subject_uuid=r.subject_uuid,
            lead_uuid=r.lead_uuid,
            lead_name=r.lead_name,
            lead_mobile_masked=mask_mobile(r.lead_mobile),
            business_line=r.business_line,
            subject_label=f"Field task ({r.task_type.value.replace('_', ' ')})",
            total_count=r.total_count,
            verified_count=r.verified_count,
            latest_upload_at=r.latest_upload_at,
        )
        for r in task_rows
    ] + [
        DocumentSubject(
            source="loan_application",
            subject_uuid=r.subject_uuid,
            lead_uuid=r.lead_uuid,
            lead_name=r.lead_name,
            lead_mobile_masked=mask_mobile(r.lead_mobile),
            business_line=r.business_line,
            subject_label=f"{r.loan_type_label} application",
            total_count=r.total_count,
            verified_count=r.verified_count,
            latest_upload_at=r.latest_upload_at,
        )
        for r in loan_rows
    ]
    subjects.sort(key=lambda s: s.latest_upload_at, reverse=True)
    total = len(subjects)
    return subjects[offset : offset + limit], total


async def list_documents(
    db: AsyncSession, *, source: DocumentSource, subject_uuid: uuid.UUID
) -> list[VerifiableDocument]:
    if source == "task":
        stmt = (
            select(TaskDocument)
            .where(TaskDocument.task_uuid == subject_uuid)
            .order_by(TaskDocument.uploaded_at.desc())
        )
        rows = (await db.scalars(stmt)).all()
        verifier_ids = {r.verified_by_profile_uuid for r in rows if r.verified_by_profile_uuid}
        names = await _resolve_staff_names(db, verifier_ids)
        return [
            VerifiableDocument(
                source="task",
                document_id=r.id,
                subject_uuid=r.task_uuid,
                doc_type=r.doc_type,
                verified=r.verified,
                review_note=r.review_note,
                verified_at=r.verified_at,
                verified_by_name=names.get(r.verified_by_profile_uuid),
                uploaded_at=r.uploaded_at,
                object_key=r.object_key,
            )
            for r in rows
        ]

    stmt = (
        select(LoanDocument)
        .where(LoanDocument.loan_application_uuid == subject_uuid)
        .order_by(LoanDocument.uploaded_at.desc())
    )
    rows = (await db.scalars(stmt)).all()
    verifier_ids = {r.verified_by_profile_uuid for r in rows if r.verified_by_profile_uuid}
    names = await _resolve_staff_names(db, verifier_ids)
    return [
        VerifiableDocument(
            source="loan_application",
            document_id=r.id,
            subject_uuid=r.loan_application_uuid,
            doc_type=r.doc_type,
            verified=r.verified,
            review_note=r.review_note,
            verified_at=r.verified_at,
            verified_by_name=names.get(r.verified_by_profile_uuid),
            uploaded_at=r.uploaded_at,
            object_key=r.object_key,
        )
        for r in rows
    ]


async def _resolve_staff_names(
    db: AsyncSession, staff_profile_uuids: set[uuid.UUID]
) -> dict[uuid.UUID, str | None]:
    """Batch resolve verifier display names — one query regardless of how
    many distinct verifiers appear on a page, same discipline
    support_tickets.py::_resolve_requesters uses."""
    if not staff_profile_uuids:
        return {}
    from app.models.user import User

    stmt = (
        select(StaffProfile.id, _name_expr(User))
        .join(User, User.id == StaffProfile.auth_user_uuid)
        .where(StaffProfile.id.in_(staff_profile_uuids))
    )
    rows = (await db.execute(stmt)).all()
    return {row[0]: row[1] for row in rows}


async def set_verification(
    db: AsyncSession,
    *,
    source: DocumentSource,
    document_id: uuid.UUID,
    verified: bool,
    review_note: str | None,
    actor_uuid: uuid.UUID,
    actor_staff_profile_uuid: uuid.UUID | None,
    actor_role: str | None,
) -> VerifiableDocument:
    if not verified and not (review_note and review_note.strip()):
        raise DocumentNoteRequired("A note is required when marking a document unverified.")

    now = datetime.utcnow()
    if source == "task":
        document = await db.scalar(
            select(TaskDocument).where(TaskDocument.id == document_id).with_for_update()
        )
        if document is None:
            raise DocumentNotFound("Document not found.")
        document.verified = verified
        document.verified_by_profile_uuid = actor_staff_profile_uuid
        document.verified_at = now
        document.review_note = review_note
        subject_uuid = document.task_uuid
        notify_target = await _resolve_task_notify_target(db, document.task_uuid)
        notify_href = "/dashboard/tasks"
    else:
        document = await db.scalar(
            select(LoanDocument).where(LoanDocument.id == document_id).with_for_update()
        )
        if document is None:
            raise DocumentNotFound("Document not found.")
        document.verified = verified
        document.verified_by_profile_uuid = actor_staff_profile_uuid
        document.verified_at = now
        document.review_note = review_note
        subject_uuid = document.loan_application_uuid
        notify_target = await _resolve_loan_notify_target(db, document.loan_application_uuid)
        notify_href = "/dashboard/documents"

    # Values only, never keys shaped like "<field>_verified" or similar —
    # _assert_detail_is_safe matches PII substrings against KEYS.
    await record_audit(
        db,
        action=AuditAction.DOCUMENT_VERIFIED if verified else AuditAction.DOCUMENT_UNVERIFIED,
        entity_type="task_document" if source == "task" else "loan_document",
        entity_uuid=document.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        detail={
            "source": source,
            "subject_uuid": str(subject_uuid),
            "doc_type": document.doc_type,
            "verified": verified,
        },
    )
    await db.commit()
    await db.refresh(document)

    if not verified and notify_target is not None:
        await emit_notification(
            user_uuid=notify_target,
            notification_type=NotificationType.DOCUMENT_REVIEW_UPDATED,
            title="A document needs another look",
            body=(review_note or "").strip() or "One of your documents needs to be re-uploaded.",
            href=notify_href,
        )

    verifier_name = None
    if actor_staff_profile_uuid is not None:
        names = await _resolve_staff_names(db, {actor_staff_profile_uuid})
        verifier_name = names.get(actor_staff_profile_uuid)

    return VerifiableDocument(
        source=source,
        document_id=document.id,
        subject_uuid=subject_uuid,
        doc_type=document.doc_type,
        verified=document.verified,
        review_note=document.review_note,
        verified_at=document.verified_at,
        verified_by_name=verifier_name,
        uploaded_at=document.uploaded_at,
        object_key=document.object_key,
    )


async def _resolve_task_notify_target(db: AsyncSession, task_id: uuid.UUID) -> uuid.UUID | None:
    task = await db.get(Task, task_id)
    if task is None or task.assigned_employee_profile_uuid is None:
        return None
    employee = await db.get(StaffProfile, task.assigned_employee_profile_uuid)
    return employee.auth_user_uuid if employee is not None else None


async def _resolve_loan_notify_target(
    db: AsyncSession, application_id: uuid.UUID
) -> uuid.UUID | None:
    application = await db.get(LoanApplication, application_id)
    if application is None:
        return None
    client = await db.get(ClientProfile, application.client_profile_uuid)
    return client.auth_user_uuid if client is not None else None
