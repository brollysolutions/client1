"""Account deletion — self-service + admin-initiated (SRS 5.1, FR-17.3/17.4).

Two phases, on two different sessions — not a stylistic choice, an RLS one:

Phase A runs on the CALLER's request-scoped session (RLS-enforced). It only
touches tables whose RLS policy has a genuine "own row" branch for every actor
this function serves: `auth_users` (own-row-or-platform-scope),
`agent_applications` (own-application-or-platform-scope),
`client_profiles`/`agent_profiles` (own-uuid-or-platform-scope), and
`support_tickets` (own-uuid-or-platform-scope, same shape — see
`875b08101bea_grant_update_on_support_tickets.py`, which had to grant `UPDATE`
first since the table previously only had `SELECT, INSERT`). A narrow,
authorization-checking SECURITY DEFINER function closes the target's live
Client leads atomically so deleted journeys cannot be assigned or rebound.
Both a
self-deleting user and an Admin acting on someone else's account can write
these rows under their own RLS context — see
`f2e4d6c8a0b1_add_rls_policies.py`'s WITH CHECK clauses.

`personalization_preferences` is also erased in Phase A through a single-row,
authorization-checking SECURITY DEFINER function. PostgreSQL requires a row to
pass SELECT policy before ordinary DELETE can target it; the function preserves
atomic deletion without granting Admin a location/consent read policy.

Phase B runs on a bypass (app-superuser) session, `import app.db.session as
db_session` resolved at call time — never a module-level `from
app.db.session import AsyncSessionLocal` (see conftest's NullPool rebind list;
this convention keeps this module OFF that list). It is limited to exactly the
two tables whose RLS genuinely cannot be satisfied by either actor under their
own session, keeping the best-effort blast radius as small as the RLS gap
actually forces:

  - `staff_profiles_rls`'s WITH CHECK is platform_scope-only (no owner branch)
    — a staff member self-deleting cannot flip their own row under their own
    session.
  - `refresh_tokens_rls` has NO platform_scope branch at all (owner-only) — an
    Admin's own request-scoped session cannot revoke a DIFFERENT user's
    refresh tokens.

The financial de-link (`transactions`/`payouts`) also runs here since those
tables grant `api_user` SELECT only — no request-scoped session, self-service
or admin, could write them regardless of RLS. Before the de-link, any payout
still `PENDING_APPROVAL`/`APPROVED` (not yet sent to the gateway) is rejected
outright rather than merely de-linked, so a deleted account is never paid —
see `_REJECTABLE_ON_DELETION`. The APPROVED race against
`services.payments.initiate_payout` is safe without a lock: `initiate_payout`
claims with `UPDATE ... WHERE status='approved'`. If deletion wins that race,
initiate's CAS matches zero rows and money never leaves; if initiate wins,
the payout is already `INITIATED` by the time this UPDATE's predicate is
evaluated, so it falls through untouched to the ordinary de-link path below.
Do not "fix" this with a `SELECT FOR UPDATE` — there is nothing to fix.

Phase B is best-effort: logged on failure, never re-raised. Once Phase A
commits, the identity is already irreversibly scrubbed and status is already
SOFT_DELETED — failing the HTTP response at that point would be misleading
(the account genuinely is deleted), and a client retry would just re-hit the
already-deleted guard, permanently blocking Phase B from ever running. Two
independent backstops cover a delayed/failed Phase B in the meantime: login
already rejects SOFT_DELETED (auth_service.login), and refresh_token() itself
re-checks status != ACTIVE on its own always-superuser session and revokes
the chain there regardless of whether Phase B's bulk revoke ran.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.cache.redis_keys import (
    RedisCache,
    jwt_blacklist_key,
    otp_email_verify_key,
    otp_email_verify_target_key,
)
from app.models.audit_log import AuditAction
from app.models.auth import AuthEvent, RefreshToken
from app.models.loan_document import LoanDocument
from app.models.mobile_change import MobileChangeRequest, MobileChangeStatus
from app.models.notification import NotificationType
from app.models.payout import Payout, PayoutStatus, PayoutType
from app.models.profile import (
    AgentApplication,
    AgentProfile,
    ClientProfile,
    ProfileStatus,
    StaffProfile,
)
from app.models.property_media import PropertySubmissionMedia
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.models.support_ticket import SupportTicket
from app.models.transaction import Transaction
from app.models.user import User, UserStatus
from app.services import payout_links, storage
from app.services.admin_notify import notify_admins
from app.services.agent_applications import scrub_documents
from app.services.audit_log import record as record_audit

logger = logging.getLogger(__name__)

# Preserves category/status/timestamps (ticket history is left visible to
# Admin) while removing the deleted identity's own free text.
_SCRUBBED_TICKET_TEXT = "[deleted account — content removed]"

# A payout still awaiting a maker-checker decision, or approved but not yet
# sent to the gateway, has not left the platform — reject it outright rather
# than merely de-linking it, so a deleted account is never paid (feature-
# status.md §2 #17). An INITIATED payout is NOT covered here: it may already
# be at the gateway and unrecallable, so it falls through to the de-link path
# below instead (see the module docstring addendum on Phase B financials).
_REJECTABLE_ON_DELETION = (PayoutStatus.PENDING_APPROVAL, PayoutStatus.APPROVED)
_DELETION_REJECT_REASON = "Recipient account deleted before payout was initiated."


class AccountNotFound(Exception):
    """Raised when the target auth_users row does not exist."""


class AccountAlreadyDeleted(Exception):
    """Raised when the target account is already SOFT_DELETED (idempotency guard)."""


def _tombstone_mobile(user_id: UUID) -> str:
    # Fails RegisterInitiateRequest.mobile's `^\+[1-9]\d{6,14}$` pattern by
    # construction (no leading '+') — can never collide with a real
    # registration, so the real number is genuinely freed for reuse.
    return f"deleted-{user_id}"


def _tombstone_email(user_id: UUID) -> str:
    # Reserved .invalid TLD (RFC 2606) — never a real, re-registerable address.
    return f"deleted+{user_id}@deleted.invalid"


async def delete_account(
    db: AsyncSession,
    cache: RedisCache,
    *,
    target_auth_user_uuid: UUID,
    actor_auth_user_uuid: UUID,
    actor_jti: str | None,
    actor_access_token_exp: int | None,
    reason: str | None,
    ip: str | None,
    user_agent: str | None,
    actor_role: str | None = None,
) -> None:
    """Erase a user's identity, de-link their financial records, kill their
    sessions. `actor_jti`/`actor_access_token_exp` are set only for self-service
    (blacklists the caller's own current access token); admin-initiated calls
    pass None for both since the admin's own session is untouched.
    """
    self_service = actor_auth_user_uuid == target_auth_user_uuid

    # --- Phase A: request-scoped session, RLS-enforced ---
    # populate_existing=True is required alongside with_for_update: the
    # self-service caller (auth_service.delete_own_account) already loaded
    # this same row, unlocked, on this same session to verify the password.
    # with_for_update alone still emits a fresh, lock-acquiring SELECT (it
    # bypasses the identity-map short-circuit), but WITHOUT populate_existing
    # the ORM leaves that already-cached instance's attributes as they were
    # instead of overwriting them with the row just locked — so a second,
    # concurrent caller blocked on this same lock would resume holding a
    # stale in-memory `status` (still ACTIVE) even though the row it just
    # locked is genuinely SOFT_DELETED, defeating the AccountAlreadyDeleted
    # guard below entirely. Caught by
    # test_concurrent_delete_requests_serialize_via_row_lock.
    user = await db.get(User, target_auth_user_uuid, with_for_update=True, populate_existing=True)
    if user is None:
        raise AccountNotFound
    if user.status == UserStatus.SOFT_DELETED:
        raise AccountAlreadyDeleted

    original_mobile = user.mobile
    # Run before mutating or flushing the auth row so the independently
    # authorized database helper can close both profile-bound journeys and any
    # unresolved lead still keyed only by the account's verified mobile.
    await db.scalar(func.close_account_leads(target_auth_user_uuid))
    user.first_name = "Deleted"
    user.last_name = "User"
    user.mobile = _tombstone_mobile(user.id)
    user.email = _tombstone_email(user.id)
    user.gender = None
    user.gender_self_description = None
    user.income_source = None
    user.income_amount_minor = None
    user.income_period = None
    user.occupation = None
    user.address = None
    user.password_hash = None
    user.phone_verified_at = None
    user.email_verified_at = None
    user.status = UserStatus.SOFT_DELETED

    applications = (
        await db.scalars(
            select(AgentApplication).where(
                AgentApplication.applicant_auth_user_uuid == target_auth_user_uuid
            )
        )
    ).all()
    doc_keys: list[str] = []
    for application in applications:
        # Shared with services.admin.reject_agent_application — the single
        # source of truth for "which columns are KYC doc refs" (see that
        # function's docstring). Identity fields are scrubbed here too,
        # deliberately NOT inside the shared helper: a plain rejection must
        # not erase who was rejected, but a deletion must.
        doc_keys.extend(scrub_documents(application))
        application.first_name = None
        application.last_name = None
        application.mobile = None
        application.email = None
    if applications:
        await db.flush()  # DB write durable before touching external storage
    for key in doc_keys:
        storage.delete_object(key)  # best-effort, already swallows failures

    # loan_documents (client-uploaded KYC scans) has the same owner-or-admin
    # RLS branch as agent_applications above, so it belongs in Phase A too.
    # Deleted unconditionally, including a verified=true row: the ordinary
    # DocumentAlreadyVerified guard (services/loan_documents.py) is an API-
    # layer convenience, not a durable-PII-deletion obligation, and the
    # DELETE RLS policy deliberately carries no `verified = false` clause for
    # the identical reason (migration f5a6b7c8d9e0's docstring).
    loan_docs = (
        await db.scalars(
            select(LoanDocument).where(
                LoanDocument.client_profile_uuid.in_(
                    select(ClientProfile.id).where(
                        ClientProfile.auth_user_uuid == target_auth_user_uuid
                    )
                )
            )
        )
    ).all()
    loan_doc_keys = [d.object_key for d in loan_docs]
    for d in loan_docs:
        await db.delete(d)
    if loan_docs:
        await db.flush()
    for key in loan_doc_keys:
        storage.delete_object(key)  # best-effort, already swallows failures

    # client_profiles/agent_profiles both have an owner WITH CHECK branch, so
    # unlike staff_profiles/refresh_tokens (Phase B) these are safe to write
    # here, atomically with the identity scrub.
    await db.execute(
        update(ClientProfile)
        .where(ClientProfile.auth_user_uuid == target_auth_user_uuid)
        .values(status=ProfileStatus.INACTIVE)
    )
    await db.execute(
        update(AgentProfile)
        .where(AgentProfile.auth_user_uuid == target_auth_user_uuid)
        .values(status=ProfileStatus.INACTIVE)
    )

    # support_tickets has the same owner-or-admin RLS branch as the two
    # profile tables above, so it belongs in Phase A too — see module
    # docstring. Only the free text is scrubbed; category/status/timestamps
    # stay intact for Admin's own ticket-history view.
    await db.execute(
        update(SupportTicket)
        .where(SupportTicket.auth_user_uuid == target_auth_user_uuid)
        .values(subject=_SCRUBBED_TICKET_TEXT, body=_SCRUBBED_TICKET_TEXT)
    )

    # SECURITY DEFINER is intentionally confined to this one-row erase. The
    # function independently accepts only the owner or a platform Admin, while
    # avoiding a staff SELECT policy over consent/location data. Keeping it in
    # Phase A makes erasure atomic with the identity scrub.
    await db.scalar(func.erase_personalization_preference(target_auth_user_uuid))

    db.add(
        AuthEvent(
            auth_user_uuid=target_auth_user_uuid,
            event_type="account_deleted",
            mobile=None,  # the mobile is being erased in this same transaction
            ip=ip,
            user_agent=user_agent,
            success=True,
            detail={
                "actor_auth_user_uuid": str(actor_auth_user_uuid),
                "self_service": self_service,
                "reason": reason,
            },
        )
    )
    # Separate from the AuthEvent above, deliberately. That row is a security
    # event on the *target's* identity timeline; this one is a business action on
    # the Admin oversight timeline (spec §5.6 names `account_removed` explicitly).
    # Both are written in this same transaction, so they cannot disagree.
    await record_audit(
        db,
        action=AuditAction.ACCOUNT_REMOVED,
        entity_type="auth_user",
        entity_uuid=target_auth_user_uuid,
        actor_uuid=actor_auth_user_uuid,
        actor_role=actor_role,
        detail={"self_service": self_service, "reason": reason},
    )
    await db.commit()

    # Email-verification state is short-lived and contains no raw address, but
    # its Redis keys still carry the former mobile. Purge it immediately after
    # the authoritative identity scrub commits; a cache outage cannot undo an
    # otherwise successful deletion.
    try:
        await cache.delete(
            otp_email_verify_key(original_mobile),
            f"{otp_email_verify_key(original_mobile)}:attempts",
            otp_email_verify_target_key(original_mobile),
        )
    except Exception:
        logger.warning("account_deletion.email_verification_cache_cleanup_failed", exc_info=True)

    # No-op on self-service: the actor IS the target, so excluding actor_uuid
    # from the fanout excludes the only "admin" who could be notified anyway
    # if they happened to also be staff — this is intentionally a broad
    # exclusion, not a self-service special case.
    await notify_admins(
        notification_type=NotificationType.ADMIN_ACCOUNT_ACTION,
        title="Account removed",
        body="An account was removed" + (" (self-service)." if self_service else "."),
        href="/dashboard/audit-log",
        exclude_user_uuid=actor_auth_user_uuid,
    )

    # Blacklist AFTER the commit succeeds, never before: this is a Redis write,
    # not transactional with the Postgres commit above. Doing it first would
    # burn the caller's own token even if the commit then failed and rolled
    # back everything else — a bounded, self-inflicted lockout on an otherwise
    # fully-reversible error path.
    if self_service and actor_jti and actor_access_token_exp is not None:
        now_ts = int(datetime.now(UTC).timestamp())
        ttl = max(actor_access_token_exp - now_ts, 1)
        await cache.set(jwt_blacklist_key(actor_jti), 1, ttl)

    # --- Phase B: bypass session, best-effort (see module docstring) ---
    retained_ref = str(target_auth_user_uuid)
    rejected_payouts: list[tuple[UUID, PayoutType]] = []
    try:
        async with db_session.AsyncSessionLocal() as session:
            await session.execute(
                update(StaffProfile)
                .where(StaffProfile.auth_user_uuid == target_auth_user_uuid)
                .values(status=ProfileStatus.INACTIVE)
            )
            await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.auth_user_uuid == target_auth_user_uuid,
                    RefreshToken.revoked.is_(False),
                )
                .values(revoked=True)
            )
            # Recovery requests retain old/new numbers only while active.  A
            # soft-deleted auth_users row remains in place, so ON DELETE cannot
            # scrub these child rows for us; clear all request-side free text
            # and terminalize active work explicitly on the bypass session.
            await session.execute(
                update(MobileChangeRequest)
                .where(
                    MobileChangeRequest.auth_user_uuid == target_auth_user_uuid,
                    MobileChangeRequest.status.in_(
                        (
                            MobileChangeStatus.PENDING_REVIEW,
                            MobileChangeStatus.PENDING_APPROVAL,
                        )
                    ),
                )
                .values(status=MobileChangeStatus.CANCELLED)
            )
            await session.execute(
                update(MobileChangeRequest)
                .where(MobileChangeRequest.auth_user_uuid == target_auth_user_uuid)
                .values(
                    current_mobile=None,
                    requested_mobile=None,
                    proof_attestation=None,
                    rejection_reason=None,
                )
            )

            # Reject any payout that has not yet left the platform — see
            # _REJECTABLE_ON_DELETION and the module docstring. rejected_by_user_uuid
            # stays NULL: this is a platform action, not a human checker's decision
            # (the column is nullable for exactly this case).
            rejected_rows = (
                await session.execute(
                    update(Payout)
                    .where(
                        Payout.recipient_user_uuid == target_auth_user_uuid,
                        Payout.status.in_(_REJECTABLE_ON_DELETION),
                    )
                    .values(status=PayoutStatus.REJECTED, reject_reason=_DELETION_REJECT_REASON)
                    .returning(Payout.id, Payout.type, Payout.business_line, Payout.amount_paise)
                    .execution_options(synchronize_session=False)
                )
            ).all()
            for row in rejected_rows:
                rejected_payouts.append((row.id, row.type))
                # actor_uuid is the account being deleted (self-service) or the
                # admin who deleted it — never NULL, unlike a scheduler action:
                # a real actor initiated this, and record_audit's WITH CHECK
                # requires a non-NULL actor to be the session identity anyway.
                await record_audit(
                    session,
                    action=AuditAction.PAYOUT_REJECTED,
                    entity_type="payout",
                    entity_uuid=row.id,
                    actor_uuid=actor_auth_user_uuid,
                    actor_role=actor_role,
                    business_line=row.business_line,
                    detail={
                        "amount_paise": row.amount_paise,
                        "payout_type": row.type.value,
                        "reason": _DELETION_REJECT_REASON,
                    },
                )

            await session.execute(
                update(Transaction)
                .where(Transaction.user_uuid == target_auth_user_uuid)
                .values(
                    user_uuid=None,
                    retained_ref=retained_ref,
                    delinked_at=datetime.now(UTC),
                )
            )
            await session.execute(
                update(Payout)
                .where(Payout.recipient_user_uuid == target_auth_user_uuid)
                .values(
                    recipient_user_uuid=None,
                    retained_ref=retained_ref,
                    delinked_at=datetime.now(UTC),
                )
            )
            await session.commit()

        # Release each rejected payout's source row (referral/commission/
        # fee_cashback) AFTER commit, same convention as
        # services.payments.reject_payout driving _payout_released_hook post-
        # commit: this is a separate best-effort side effect, not part of the
        # de-link transaction above. Without this, a rejected payout's source
        # row is stranded pointing at a dead payout, permanently unpayable
        # (jobs/reconcile_payout_links.py would eventually catch it too, but
        # driving it directly here closes the gap immediately).
        for payout_id, payout_type in rejected_payouts:
            await payout_links.apply_release_link(payout_type=payout_type, payout_id=payout_id)
    except Exception:
        logger.exception(
            "account_deletion.phase_b_failed target_auth_user_uuid=%s", target_auth_user_uuid
        )

    # Property-submission media is private user content, including optional
    # reviewer documents. It has no request-session DELETE grant, so clean it
    # through its own isolated bypass transaction after the identity is already
    # tombstoned. Public PropertyMedia is intentionally unaffected: an approved
    # catalogue listing is platform content and no longer references these
    # private source rows.
    property_media_keys: list[str] = []
    try:
        async with db_session.AsyncSessionLocal() as session:
            property_media = list(
                (
                    await session.scalars(
                        select(PropertySubmissionMedia)
                        .join(
                            PropertySubmission,
                            PropertySubmission.id == PropertySubmissionMedia.submission_uuid,
                        )
                        .where(PropertySubmission.submitter_uuid == target_auth_user_uuid)
                    )
                ).all()
            )
            property_media_keys = [asset.object_key for asset in property_media]
            for asset in property_media:
                await session.delete(asset)
            await session.execute(
                update(PropertySubmission)
                .where(
                    PropertySubmission.submitter_uuid == target_auth_user_uuid,
                    PropertySubmission.status == SubmissionStatus.PENDING,
                )
                .values(
                    status=SubmissionStatus.REJECTED,
                    review_note="Submission closed because the owner account was deleted.",
                    reviewed_by_uuid=None,
                    reviewed_at=datetime.now(UTC),
                )
            )
            await session.commit()
        for object_key in property_media_keys:
            storage.delete_object(object_key)
    except Exception:
        logger.exception(
            "account_deletion.property_media_cleanup_failed target_auth_user_uuid=%s",
            target_auth_user_uuid,
        )
