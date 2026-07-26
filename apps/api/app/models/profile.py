import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User, business_line_enum


class ProfileStatus(enum.StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"
    SUSPENDED = "suspended"


class StaffRole(enum.StrEnum):
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    TELECALLER = "telecaller"
    EMPLOYEE = "employee"


class ProfileScope(enum.StrEnum):
    PLATFORM = "platform"
    LINE = "line"


class SubmissionStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


_ev = lambda x: [e.value for e in x]  # noqa: E731
profile_status_enum = ENUM(
    ProfileStatus, name="profile_status", create_type=False, values_callable=_ev
)
staff_role_enum = ENUM(StaffRole, name="staff_role_enum", create_type=False, values_callable=_ev)
profile_scope_enum = ENUM(
    ProfileScope, name="profile_scope_enum", create_type=False, values_callable=_ev
)
submission_status_enum = ENUM(
    SubmissionStatus, name="submission_status_enum", create_type=False, values_callable=_ev
)


class ClientProfile(Base):
    __tablename__ = "client_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_line: Mapped[str] = mapped_column(
        business_line_enum,
        nullable=False,
    )
    customer_code: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )
    status: Mapped[ProfileStatus] = mapped_column(
        profile_status_enum,
        nullable=False,
        default=ProfileStatus.ACTIVE,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    user: Mapped[Optional["User"]] = relationship("User", backref="client_profiles")


class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[StaffRole] = mapped_column(staff_role_enum, nullable=False)
    scope: Mapped[ProfileScope] = mapped_column(profile_scope_enum, nullable=False)
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    staff_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    status: Mapped[ProfileStatus] = mapped_column(
        profile_status_enum, nullable=False, default=ProfileStatus.ACTIVE
    )
    created_by_auth_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[auth_user_uuid], backref="staff_profiles"
    )
    created_by_user: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by_auth_user_uuid]
    )


class AgentApplication(Base):
    """Public agent-application intake row.

    aadhaar_ref is the FRONT side; aadhaar_back_ref (migration c1d2e3f4a5b6)
    is the back. address_proof_ref is legacy and unwritten — product dropped
    that document (2026-07-12) but the column is kept per expand/contract
    discipline. email is nullable: rows created before c1d2e3f4a5b6 (incl.
    scripts/seed_agent_applications.py) have none.
    """

    __tablename__ = "agent_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    applicant_auth_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    mobile: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    aadhaar_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    aadhaar_back_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    pan_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    photo_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    address_proof_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    rera_code: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[SubmissionStatus] = mapped_column(
        submission_status_enum, nullable=False, default=SubmissionStatus.PENDING
    )
    reviewed_by_staff_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    applicant_user: Mapped[Optional["User"]] = relationship("User")
    reviewed_by_staff: Mapped[Optional["StaffProfile"]] = relationship("StaffProfile")


class AgentProfile(Base):
    __tablename__ = "agent_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False
    )
    agent_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    application_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_applications.id", ondelete="SET NULL"), nullable=True
    )
    converted_from_client: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kyc_status: Mapped[str | None] = mapped_column(String, nullable=True)
    rera_code: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ProfileStatus] = mapped_column(
        profile_status_enum, nullable=False, default=ProfileStatus.ACTIVE
    )
    approved_by_staff_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[Optional["User"]] = relationship("User", backref="agent_profiles")
    application: Mapped[Optional["AgentApplication"]] = relationship("AgentApplication")
    approved_by_staff: Mapped[Optional["StaffProfile"]] = relationship("StaffProfile")
