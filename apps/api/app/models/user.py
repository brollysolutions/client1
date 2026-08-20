import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(enum.StrEnum):
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    AGENT = "agent"
    TELECALLER = "telecaller"
    EMPLOYEE = "employee"
    CLIENT = "client"


class BusinessLine(enum.StrEnum):
    LOANS = "loans"
    REAL_ESTATE = "real_estate"
    BOTH = "both"


class UserStatus(enum.StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_PASSWORD_RESET = "pending_password_reset"
    SOFT_DELETED = "soft_deleted"


_ev = lambda x: [e.value for e in x]  # noqa: E731
role_enum = ENUM(UserRole, name="role_enum", create_type=False, values_callable=_ev)
business_line_enum = ENUM(
    BusinessLine, name="business_line_enum", create_type=False, values_callable=_ev
)
status_enum = ENUM(UserStatus, name="status_enum", create_type=False, values_callable=_ev)


class User(Base):
    __tablename__ = "auth_users"
    __table_args__ = (
        CheckConstraint("session_version >= 1", name="session_version_positive"),
        CheckConstraint(
            "gender IS NULL OR gender IN "
            "('female', 'male', 'non_binary', 'self_described', 'prefer_not_to_say')",
            name="profile_gender_valid",
        ),
        CheckConstraint(
            "(gender = 'self_described' AND gender_self_description IS NOT NULL) OR "
            "(gender IS DISTINCT FROM 'self_described' AND gender_self_description IS NULL)",
            name="profile_gender_description_consistent",
        ),
        CheckConstraint(
            "income_source IS NULL OR income_source IN ('salaried', 'business_income')",
            name="profile_income_source_valid",
        ),
        CheckConstraint(
            "income_period IS NULL OR income_period IN ('monthly', 'annual')",
            name="profile_income_period_valid",
        ),
        CheckConstraint(
            "(income_source IS NULL AND income_amount_minor IS NULL AND income_period IS NULL) OR "
            "(income_source IS NOT NULL AND income_amount_minor IS NOT NULL "
            "AND income_period IS NOT NULL)",
            name="profile_income_group_consistent",
        ),
        CheckConstraint(
            "income_amount_minor IS NULL OR income_amount_minor BETWEEN 1 AND 1000000000000",
            name="profile_income_amount_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    first_name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    last_name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    mobile: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
        index=True,
    )
    email: Mapped[str | None] = mapped_column(
        String,
        unique=True,
        nullable=True,
    )
    gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gender_self_description: Mapped[str | None] = mapped_column(String(100), nullable=True)
    income_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    income_amount_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    income_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(120), nullable=True)
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )
    # Embedded in every access token and checked on every authenticated
    # request.  Incrementing it invalidates every already-issued access token
    # for this account without maintaining a per-token Redis denylist.
    session_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    status: Mapped[UserStatus] = mapped_column(
        status_enum,
        nullable=False,
        default=UserStatus.ACTIVE,
    )
    phone_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by_auth_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="SET NULL"),
        nullable=True,
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

    created_by_user: Mapped[Optional["User"]] = relationship(
        "User",
        remote_side=[id],
    )
