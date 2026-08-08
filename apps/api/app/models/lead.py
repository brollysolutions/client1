"""Lead spine — every captured mobile lands here (master_erd.mermaid §LEAD SPINE).

A lead is a sales/follow-up record, NOT an account. It is created at every auth
entry point (register/initiate, login, forgot/initiate) so no enquiring number is
lost, even when the user never completes registration. Telecallers work this table.
`client_profile_uuid` stays NULL until the lead is claimed/registered. One mobile
may have independent live Loans and Real Estate journeys.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class LeadOrigin(enum.StrEnum):
    DIRECT = "direct"
    AGENT = "agent"


class LeadStatus(enum.StrEnum):
    NEW = "new"
    ASSIGNED = "assigned"
    WORKING = "working"
    CONVERTED = "converted"
    CLOSED = "closed"
    RELEASED = "released"


_ev = lambda x: [e.value for e in x]  # noqa: E731
lead_origin_enum = ENUM(LeadOrigin, name="lead_origin", create_type=False, values_callable=_ev)
lead_status_enum = ENUM(LeadStatus, name="lead_status", create_type=False, values_callable=_ev)


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint(
            "business_line IS NULL OR business_line::text IN ('loans', 'real_estate')",
            name="lead_business_line_is_operational",
        ),
        Index(
            "uq_leads_mobile_line_live",
            "mobile",
            "business_line",
            unique=True,
            postgresql_where=text("business_line IS NOT NULL AND status <> 'closed'"),
        ),
        Index(
            "uq_leads_mobile_unresolved_live",
            "mobile",
            unique=True,
            postgresql_where=text("business_line IS NULL AND status <> 'closed'"),
        ),
        Index(
            "uq_leads_mobile_agent_live",
            "mobile",
            unique=True,
            postgresql_where=text(
                "origin_agent_profile_uuid IS NOT NULL "
                "AND agent_expired_at IS NULL AND status <> 'closed'"
            ),
        ),
        Index(
            "ix_leads_assignment_workload",
            "business_line",
            "assigned_telecaller_profile_uuid",
            "status",
            postgresql_where=text("assigned_telecaller_profile_uuid IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("client_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Nullable: at login/forgot the line is unknown. A triage step assigns it later;
    # until then line-scoped staff cannot see the lead (only platform Admin/Sub Admin).
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    origin: Mapped[LeadOrigin] = mapped_column(
        lead_origin_enum, nullable=False, default=LeadOrigin.DIRECT
    )
    origin_agent_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_telecaller_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("staff_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    mobile: Mapped[str] = mapped_column(String, nullable=False, index=True)
    requirement: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    status: Mapped[LeadStatus] = mapped_column(
        lead_status_enum, nullable=False, default=LeadStatus.NEW
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    release_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    # Agent attribution has a fixed protection window (FR-4.6). Operational
    # status remains independent so an expired lead can return to the open
    # Telecaller pool and continue through assigned/working/converted later.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    agent_expired_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
