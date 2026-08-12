"""Public agent-application intake — OTP ticket lifecycle, upload-key
verification, and the upsert write (docs/specs/agent-application-intake.md).

Security invariants (see also the security-review checklist in the spec):
  * The applicant's mobile is proven by OTP and travels ONLY inside the
    signed ticket — the final submit request has no `mobile` field, so a
    caller can never bind an application to a number it didn't verify.
  * The ticket JWT carries no `sub` claim. core.deps.get_current_user rejects
    any token without one, so this ticket can never be replayed as a normal
    access token even though it's signed with the same key.
  * Email fallback is OFF for this OTP purpose (otp_delivery.deliver_otp
    allow_email_fallback=False) — the applicant's email is self-asserted,
    unverified input; falling back to it would let someone who cannot answer
    the victim's phone still receive the code.
  * The write runs on its own AsyncSessionLocal() session (the `app`
    superuser). A public route never runs SET LOCAL ROLE api_user, so RLS
    never engages for it regardless.
"""

from __future__ import annotations

import logging
import math
import re
import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.cache.redis_keys import (
    TTL_AGENT_APPLY_OTP_DAILY,
    TTL_AGENT_APPLY_PRESIGN,
    TTL_AGENT_APPLY_RATE,
    RedisCache,
    agent_apply_otp_daily_key,
    agent_apply_presign_key,
    agent_apply_rate_ip_key,
    jwt_blacklist_key,
)
from app.core.config import settings
from app.core.masking import mask_mobile
from app.core.security import create_access_token, decode_access_token
from app.db.session import AsyncSessionLocal
from app.models.profile import AgentApplication
from app.models.user import User
from app.schemas.agent_applications import (
    AgentApplicationSubmitRequest,
    AgentApplyOtpInitiateResponse,
    AgentApplyTicketResponse,
    AgentApplyUploadPresignResponse,
)
from app.services import storage
from app.services.otp import check_otp_rate_ip, generate_and_store_otp, resend_otp, verify_otp
from app.services.otp_delivery import deliver_otp

logger = logging.getLogger(__name__)

_PURPOSE = "agent_apply"
_KEY_PREFIX = "agent-applications/"
_KEY_RE = re.compile(
    r"^agent-applications/[0-9a-f-]{36}/[0-9a-f]{32}-(aadhaar_front|aadhaar_back|pan|photo)$"
)


class InvalidApplicationTicket(Exception):
    """Ticket missing/expired/malformed/wrong purpose."""


class ApplicationTicketAlreadyUsed(Exception):
    """Ticket already burned by a prior submit."""


class ObjectKeyMismatch(Exception):
    """A claimed object key wasn't issued for this ticket, or its doc_type
    suffix doesn't match the field it was submitted as."""


class UploadMissing(Exception):
    """A claimed key has no corresponding object in storage (or it exceeds
    the signed size cap — should be unreachable given the presign policy,
    checked again here as defense in depth)."""


class StorageUnavailable(Exception):
    """Storage was unreachable while verifying an upload. Fail closed."""


class ContentTypeUnrecognized(Exception):
    """The uploaded object's actual leading bytes don't sniff to any of the
    accepted document content types. Security-review finding (feature-
    status.md §2-12): the declared content_type is signed into the
    presigned-POST policy, but nothing previously verified the uploaded
    BYTES — an HTML/script polyglot declared as application/pdf would have
    been accepted. This ticket's submit request doesn't carry the originally
    -declared content_type back, so this checks "is it a real file of an
    accepted type" rather than "does it match what was declared"."""


class PresignQuotaExceeded(Exception):
    """Too many presign calls for this ticket."""


class SubmitRateLimitExceeded(Exception):
    """Too many submits from this IP (separate from the OTP-initiate caps)."""


class OtpDailyLimitExceeded(Exception):
    """Too many OTP sends for this mobile today, purpose-scoped.

    Additional to the shared otp_rate/{mobile} budget (5/day across register/
    reset/agent_apply): this route needs only a target mobile number and no
    account to exist, so without its own cap an attacker could exhaust a
    victim's entire shared daily OTP budget through this route alone,
    locking them out of register/forgot for the day.
    """


def _is_mock_env() -> bool:
    # Same fail-closed gate as services.auth_service._is_mock_env (duplicated
    # rather than imported — that helper is private to auth_service).
    return settings.OTP_EXPOSE_HINT or settings.ENV == "development"


async def _check_otp_daily_limit(cache: RedisCache, mobile: str) -> None:
    count = await cache.incr_with_expire(
        agent_apply_otp_daily_key(mobile), TTL_AGENT_APPLY_OTP_DAILY
    )
    if count > settings.AGENT_APPLY_OTP_DAILY_LIMIT:
        raise OtpDailyLimitExceeded


async def initiate_otp(
    cache: RedisCache, mobile: str, *, ip: str | None
) -> AgentApplyOtpInitiateResponse:
    await check_otp_rate_ip(cache, ip)
    await _check_otp_daily_limit(cache, mobile)
    otp = await generate_and_store_otp(cache, mobile, _PURPOSE)
    # email="" is never actually used: allow_email_fallback=False means the
    # email-fallback branch inside deliver_otp is never reached.
    channel = await deliver_otp(mobile, "", otp, allow_email_fallback=False)
    return AgentApplyOtpInitiateResponse(
        message="Verification code sent. You will receive a call shortly.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


async def resend(
    cache: RedisCache, mobile: str, *, ip: str | None
) -> AgentApplyOtpInitiateResponse:
    # No _check_otp_daily_limit here, deliberately: resend_otp already has its
    # own dedicated cap (3 resends per window, then a 1h lock — services/otp.py).
    # Counting resends against the same tiny daily budget as initiate would
    # let a single legitimate verify-then-resend session exhaust it, blocking
    # a real applicant before they ever hit resend's own limit.
    await check_otp_rate_ip(cache, ip)  # resend is an initiate path (places a call)
    otp = await resend_otp(cache, mobile, _PURPOSE)
    channel = await deliver_otp(mobile, "", otp, allow_email_fallback=False)
    return AgentApplyOtpInitiateResponse(
        message="Code resent.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


async def verify_otp_issue_ticket(
    cache: RedisCache, mobile: str, otp: str
) -> AgentApplyTicketResponse:
    await verify_otp(cache, mobile, _PURPOSE, otp)
    # No `sub` claim, deliberately — see module docstring.
    ticket = create_access_token({"purpose": _PURPOSE, "mobile": mobile})
    return AgentApplyTicketResponse(
        application_ticket=ticket,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def _decode_ticket(cache: RedisCache, token: str) -> tuple[str, str, int]:
    """Returns (mobile, jti, exp). Raises InvalidApplicationTicket /
    ApplicationTicketAlreadyUsed."""
    try:
        claims = decode_access_token(token)
    except JWTError as exc:
        raise InvalidApplicationTicket from exc

    if claims.get("purpose") != _PURPOSE:
        raise InvalidApplicationTicket
    mobile = claims.get("mobile")
    jti = claims.get("jti")
    exp = claims.get("exp")
    if not mobile or not jti or not exp:
        raise InvalidApplicationTicket
    if await cache.exists(jwt_blacklist_key(jti)):
        raise ApplicationTicketAlreadyUsed
    return mobile, jti, int(exp)


def build_object_key(jti: str, doc_type: str) -> str:
    return f"{_KEY_PREFIX}{jti}/{uuid.uuid4().hex}-{doc_type}"


async def presign_document(
    cache: RedisCache,
    application_ticket: str,
    doc_type: str,
    content_type: str,
) -> AgentApplyUploadPresignResponse:
    _mobile, jti, _exp = await _decode_ticket(cache, application_ticket)

    quota_count = await cache.incr_with_expire(
        agent_apply_presign_key(jti), TTL_AGENT_APPLY_PRESIGN
    )
    if quota_count > settings.AGENT_APPLY_PRESIGN_LIMIT_PER_TICKET:
        raise PresignQuotaExceeded

    object_key = build_object_key(jti, doc_type)
    max_bytes = settings.AGENT_APPLICATION_MAX_UPLOAD_BYTES
    url, fields = storage.presign_upload_post(object_key, content_type, max_bytes=max_bytes)
    return AgentApplyUploadPresignResponse(
        object_key=object_key,
        upload_url=url,
        fields=fields,
        max_bytes=max_bytes,
    )


def _check_claimed_key(key: str, jti: str, expected_doc_type: str) -> None:
    if not key.startswith(f"{_KEY_PREFIX}{jti}/"):
        raise ObjectKeyMismatch
    match = _KEY_RE.match(key)
    if match is None or match.group(1) != expected_doc_type:
        raise ObjectKeyMismatch


def _verify_upload(key: str) -> None:
    try:
        size = storage.head_object(key)
    except Exception as exc:  # transport failure — fail closed, don't swallow
        raise StorageUnavailable from exc
    if size is None or size <= 0 or size > settings.AGENT_APPLICATION_MAX_UPLOAD_BYTES:
        raise UploadMissing
    try:
        recognized = storage.content_type_is_recognized(key)
    except Exception as exc:  # transport failure — fail closed, don't swallow
        raise StorageUnavailable from exc
    if not recognized:
        storage.delete_object(key)  # never leave a polyglot object under a claimed key
        raise ContentTypeUnrecognized


async def submit(
    cache: RedisCache,
    payload: AgentApplicationSubmitRequest,
    *,
    ip: str | None,
) -> None:
    if ip:
        ip_count = await cache.incr_with_expire(agent_apply_rate_ip_key(ip), TTL_AGENT_APPLY_RATE)
        if ip_count > settings.AGENT_APPLY_RATE_LIMIT_PER_IP:
            raise SubmitRateLimitExceeded

    mobile, jti, exp = await _decode_ticket(cache, payload.application_ticket)

    key_map = {
        "aadhaar_front": payload.aadhaar_front_key,
        "aadhaar_back": payload.aadhaar_back_key,
        "pan": payload.pan_key,
        "photo": payload.photo_key,
    }
    for doc_type, key in key_map.items():
        _check_claimed_key(key, jti, doc_type)
    if len({*key_map.values()}) != 4:
        raise ObjectKeyMismatch
    for key in key_map.values():
        _verify_upload(key)

    # Burn AFTER validating everything else: a rejected submission (bad key,
    # missing upload) never spends the ticket, so the applicant can retry
    # without re-verifying their mobile. Burn BEFORE the DB write (mirrors
    # forgot_reset) so two concurrent submits of the same ticket can't both
    # pass — the loser gets ApplicationTicketAlreadyUsed instead of a race
    # on the upsert.
    ttl = max(1, math.ceil(exp - datetime.now(UTC).timestamp()))
    if not await cache.set_nx(jwt_blacklist_key(jti), 1, ttl):
        raise ApplicationTicketAlreadyUsed

    async with AsyncSessionLocal() as session:
        applicant_auth_user_uuid = await session.scalar(
            select(User.id).where(User.mobile == mobile)
        )

        stmt = pg_insert(AgentApplication).values(
            applicant_auth_user_uuid=applicant_auth_user_uuid,
            first_name=payload.first_name,
            last_name=payload.last_name,
            mobile=mobile,
            email=payload.email,
            business_line=payload.business_line,
            aadhaar_ref=key_map["aadhaar_front"],
            aadhaar_back_ref=key_map["aadhaar_back"],
            pan_ref=key_map["pan"],
            photo_ref=key_map["photo"],
            rera_code=payload.rera_code,
            status="pending",
        )
        # business_line is deliberately absent from set_: it's the conflict
        # key (see migration c1d2e3f4a5b6), never mutated on update, so
        # trg_agent_applications_business_line_immutable stays a no-op.
        # created_at is also absent — a re-apply refreshes content, not the
        # queue's first-seen ordering.
        stmt = stmt.on_conflict_do_update(
            index_elements=[AgentApplication.mobile, AgentApplication.business_line],
            index_where=text("status = 'pending' AND mobile IS NOT NULL"),
            set_={
                "applicant_auth_user_uuid": stmt.excluded.applicant_auth_user_uuid,
                "first_name": stmt.excluded.first_name,
                "last_name": stmt.excluded.last_name,
                "email": stmt.excluded.email,
                "aadhaar_ref": stmt.excluded.aadhaar_ref,
                "aadhaar_back_ref": stmt.excluded.aadhaar_back_ref,
                "pan_ref": stmt.excluded.pan_ref,
                "photo_ref": stmt.excluded.photo_ref,
                "rera_code": stmt.excluded.rera_code,
            },
        )
        await session.execute(stmt)
        await session.commit()

    logger.info("agent_application.submitted mobile=%s", mask_mobile(mobile))


# Well clear of the 15-min ticket TTL, so an in-flight submit is never mistaken
# for an orphan.
_ORPHAN_MIN_AGE = timedelta(hours=48)

_DOC_REF_COLUMNS = (
    AgentApplication.aadhaar_ref,
    AgentApplication.aadhaar_back_ref,
    AgentApplication.pan_ref,
    AgentApplication.photo_ref,
)


def scrub_documents(application: AgentApplication) -> list[str]:
    """Nulls every doc-ref column on an already-loaded, in-session
    application and returns the storage keys that were referenced, for the
    caller to delete via storage.delete_object once the row is durable
    (flush/commit first — a storage failure must never roll back the DB
    write, same discipline as purge_orphaned_uploads above).

    Single source of truth for "which columns are KYC doc refs" — used by
    both services.admin.reject_agent_application (feature-status.md §2-11:
    a rejected application's docs were previously retained forever, since
    they stay referenced and so never become orphan-purge candidates) and
    services.account_deletion (which additionally scrubs identity fields
    itself; that part is deliberately NOT here, since a plain rejection
    must not erase who was rejected).

    Deliberately excludes address_proof_ref: legacy, unwritten by any path
    (model docstring — product dropped that document 2026-07-12), so
    scrubbing it is always a no-op. Not the same 4-vs-5 column list
    account_deletion.py used to carry separately — that divergence is what
    this function collapses.
    """
    keys: list[str] = []
    for column in _DOC_REF_COLUMNS:
        value = getattr(application, column.key)
        if value:
            keys.append(value)
        setattr(application, column.key, None)
    return keys


async def purge_orphaned_uploads(*, min_age: timedelta = _ORPHAN_MIN_AGE) -> dict[str, int]:
    """Delete objects under agent-applications/ that no AgentApplication row
    references. Covers two cases: uploads from a flow the applicant never
    submitted, and refs superseded by a same-mobile-same-line re-apply
    upsert (submit() never deletes the old objects inline — a storage
    failure there must never roll back the DB write).

    Only ever touches PENDING/APPROVED/REJECTED rows' refs (i.e. all of
    them — the referenced-set query below has no status filter, so an
    approved or rejected application's documents are never candidates for
    deletion, regardless of age).
    """
    cutoff = datetime.now(UTC) - min_age
    objects = storage.list_objects(_KEY_PREFIX)
    candidates = [o for o in objects if o["last_modified"] < cutoff]
    if not candidates:
        return {"scanned": len(objects), "deleted": 0}

    async with AsyncSessionLocal() as session:
        referenced: set[str] = set()
        for column in _DOC_REF_COLUMNS:
            rows = (await session.scalars(select(column).where(column.is_not(None)))).all()
            referenced.update(rows)

    deleted = 0
    for obj in candidates:
        if obj["key"] not in referenced:
            storage.delete_object(obj["key"])
            deleted += 1
    return {"scanned": len(objects), "deleted": deleted}
