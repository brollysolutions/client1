"""Banner submit/approve/reject, plus the image-upload presign + orphan purge.

submit_banner runs on the request session under RLS (own-row, draft/rejected only
— see the banners_update policy). approve_banner/reject_banner run on a bypass
superuser session, the same mechanism as services.property_submissions: the
status flip never rides the reviewer's request transaction, and api_user's UPDATE
grant never needs to cover the approval transition. Access control is the
router's require_admin guard (RLS wouldn't gate a superuser session).

presign_banner_image_upload/purge_orphaned_uploads mirror
services/agent_applications.py's upload-presign + purge_orphaned_uploads shape
exactly (build a fresh key -> signed POST with a size cap -> sweep
storage.list_objects() against the referenced set). The one structural
difference: there is a single ref column here (Banner.image_key), not four.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.banner import Banner, BannerStatus
from app.services import storage


class BannerAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is not pending_approval."""


class BannerNotOwned(Exception):
    """Raised when submit targets a banner created by a different sub_admin.

    Distinct from "not found" (unlike property_submissions' owner-scoped
    SELECT, banners' shared-visibility SELECT means the caller can already see
    this row in their queue — a 404 here would be confusing)."""


async def submit_banner(banner_id: UUID, submitter_uuid: UUID, db: AsyncSession) -> Banner | None:
    """draft/rejected -> pending_approval, own-row only (RLS-covered)."""
    banner = await db.scalar(select(Banner).where(Banner.id == banner_id))
    if banner is None:
        return None
    if banner.created_by_uuid != submitter_uuid:
        raise BannerNotOwned
    if banner.status not in (BannerStatus.DRAFT, BannerStatus.REJECTED):
        raise BannerAlreadyReviewed
    banner.status = BannerStatus.PENDING_APPROVAL
    banner.review_note = None
    await db.commit()
    await db.refresh(banner)
    return banner


async def approve_banner(banner_id: UUID, reviewer_uuid: UUID) -> Banner | None:
    async with AsyncSessionLocal() as session:
        # FOR UPDATE: serialize concurrent approvals so a second reviewer sees
        # status != pending_approval.
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.APPROVED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = None
        await session.commit()
        await session.refresh(banner)
        return banner


async def reject_banner(banner_id: UUID, reviewer_uuid: UUID, note: str) -> Banner | None:
    async with AsyncSessionLocal() as session:
        banner = await session.get(Banner, banner_id, with_for_update=True)
        if banner is None:
            return None
        if banner.status != BannerStatus.PENDING_APPROVAL:
            raise BannerAlreadyReviewed
        banner.status = BannerStatus.REJECTED
        banner.approved_by_uuid = reviewer_uuid
        banner.review_note = note
        await session.commit()
        await session.refresh(banner)
        return banner


_IMAGE_KEY_PREFIX = "public/banners/"
IMAGE_MAX_BYTES = 2 * 1024 * 1024  # 2 MiB
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


class UnsupportedImageType(Exception):
    """Raised when the requested content_type isn't jpeg/png/webp."""


def build_image_key(filename: str) -> str:
    # A fresh uuid4 per call (not per-banner) so re-uploading the image on an
    # already-LIVE banner lands at a new key -- the DB row swaps to it
    # atomically on save, and the old object becomes an orphan the purge job
    # collects, rather than overwriting a key a CDN/browser may have cached.
    safe_name = _SAFE_NAME_RE.sub("_", filename).lstrip(".")[-100:] or "image"
    return f"{_IMAGE_KEY_PREFIX}{uuid.uuid4()}/{safe_name}"


def presign_banner_image_upload(
    content_type: str, filename: str
) -> tuple[str, dict[str, str], str]:
    """Returns (upload_url, fields, object_key). See storage.presign_upload_post
    for the multipart-POST shape the caller must replay to `upload_url`.

    content_type is signed into the POST policy itself (jpeg/png/webp only) --
    storage rejects a mismatched or oversize body regardless of what the
    browser claims, the same posture as the agent-application KYC upload.
    """
    if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        raise UnsupportedImageType
    object_key = build_image_key(filename)
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=IMAGE_MAX_BYTES)
    return url, fields, object_key


# An uploaded-then-abandoned image (form filled, file picked, page closed
# before Save) is the only orphan class here -- unlike agent-applications'
# 15-min ticket TTL, there's no external time bound on "abandoned", so this
# mirrors loan_documents' 1h floor rather than agent-applications' 48h one:
# short enough that a stale draft doesn't keep a live-looking image key
# around for days, long enough that no in-progress form submission can race it.
_ORPHAN_MIN_AGE = timedelta(hours=1)


async def purge_orphaned_uploads(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete objects under public/banners/ that no Banner row references.

    Same shape as services/agent_applications.py::purge_orphaned_uploads, one
    referenced column instead of four. Runs on a fresh bypass session (no
    request context in a scheduler tick) purely to read image_key -- RLS is
    irrelevant to a read-only column scan with no row-level sensitivity.
    """
    cutoff = datetime.now(UTC) - min_age
    objects = storage.list_objects(_IMAGE_KEY_PREFIX)
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with AsyncSessionLocal() as session:
        referenced = set(
            (
                await session.scalars(select(Banner.image_key).where(Banner.image_key.is_not(None)))
            ).all()
        )

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            storage.delete_object(obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
