"""Client KYC-upload against a loan application (docs/specs/client-kyc-upload.md).

Everything except `purge_orphaned_uploads` runs on the CALLER's request
session: `loan_documents_insert`/`_delete` RLS already requires the caller
to be the owning client, and `loan_documents_select` already scopes reads —
trusting RLS here is the same convention every other service in this
codebase uses once a real per-command policy exists.

Signed-POST upload (not the uncapped PUT `presign_upload` uses for
authenticated staff): a client is self-registered behind only a voice-OTP
mobile check, a materially weaker trust boundary than an Admin-provisioned
staff account, so nothing should depend on the browser behaving. Confirm-
time `head_object` verification (`_verify_upload`) is stricter than the
employee path for the same reason — a row can never point at a missing or
oversize object.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.config import settings
from app.models.loan import LoanApplication
from app.models.loan_document import LoanDocument
from app.services import storage
from app.services.loan_applications import TERMINAL_STATUSES

_KEY_PREFIX = "loan-applications/"
_KEY_RE = re.compile(
    r"^loan-applications/[0-9a-f-]{36}/[0-9a-f]{32}-"
    r"(aadhaar_front|aadhaar_back|pan|salary_slip|bank_statement|sale_deed|photo|other)$"
)
# Well clear of the 300s presign TTL, so an in-flight upload is never mistaken
# for an orphan — same margin agent-application orphan purge uses.
_ORPHAN_MIN_AGE = timedelta(hours=1)


class LoanDocumentError(Exception):
    """Base for loan-document service errors; the router maps subclasses to HTTP."""


class ApplicationNotFound(LoanDocumentError):
    pass


class ApplicationNotWritable(LoanDocumentError):
    """The application is in a terminal status (closed/rejected) — no
    further document writes are accepted."""


class ObjectKeyMismatch(LoanDocumentError):
    """A claimed object key wasn't issued for this application, or its
    doc_type suffix doesn't match the field it was submitted as."""


class UploadMissing(LoanDocumentError):
    """A claimed key has no corresponding object in storage (or it exceeds
    the signed size cap — should be unreachable given the presign policy,
    checked again here as defense in depth)."""


class StorageUnavailable(LoanDocumentError):
    """Storage was unreachable while verifying an upload. Fail closed."""


class DocumentLimitReached(LoanDocumentError):
    pass


class DocumentNotFound(LoanDocumentError):
    pass


class DocumentAlreadyVerified(LoanDocumentError):
    """A verified document cannot be deleted through the ordinary API — see
    migration f5a6b7c8d9e0's docstring for why this guard lives here and not
    in the DELETE RLS policy."""


def build_object_key(application_id: uuid.UUID, doc_type: str) -> str:
    return f"{_KEY_PREFIX}{application_id}/{uuid.uuid4().hex}-{doc_type}"


async def get_own_application(
    db: AsyncSession, application_id: uuid.UUID, client_profile_uuid: uuid.UUID
) -> LoanApplication:
    application = await db.get(LoanApplication, application_id)
    if application is None or application.client_profile_uuid != client_profile_uuid:
        # RLS already filters rows outside the caller's access; a miss here
        # reads the same as "does not exist", same posture as GET /applications/{id}.
        raise ApplicationNotFound("Loan application not found.")
    return application


def _check_application_writable(application: LoanApplication) -> None:
    if application.status in TERMINAL_STATUSES:
        raise ApplicationNotWritable(
            "This application is closed; no further documents can be added."
        )


def presign_document_upload(
    application: LoanApplication, doc_type: str, content_type: str
) -> tuple[str, str, dict[str, str], int]:
    """Returns (object_key, upload_url, fields, max_bytes). No DB write — the
    row is only created once the client confirms the upload succeeded. The
    caller MUST return this exact object_key to the client — regenerating a
    fresh one afterward would sign the presigned POST policy for a key the
    client is never told about, breaking every upload with a signature
    mismatch."""
    _check_application_writable(application)
    object_key = build_object_key(application.id, doc_type)
    max_bytes = settings.LOAN_DOCUMENT_MAX_UPLOAD_BYTES
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=max_bytes)
    return object_key, url, fields, max_bytes


def _check_claimed_key(key: str, application_id: uuid.UUID, expected_doc_type: str) -> None:
    if not key.startswith(f"{_KEY_PREFIX}{application_id}/"):
        raise ObjectKeyMismatch
    match = _KEY_RE.match(key)
    if match is None or match.group(1) != expected_doc_type:
        raise ObjectKeyMismatch


def _verify_upload(key: str) -> int:
    try:
        size = storage.head_object(key)
    except Exception as exc:  # transport failure — fail closed, don't swallow
        raise StorageUnavailable from exc
    if size is None or size <= 0 or size > settings.LOAN_DOCUMENT_MAX_UPLOAD_BYTES:
        raise UploadMissing
    return size


async def create_loan_document(
    db: AsyncSession,
    application: LoanApplication,
    *,
    doc_type: str,
    object_key: str,
    content_type: str,
    uploaded_by_uuid: uuid.UUID,
) -> LoanDocument:
    _check_application_writable(application)
    _check_claimed_key(object_key, application.id, doc_type)
    size_bytes = _verify_upload(object_key)

    existing_count = len(
        (
            await db.scalars(
                select(LoanDocument.id).where(LoanDocument.loan_application_uuid == application.id)
            )
        ).all()
    )
    if existing_count >= settings.LOAN_DOCUMENT_MAX_PER_APPLICATION:
        raise DocumentLimitReached("This application already has the maximum number of documents.")

    document = LoanDocument(
        loan_application_uuid=application.id,
        client_profile_uuid=application.client_profile_uuid,
        business_line=application.business_line,
        doc_type=doc_type,
        object_key=object_key,
        content_type=content_type,
        size_bytes=size_bytes,
        uploaded_by_uuid=uploaded_by_uuid,
    )
    db.add(document)
    try:
        await db.flush()
    except IntegrityError as exc:
        # uq_loan_documents_object_key — a claimed key replay.
        raise ObjectKeyMismatch("This object_key has already been used.") from exc
    await db.commit()
    await db.refresh(document)
    return document


async def list_loan_documents(db: AsyncSession, application_id: uuid.UUID) -> list[LoanDocument]:
    stmt = (
        select(LoanDocument)
        .where(LoanDocument.loan_application_uuid == application_id)
        .order_by(LoanDocument.uploaded_at.desc())
    )
    return list((await db.scalars(stmt)).all())


async def list_for_client(db: AsyncSession) -> list[LoanDocument]:
    """All of the caller's own documents across every application — RLS's
    client-owner branch is the only filter that matters, same trust-RLS
    stance list_for_agent (commissions) takes."""
    stmt = select(LoanDocument).order_by(LoanDocument.uploaded_at.desc())
    return list((await db.scalars(stmt)).all())


async def delete_loan_document(
    db: AsyncSession, application_id: uuid.UUID, document_id: uuid.UUID
) -> None:
    document = await db.scalar(
        select(LoanDocument).where(
            LoanDocument.id == document_id,
            LoanDocument.loan_application_uuid == application_id,
        )
    )
    if document is None:
        raise DocumentNotFound("Document not found.")
    if document.verified:
        raise DocumentAlreadyVerified("A verified document cannot be deleted.")
    object_key = document.object_key
    await db.delete(document)
    await db.commit()
    storage.delete_object(object_key)


async def purge_orphaned_uploads(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete objects under loan-applications/ that no LoanDocument row
    references. The presign happens before the confirm row exists, so an
    abandoned upload (client picked a file, never confirmed) is guaranteed
    to leave an object with nothing pointing at it — this job is the only
    place that class of leftover gets cleaned up. Required, not optional
    (unlike the pre-existing gap on tasks/ — see feature-status.md §2)."""
    cutoff = datetime.now(UTC) - min_age
    objects = storage.list_objects(_KEY_PREFIX)
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with db_session.AsyncSessionLocal() as session:
        referenced = set((await session.scalars(select(LoanDocument.object_key))).all())

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            storage.delete_object(obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
