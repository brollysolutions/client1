import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    SUB_ADMIN = "sub_admin"
    AGENT = "agent"
    TELECALLER = "telecaller"
    EMPLOYEE = "employee"
    CLIENT = "client"


class BusinessLine(str, enum.Enum):
    LOANS = "loans"
    REAL_ESTATE = "real_estate"
    BOTH = "both"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_PASSWORD_RESET = "pending_password_reset"
    SOFT_DELETED = "soft_deleted"


from sqlalchemy.dialects.postgresql import ENUM

role_enum = ENUM(UserRole, name="role_enum", create_type=False)
business_line_enum = ENUM(BusinessLine, name="business_line_enum", create_type=False)
status_enum = ENUM(UserStatus, name="status_enum", create_type=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        unique=True,
        nullable=False,
        index=True,
    )
    previous_user_id: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
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
        nullable=True,
    )
    password_hash: Mapped[str | None] = mapped_column(
        String,
        nullable=True,
    )
    role: Mapped[UserRole] = mapped_column(
        role_enum,
        nullable=False,
    )
    business_line: Mapped[BusinessLine] = mapped_column(
        business_line_enum,
        nullable=False,
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
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
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

    creator: Mapped[Optional["User"]] = relationship(
        "User",
        remote_side=[id],
    )

    __table_args__ = (
        CheckConstraint(
            "(role IN ('agent', 'telecaller', 'employee') "
            "AND business_line IN ('loans', 'real_estate')) "
            "OR (role IN ('admin', 'sub_admin', 'client') "
            "AND business_line IN ('loans', 'real_estate', 'both'))",
            name="business_line_by_role",
        ),
    )
