"""Employee router — assigned-task list/detail, status/outcome update, home.

Every route depends on require_employee (app-layer gate) on top of the
tasks_rls own-assignment RLS predicate (defense in depth, same posture as
every other role-gated router in this codebase).
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_employee
from app.db.session import get_db
from app.models.lead import Lead
from app.models.task import Task, TaskDocument
from app.schemas.employee import (
    EmployeeHomeResponse,
    EmployeeTaskRead,
    EmployeeTaskUpdate,
    TaskDocumentCreate,
    TaskDocumentPresignRequest,
    TaskDocumentPresignResponse,
    TaskDocumentRead,
    TaskStatusLiteral,
    TaskTypeLiteral,
)
from app.services import storage
from app.services.employee import (
    IllegalTransition,
    OutcomeNotApplicable,
    OutcomeRequired,
    TaskAlreadyTerminal,
    TaskDocumentContentTypeUnrecognized,
    TaskDocumentKeyMismatch,
    TaskDocumentStorageUnavailable,
    TaskNotDocumentCollection,
    create_task_document,
    delete_task_document,
    get_home_summary,
    get_task_document_for_delete,
    get_task_for_employee,
    get_task_for_update,
    list_task_documents,
    list_tasks_for_employee,
    presign_task_document_upload,
    update_task,
)

router = APIRouter()


def _staff_profile_uuid(current_user: CurrentUser) -> UUID:
    if current_user.staff_profile_uuid is None:
        # pragma: no cover — every employee JWT carries one
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No staff profile on this account.")
    return current_user.staff_profile_uuid


def _to_read(task: Task, lead_name: str | None, lead_mobile: str) -> EmployeeTaskRead:
    return EmployeeTaskRead(
        id=task.id,
        lead_uuid=task.lead_uuid,
        lead_name=lead_name,
        lead_mobile=lead_mobile,
        business_line=task.business_line,
        task_type=task.task_type,
        status=task.status,
        outcome=task.outcome,
        notes=task.notes,
        due_at=task.due_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/tasks", response_model=list[EmployeeTaskRead])
async def list_tasks(
    status_filter: TaskStatusLiteral | None = None,
    task_type_filter: TaskTypeLiteral | None = None,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> list[EmployeeTaskRead]:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    rows = await list_tasks_for_employee(db, staff_profile_uuid, status_filter, task_type_filter)
    return [_to_read(task, name, mobile) for task, name, mobile in rows]


@router.get("/tasks/{task_id}", response_model=EmployeeTaskRead)
async def get_task(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeTaskRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    row = await get_task_for_employee(db, task_id, staff_profile_uuid)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return _to_read(*row)


@router.patch("/tasks/{task_id}", response_model=EmployeeTaskRead)
async def patch_task(
    task_id: UUID,
    payload: EmployeeTaskUpdate,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeTaskRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    task = await get_task_for_update(db, task_id, staff_profile_uuid)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    try:
        task = await update_task(db, task, payload)
    except IllegalTransition as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This status change isn't allowed from the task's current state.",
        ) from exc
    except OutcomeNotApplicable as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Outcome can only be set for a background_check task being marked completed.",
        ) from exc
    except OutcomeRequired as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An outcome is required to mark this background check completed.",
        ) from exc
    except TaskAlreadyTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This task is already closed; no further changes are allowed.",
        ) from exc
    lead = await db.get(Lead, task.lead_uuid)
    return _to_read(task, lead.name if lead else None, lead.mobile if lead else "")


def _to_document_read(document: TaskDocument) -> TaskDocumentRead:
    return TaskDocumentRead(
        id=document.id,
        doc_type=document.doc_type,
        verified=document.verified,
        review_note=document.review_note,
        uploaded_at=document.uploaded_at,
        download_url=storage.presign_download(document.object_key),
    )


async def _get_own_task(db: AsyncSession, task_id: UUID, staff_profile_uuid: UUID) -> Task:
    row = await get_task_for_employee(db, task_id, staff_profile_uuid)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return row[0]


@router.post("/tasks/{task_id}/documents/presign", response_model=TaskDocumentPresignResponse)
async def presign_document(
    task_id: UUID,
    payload: TaskDocumentPresignRequest,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> TaskDocumentPresignResponse:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    task = await _get_own_task(db, task_id, staff_profile_uuid)
    try:
        object_key, upload_url = presign_task_document_upload(
            task, payload.doc_type, payload.content_type
        )
    except TaskNotDocumentCollection as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Documents can only be uploaded for a document_collection task.",
        ) from exc
    except TaskAlreadyTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This task is already closed; no further changes are allowed.",
        ) from exc
    return TaskDocumentPresignResponse(object_key=object_key, upload_url=upload_url)


@router.post("/tasks/{task_id}/documents", response_model=TaskDocumentRead)
async def confirm_document(
    task_id: UUID,
    payload: TaskDocumentCreate,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> TaskDocumentRead:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    task = await _get_own_task(db, task_id, staff_profile_uuid)
    try:
        document = await create_task_document(db, task, payload.doc_type, payload.object_key)
    except TaskNotDocumentCollection as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Documents can only be uploaded for a document_collection task.",
        ) from exc
    except TaskAlreadyTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This task is already closed; no further changes are allowed.",
        ) from exc
    except TaskDocumentKeyMismatch as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This object_key wasn't issued for this task.",
        ) from exc
    except TaskDocumentContentTypeUnrecognized as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This file isn't a supported document type.",
        ) from exc
    except TaskDocumentStorageUnavailable as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Could not verify the upload. Please try again in a moment.",
        ) from exc
    return _to_document_read(document)


@router.get("/tasks/{task_id}/documents", response_model=list[TaskDocumentRead])
async def list_documents(
    task_id: UUID,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> list[TaskDocumentRead]:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    await _get_own_task(db, task_id, staff_profile_uuid)
    documents = await list_task_documents(db, task_id, staff_profile_uuid)
    return [_to_document_read(document) for document in documents]


@router.delete("/tasks/{task_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    task_id: UUID,
    document_id: UUID,
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> None:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    task = await _get_own_task(db, task_id, staff_profile_uuid)
    try:
        document = await get_task_document_for_delete(db, task, document_id)
    except TaskNotDocumentCollection as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Documents can only be uploaded for a document_collection task.",
        ) from exc
    except TaskAlreadyTerminal as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This task is already closed; no further changes are allowed.",
        ) from exc
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    await delete_task_document(db, document)


@router.get("/home", response_model=EmployeeHomeResponse)
async def home(
    current_user: CurrentUser = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
) -> EmployeeHomeResponse:
    staff_profile_uuid = _staff_profile_uuid(current_user)
    tasks_today, overdue_count, counts_by_type, counts_by_status = await get_home_summary(
        db, staff_profile_uuid
    )
    return EmployeeHomeResponse(
        tasks_today=[_to_read(task, name, mobile) for task, name, mobile in tasks_today],
        overdue_count=overdue_count,
        counts_by_type=counts_by_type,
        counts_by_status=counts_by_status,
    )
