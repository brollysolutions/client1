import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
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
    email: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
    )
    password_hash: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
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
