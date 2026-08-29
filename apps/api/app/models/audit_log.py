"""Audit log — business-action activity monitoring (Admin design §5.6, FR-11.3,
NFR-2.3).

Deliberately separate from `auth_events` (models/auth.py, Auth §7.3): that table
records *authentication* events (login attempts, OTP sends, password resets) and
is keyed on a mobile number as much as an identity. This one records *business*
actions — who approved an agent, who executed a payout, who removed an account —
and is the durable record for actions that are otherwise irreversible or
externally visible.

Append-only, enforced at the privilege layer rather than in Python: the migration
grants `api_user` only `SELECT, INSERT`, never `UPDATE`/`DELETE`. There is no
service function that edits or removes a row and no grant that would let one, so
an audit trail cannot be quietly rewritten by application code (or by a bug in
it). Correcting a mistaken entry means appending a new one.

`actor_uuid` is nullable, which the spec table does not mark: scheduler jobs act
with no human actor (`jobs/retention_purge.py`'s hard DELETE is the motivating
case — before this table existed it logged purged row ids to stdout and nothing
else). NULL actor means "the platform did this on a schedule", and the
`AuditActor.SYSTEM` convention in services/audit_log.py names it explicitly.
`ondelete="SET NULL"` matches `auth_events.auth_user_uuid`: account deletion
tombstones `auth_users` rather than deleting rows, so this is a backstop, not a
routine path — and an audit row must outlive its actor either way.

`business_line` is nullable because plenty of audited actions are line-agnostic
(account removal, support-ticket resolution, a retention purge sweep). It carries
no immutability trigger and no RLS line predicate: this table is Admin-only
oversight, and Admin bypasses the line filter everywhere else too, so a line
predicate here would only be decoration.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class AuditAction(enum.StrEnum):
    """Every value here has a real writer in `app/services/`.

    The five LOAN_TYPE_*/BANK_* values (migration 1dd0bc6bed88) are written by
    `services/loan_config.py`. No `*_deleted` siblings exist — that module never
    deletes a row, only toggles `active`, which is just another `*_updated`.

    The two FEE_CASHBACK_* values (migration d3e4f5a6b7c8) are written by
    `services/fee_cashbacks.py` (FR-6.6 processing-fee cashback).
    """

    AGENT_APPROVED = "agent_approved"
    AGENT_REJECTED = "agent_rejected"
    STAFF_CREATED = "staff_created"
    STAFF_FEATURE_GRANTED = "staff_feature_granted"
    STAFF_FEATURE_REVOKED = "staff_feature_revoked"
    STAFF_INVITE_CREATED = "staff_invite_created"
    STAFF_INVITE_REVOKED = "staff_invite_revoked"
    ACCOUNT_REMOVED = "account_removed"
    ACCOUNT_STATUS_UPDATED = "account_status_updated"
    PAYOUT_APPROVED = "payout_approved"
    PAYOUT_REJECTED = "payout_rejected"
    PAYOUT_MANUAL_ISSUED = "payout_manual_issued"
    PAYOUT_MANUAL_CLEARED = "payout_manual_cleared"
    PAYOUT_MANUAL_FAILED = "payout_manual_failed"
    PAYOUT_MANUAL_REVERSED = "payout_manual_reversed"
    PROPERTY_SUBMISSION_APPROVED = "property_submission_approved"
    PROPERTY_SUBMISSION_REJECTED = "property_submission_rejected"
    PROPERTY_LISTING_UPDATED = "property_listing_updated"
    SUPPORT_TICKET_ADVANCED = "support_ticket_advanced"
    RETENTION_PURGED = "retention_purged"
    LOAN_TYPE_CREATED = "loan_type_created"
    LOAN_TYPE_UPDATED = "loan_type_updated"
    BANK_CREATED = "bank_created"
    BANK_UPDATED = "bank_updated"
    BANK_DELETED = "bank_deleted"
    BANK_AVAILABILITY_UPDATED = "bank_availability_updated"
    AGENT_INVITE_CREATED = "agent_invite_created"
    AGENT_INVITE_REVOKED = "agent_invite_revoked"
    FINANCIAL_PRODUCT_OFFER_CREATED = "financial_product_offer_created"
    FINANCIAL_PRODUCT_OFFER_UPDATED = "financial_product_offer_updated"
    COMMISSION_ENTERED = "commission_entered"
    COMMISSION_CANCELLED = "commission_cancelled"
    FEE_CASHBACK_ENTERED = "fee_cashback_entered"
    FEE_CASHBACK_CANCELLED = "fee_cashback_cancelled"
    DOCUMENT_VERIFIED = "document_verified"
    DOCUMENT_UNVERIFIED = "document_unverified"
    PAYOUT_LINK_RECONCILED = "payout_link_reconciled"
    NOTIFICATION_BROADCAST = "notification_broadcast"
    AGENT_LEAD_EXPIRED = "agent_lead_expired"
    LEAD_ASSIGNED = "lead_assigned"
    EMPLOYEE_WORK_ASSIGNED = "employee_work_assigned"
    LEAD_DETAILS_UPDATED = "lead_details_updated"
    FIELD_VISIBILITY_UPDATED = "field_visibility_updated"
    MOBILE_CHANGE_VERIFIED = "mobile_change_verified"
    MOBILE_CHANGED = "mobile_changed"
    MOBILE_CHANGE_REJECTED = "mobile_change_rejected"
    VEHICLE_ARRANGEMENT_UPDATED = "vehicle_arrangement_updated"
    BANNER_CREATED = "banner_created"
    BANNER_UPDATED = "banner_updated"
    BANNER_SUBMITTED = "banner_submitted"
    BANNER_APPROVED = "banner_approved"
    BANNER_REJECTED = "banner_rejected"
    BANNER_ARCHIVED = "banner_archived"
    BANNER_ACTIVATED = "banner_activated"
    BANNER_DELETED = "banner_deleted"
    BANNER_TEMPLATE_VERSIONED = "banner_template_versioned"
    REFERRAL_RULE_CREATED = "referral_rule_created"
    REFERRAL_RULE_UPDATED = "referral_rule_updated"
    REFERRAL_RULE_DELETED = "referral_rule_deleted"
    OFFER_CREATED = "offer_created"
    OFFER_UPDATED = "offer_updated"
    OFFER_SUBMITTED = "offer_submitted"
    OFFER_APPROVED = "offer_approved"
    OFFER_REJECTED = "offer_rejected"
    OFFER_SCHEDULED = "offer_scheduled"
    OFFER_ACTIVATED = "offer_activated"
    OFFER_EXPIRED = "offer_expired"
    OFFER_ARCHIVED = "offer_archived"
    OFFER_DELETED = "offer_deleted"
    CAMPAIGN_MEDIA_CREATED = "campaign_media_created"
    CAMPAIGN_MEDIA_UPDATED = "campaign_media_updated"
    CAMPAIGN_MEDIA_ARCHIVED = "campaign_media_archived"
    CAMPAIGN_MEDIA_DELETED = "campaign_media_deleted"


_ev = lambda x: [e.value for e in x]  # noqa: E731
audit_action_enum = ENUM(AuditAction, name="audit_action", create_type=False, values_callable=_ev)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NULL = acted by a scheduler job, not a person. See module docstring.
    actor_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    # Denormalized on purpose: the actor's role at the moment they acted. Reading
    # it back off the profile tables would show today's role, not the one they
    # held then, and a demoted or deleted actor would silently rewrite history.
    actor_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[AuditAction] = mapped_column(audit_action_enum, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_uuid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
