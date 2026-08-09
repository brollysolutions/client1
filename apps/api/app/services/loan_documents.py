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

import asyncio
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.cache.redis_keys import (
    TTL_LOAN_MEDIA_PRESIGN,
    RedisCache,
    loan_media_presign_key,
)
from app.core.config import settings
from app.models.loan import LoanApplication
from app.models.loan_document import LoanDocument
from app.services import storage
from app.services.loan_applications import TERMINAL_STATUSES

logger = logging.getLogger(__name__)

PRESIGN_LIMIT_PER_HOUR = 36
_LEGACY_KEY_PREFIX = "loan-applications/"
_PRIVATE_PREFIX = "private/loan-applications/"
_STAGING_PREFIX = f"{_PRIVATE_PREFIX}staging/"
_CANONICAL_PREFIX = f"{_PRIVATE_PREFIX}canonical/"
_MEDIA_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}
_LEGACY_KEY_RE = re.compile(
    r"^loan-applications/[0-9a-f-]{36}/[0-9a-f]{32}-"
    r"(?P<doc_type>aadhaar_front|aadhaar_back|pan|salary_slip|bank_statement|sale_deed|photo|other)$"
)
_STAGING_KEY_RE = re.compile(
    r"^private/loan-applications/staging/"
    r"(?P<owner>[0-9a-f-]{36})/(?P<application>[0-9a-f-]{36})/"
    r"(?P<media>[0-9a-f-]{36})/"
    r"(?P<doc_type>aadhaar_front|aadhaar_back|pan|salary_slip|bank_statement|sale_deed|photo|other)"
    r"(?P<extension>\.jpg|\.png|\.webp|\.pdf)$"
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


class UploadRateExceeded(LoanDocumentError):
    """One account exhausted its hourly upload-presign budget."""


class ObjectKeyMismatch(LoanDocumentError):
    """A claimed object key wasn't issued for this application, or its
    doc_type suffix doesn't match the field it was submitted as."""


class UploadMissing(LoanDocumentError):
    """A claimed key has no corresponding object in storage (or it exceeds
    the signed size cap — should be unreachable given the presign policy,
    checked again here as defense in depth)."""


class StorageUnavailable(LoanDocumentError):
    """Storage was unreachable while verifying an upload. Fail closed."""


class ContentTypeMismatch(LoanDocumentError):
    """The uploaded object's actual leading bytes don't sniff to the
    content_type the client declared at presign time. Security-review
    finding (feature-status.md §2-12): the declared type is signed into the
    presigned-POST policy, but nothing previously verified the uploaded
    BYTES actually matched it — an HTML/script polyglot declared as
    application/pdf would have been accepted."""


class DocumentLimitReached(LoanDocumentError):
    pass


class DocumentNotFound(LoanDocumentError):
    pass


class DocumentAlreadyVerified(LoanDocumentError):
    """A verified document cannot be deleted through the ordinary API — see
    migration f5a6b7c8d9e0's docstring for why this guard lives here and not
    in the DELETE RLS policy."""


def build_object_key(
    client_profile_uuid: uuid.UUID,
    application_id: uuid.UUID,
    doc_type: str,
    content_type: str,
) -> str:
    media_id = uuid.uuid4()
    return (
        f"{_STAGING_PREFIX}{client_profile_uuid}/{application_id}/{media_id}/"
        f"{doc_type}{_MEDIA_EXTENSION[content_type]}"
    )


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


async def presign_document_upload(
    cache: RedisCache,
    owner_uuid: uuid.UUID,
    application: LoanApplication,
    doc_type: str,
    content_type: str,
) -> tuple[str, str, dict[str, str], int]:
    """Returns (object_key, upload_url, fields, max_bytes). No DB write — the
    row is only created once the client confirms the upload succeeded. The
    caller MUST return this exact object_key to the client — regenerating a
    fresh one afterward would sign the presigned POST policy for a key the
    client is never told about, breaking every upload with a signature
    mismatch."""
    _check_application_writable(application)
    count = await cache.incr_with_expire(
        loan_media_presign_key(str(owner_uuid)), TTL_LOAN_MEDIA_PRESIGN
    )
    if count > PRESIGN_LIMIT_PER_HOUR:
        raise UploadRateExceeded("Too many upload attempts. Try again later.")
    object_key = build_object_key(
        application.client_profile_uuid,
        application.id,
        doc_type,
        content_type,
    )
    max_bytes = settings.LOAN_DOCUMENT_MAX_UPLOAD_BYTES
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=max_bytes)
    return object_key, url, fields, max_bytes


def _check_claimed_key(
    key: str,
    application: LoanApplication,
    expected_doc_type: str,
    content_type: str,
) -> uuid.UUID:
    staging_match = _STAGING_KEY_RE.fullmatch(key)
    if staging_match is not None:
        try:
            owner_uuid = uuid.UUID(staging_match.group("owner"))
            application_id = uuid.UUID(staging_match.group("application"))
            media_id = uuid.UUID(staging_match.group("media"))
        except ValueError as exc:
            raise ObjectKeyMismatch from exc
        if (
            owner_uuid != application.client_profile_uuid
            or application_id != application.id
            or staging_match.group("doc_type") != expected_doc_type
            or staging_match.group("extension") != _MEDIA_EXTENSION[content_type]
        ):
            raise ObjectKeyMismatch
        return media_id

    legacy_prefix = f"{_LEGACY_KEY_PREFIX}{application.id}/"
    legacy_match = _LEGACY_KEY_RE.fullmatch(key)
    if (
        not key.startswith(legacy_prefix)
        or legacy_match is None
        or legacy_match.group("doc_type") != expected_doc_type
    ):
        raise ObjectKeyMismatch
    media_hex = key.removeprefix(legacy_prefix).split("-", 1)[0]
    try:
        return uuid.UUID(hex=media_hex)
    except ValueError as exc:
        raise ObjectKeyMismatch from exc


async def _verify_upload(key: str, content_type: str) -> int:
    try:
        size = await asyncio.to_thread(storage.head_object, key)
    except Exception as exc:  # transport failure — fail closed, don't swallow
        raise StorageUnavailable from exc
    if size is None or size <= 0 or size > settings.LOAN_DOCUMENT_MAX_UPLOAD_BYTES:
        raise UploadMissing
    try:
        matches = await asyncio.to_thread(storage.content_matches_declared_type, key, content_type)
    except Exception as exc:  # transport failure — fail closed, don't swallow
        raise StorageUnavailable from exc
    if not matches:
        raise ContentTypeMismatch
    return size


async def _best_effort_delete(object_key: str) -> None:
    try:
        await asyncio.to_thread(storage.delete_object, object_key)
    except Exception:
        # Never include a private storage key in logs. The scheduled orphan
        # sweep retries cleanup in both the legacy and managed namespaces.
        logger.warning("loan_media.object_cleanup_failed", exc_info=True)


def _canonical_key(
    application: LoanApplication,
    media_id: uuid.UUID,
    content_type: str,
) -> str:
    return (
        f"{_CANONICAL_PREFIX}{application.client_profile_uuid}/{application.id}/{media_id}/"
        f"asset{_MEDIA_EXTENSION[content_type]}"
    )


async def create_loan_document(
    db: AsyncSession,
    application: LoanApplication,
    *,
    doc_type: str,
    object_key: str,
    content_type: str,
    uploaded_by_uuid: uuid.UUID,
) -> LoanDocument:
    media_id = _check_claimed_key(object_key, application, doc_type, content_type)

    # Serialize confirmations for one application. This makes the 12-object
    # quota deterministic and prevents two concurrent confirmations of the
    # same staging key from copying over one canonical destination.
    locked_application = await db.scalar(
        select(LoanApplication)
        .where(
            LoanApplication.id == application.id,
            LoanApplication.client_profile_uuid == application.client_profile_uuid,
        )
        .with_for_update()
    )
    if locked_application is None:
        raise ApplicationNotFound("Loan application not found.")
    _check_application_writable(locked_application)

    replay = await db.scalar(
        select(LoanDocument.id).where(
            or_(LoanDocument.id == media_id, LoanDocument.object_key == object_key)
        )
    )
    if replay is not None:
        raise ObjectKeyMismatch("This upload has already been confirmed.")

    existing_count = await db.scalar(
        select(func.count())
        .select_from(LoanDocument)
        .where(LoanDocument.loan_application_uuid == locked_application.id)
    )
    if (existing_count or 0) >= settings.LOAN_DOCUMENT_MAX_PER_APPLICATION:
        raise DocumentLimitReached("This application already has the maximum number of documents.")

    try:
        size_bytes = await _verify_upload(object_key, content_type)
    except ContentTypeMismatch:
        # Never leave a polyglot-content object sitting in storage under a
        # claimed key just because the DB row was rejected — the orphan
        # sweep would eventually catch it, but a deliberate mismatch
        # shouldn't get to wait 1 hour.
        await _best_effort_delete(object_key)
        raise

    canonical_key = _canonical_key(locked_application, media_id, content_type)
    try:
        await asyncio.to_thread(
            storage.copy_object,
            object_key,
            canonical_key,
            content_type,
        )
        canonical_size = await _verify_upload(canonical_key, content_type)
        if canonical_size != size_bytes:
            raise StorageUnavailable
    except Exception as exc:
        await _best_effort_delete(canonical_key)
        if isinstance(exc, StorageUnavailable):
            raise
        raise StorageUnavailable from exc

    document = LoanDocument(
        id=media_id,
        loan_application_uuid=locked_application.id,
        client_profile_uuid=locked_application.client_profile_uuid,
        business_line=locked_application.business_line,
        doc_type=doc_type,
        object_key=canonical_key,
        content_type=content_type,
        size_bytes=size_bytes,
        uploaded_by_uuid=uploaded_by_uuid,
    )
    db.add(document)
    try:
        await db.flush()
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        await _best_effort_delete(canonical_key)
        raise ObjectKeyMismatch("This upload has already been confirmed.") from exc
    except Exception:
        await db.rollback()
        await _best_effort_delete(canonical_key)
        raise
    await db.refresh(document)
    await _best_effort_delete(object_key)
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
    await _best_effort_delete(object_key)


async def purge_orphaned_uploads(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete unreferenced legacy, staging, and canonical Loans media.

    A presign exists before its row, and cleanup can also be interrupted after
    a canonical copy or committed confirmation. The age floor protects active
    browser uploads while this sweep covers both storage layouts.
    """
    cutoff = datetime.now(UTC) - min_age
    object_groups = await asyncio.gather(
        asyncio.to_thread(storage.list_objects, _LEGACY_KEY_PREFIX),
        asyncio.to_thread(storage.list_objects, _PRIVATE_PREFIX),
    )
    objects = [item for group in object_groups for item in group]
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with db_session.AsyncSessionLocal() as session:
        referenced = set((await session.scalars(select(LoanDocument.object_key))).all())

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            await asyncio.to_thread(storage.delete_object, obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
