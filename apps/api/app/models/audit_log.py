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
    ACCOUNT_REMOVED = "account_removed"
    PAYOUT_APPROVED = "payout_approved"
    PAYOUT_REJECTED = "payout_rejected"
    PROPERTY_SUBMISSION_APPROVED = "property_submission_approved"
    PROPERTY_SUBMISSION_REJECTED = "property_submission_rejected"
    SUPPORT_TICKET_ADVANCED = "support_ticket_advanced"
    RETENTION_PURGED = "retention_purged"
    LOAN_TYPE_CREATED = "loan_type_created"
    LOAN_TYPE_UPDATED = "loan_type_updated"
    BANK_CREATED = "bank_created"
    BANK_UPDATED = "bank_updated"
    BANK_AVAILABILITY_UPDATED = "bank_availability_updated"
    COMMISSION_ENTERED = "commission_entered"
    COMMISSION_CANCELLED = "commission_cancelled"
    FEE_CASHBACK_ENTERED = "fee_cashback_entered"
    FEE_CASHBACK_CANCELLED = "fee_cashback_cancelled"
    DOCUMENT_VERIFIED = "document_verified"
    DOCUMENT_UNVERIFIED = "document_unverified"
    PAYOUT_LINK_RECONCILED = "payout_link_reconciled"
    NOTIFICATION_BROADCAST = "notification_broadcast"
    AGENT_LEAD_EXPIRED = "agent_lead_expired"
    FIELD_VISIBILITY_UPDATED = "field_visibility_updated"
    MOBILE_CHANGE_VERIFIED = "mobile_change_verified"
    MOBILE_CHANGED = "mobile_changed"
    MOBILE_CHANGE_REJECTED = "mobile_change_rejected"


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
