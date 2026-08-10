"""Closed-catalogue response projection and contact invitation lifecycle."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.audit_log import AuditAction
from app.models.field_visibility import (
    ContactShareLink,
    FieldTargetRole,
    FieldVisibilityConfig,
    FieldVisibilityMode,
)
from app.models.lead import Lead
from app.models.profile import ProfileStatus, StaffProfile, StaffRole
from app.models.task import Task, TaskStatus
from app.services.audit_log import record as record_audit

_SHARE_LINK_TTL = timedelta(hours=24)


@dataclass(frozen=True)
class FieldDefinition:
    target_role: FieldTargetRole
    entity: str
    field_key: str
    label: str
    default_mode: FieldVisibilityMode = FieldVisibilityMode.ALLOW
    allowed_modes: tuple[FieldVisibilityMode, ...] = (
        FieldVisibilityMode.ALLOW,
        FieldVisibilityMode.DENY,
    )
    locked: bool = False
    lock_reason: str | None = None

    @property
    def key(self) -> tuple[FieldTargetRole, str, str]:
        return (self.target_role, self.entity, self.field_key)


_MOBILE_LOCK = (
    "Required by FR-15.1/FR-15.2: Agents see their own leads' numbers and "
    "Telecallers see assigned leads' numbers."
)

CATALOGUE: tuple[FieldDefinition, ...] = (
    FieldDefinition(FieldTargetRole.AGENT, "lead", "name", "Lead name"),
    FieldDefinition(
        FieldTargetRole.AGENT,
        "lead",
        "mobile",
        "Lead mobile",
        allowed_modes=(FieldVisibilityMode.ALLOW,),
        locked=True,
        lock_reason=_MOBILE_LOCK,
    ),
    FieldDefinition(FieldTargetRole.AGENT, "lead", "requirement", "Requirement details"),
    FieldDefinition(FieldTargetRole.TELECALLER, "lead", "name", "Lead name"),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "lead",
        "mobile",
        "Lead mobile",
        allowed_modes=(FieldVisibilityMode.ALLOW,),
        locked=True,
        lock_reason=_MOBILE_LOCK,
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "lead",
        "requirement",
        "Requirement details",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_application",
        "amount_requested",
        "Requested amount",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_application",
        "amount_sanctioned",
        "Sanctioned amount",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_application",
        "interest_rate",
        "Interest rate",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_application",
        "processing_fee",
        "Processing fee",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_application",
        "status_reason",
        "Loan status reason",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_transaction",
        "bank_name",
        "Transaction bank name",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_transaction",
        "amount",
        "Transaction amount",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_transaction",
        "interest_rate",
        "Transaction interest rate",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "loan_transaction",
        "txn_date",
        "Transaction date",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "property_deal",
        "price_quoted",
        "Quoted property price",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "property_deal",
        "booking_amount",
        "Booking amount",
    ),
    FieldDefinition(
        FieldTargetRole.TELECALLER,
        "property_deal",
        "status_reason",
        "Property status reason",
    ),
    FieldDefinition(FieldTargetRole.EMPLOYEE, "lead", "name", "Lead name"),
    FieldDefinition(
        FieldTargetRole.EMPLOYEE,
        "lead",
        "mobile",
        "Lead mobile",
        allowed_modes=(
            FieldVisibilityMode.ALLOW,
            FieldVisibilityMode.DENY,
            FieldVisibilityMode.SHARE_LINK,
        ),
    ),
)

_DEFINITIONS = {definition.key: definition for definition in CATALOGUE}


class UnknownFieldVisibilityKey(Exception):
    """The caller supplied an entity/field outside the closed catalogue."""


class FieldVisibilityModeNotAllowed(Exception):
    """The selected mode is invalid or the catalogue entry is locked."""


class ContactShareNotAllowed(Exception):
    """The current Employee policy does not permit a share link."""


async def _lock_policy_key(
    db: AsyncSession,
    target_role: FieldTargetRole,
    entity: str,
    field_key: str,
) -> None:
    """Serialize a policy mutation with behavior governed by that policy."""
    key = f"field_visibility:{target_role.value}:{entity}:{field_key}"
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": key},
    )


def _definition(target_role: FieldTargetRole | str, entity: str, field_key: str) -> FieldDefinition:
    try:
        role = FieldTargetRole(target_role)
    except ValueError as exc:
        raise UnknownFieldVisibilityKey from exc
    definition = _DEFINITIONS.get((role, entity, field_key))
    if definition is None:
        raise UnknownFieldVisibilityKey
    return definition


async def effective_modes(
    db: AsyncSession, target_role: FieldTargetRole | str
) -> dict[tuple[str, str], FieldVisibilityMode]:
    role = FieldTargetRole(target_role)
    defaults = {
        (definition.entity, definition.field_key): definition.default_mode
        for definition in CATALOGUE
        if definition.target_role == role
    }
    overrides = await db.scalars(
        select(FieldVisibilityConfig).where(FieldVisibilityConfig.target_role == role)
    )
    for override in overrides:
        key = (override.entity, override.field_key)
        definition = _DEFINITIONS.get((role, *key))
        # Fail closed if a row could not have been produced by the current
        # catalogue (for example after a rollback or manual database edit).
        defaults[key] = (
            override.mode
            if definition is not None and override.mode in definition.allowed_modes
            else FieldVisibilityMode.DENY
        )
    return defaults


async def list_for_admin(
    db: AsyncSession,
) -> list[tuple[FieldDefinition, FieldVisibilityConfig | None]]:
    overrides = list((await db.scalars(select(FieldVisibilityConfig))).all())
    by_key = {row.target_role: {} for row in overrides}
    for row in overrides:
        by_key.setdefault(row.target_role, {})[(row.entity, row.field_key)] = row
    return [
        (
            definition,
            by_key.get(definition.target_role, {}).get((definition.entity, definition.field_key)),
        )
        for definition in CATALOGUE
    ]


async def update_for_admin(
    db: AsyncSession,
    *,
    target_role: FieldTargetRole | str,
    entity: str,
    field_key: str,
    mode: FieldVisibilityMode | str,
    actor_uuid: uuid.UUID,
    actor_role: str,
) -> FieldVisibilityConfig:
    definition = _definition(target_role, entity, field_key)
    selected_mode = FieldVisibilityMode(mode)
    if selected_mode not in definition.allowed_modes or definition.locked:
        raise FieldVisibilityModeNotAllowed

    await _lock_policy_key(
        db,
        definition.target_role,
        definition.entity,
        definition.field_key,
    )

    existing = await db.scalar(
        select(FieldVisibilityConfig).where(
            FieldVisibilityConfig.target_role == definition.target_role,
            FieldVisibilityConfig.entity == entity,
            FieldVisibilityConfig.field_key == field_key,
        )
    )
    old_mode = existing.mode if existing is not None else definition.default_mode
    now = datetime.now(UTC)
    stmt = (
        pg_insert(FieldVisibilityConfig)
        .values(
            id=uuid.uuid4(),
            target_role=definition.target_role,
            entity=entity,
            field_key=field_key,
            mode=selected_mode,
            updated_by_uuid=actor_uuid,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_field_visibility_config_role_entity_field",
            set_={
                "mode": selected_mode,
                "updated_by_uuid": actor_uuid,
                "updated_at": now,
            },
        )
        .returning(FieldVisibilityConfig)
    )
    config = (await db.scalars(stmt)).one()

    if old_mode != selected_mode:
        await record_audit(
            db,
            action=AuditAction.FIELD_VISIBILITY_UPDATED,
            entity_type="field_visibility_config",
            entity_uuid=config.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            detail={
                "target_role": definition.target_role.value,
                "entity": entity,
                "field_key": field_key,
                "old_mode": old_mode.value,
                "new_mode": selected_mode.value,
            },
        )
        if (
            definition.target_role == FieldTargetRole.EMPLOYEE
            and entity == "lead"
            and field_key == "mobile"
            and selected_mode != FieldVisibilityMode.SHARE_LINK
        ):
            await db.execute(
                update(ContactShareLink)
                .where(
                    ContactShareLink.revoked_at.is_(None),
                    ContactShareLink.used_at.is_(None),
                )
                .values(revoked_at=now)
            )
    await db.commit()
    return config


def project_values(
    modes: dict[tuple[str, str], FieldVisibilityMode],
    entity: str,
    values: dict[str, object],
) -> dict[str, object]:
    """Return only catalogue fields whose effective mode permits raw output.

    Callers unpack this mapping into response models. Combined with FastAPI's
    ``response_model_exclude_unset``, a denied field is absent while an allowed
    field whose source value is genuinely null remains present as ``null``.
    """
    return {
        field_key: value
        for field_key, value in values.items()
        if modes.get((entity, field_key), FieldVisibilityMode.DENY) == FieldVisibilityMode.ALLOW
    }


def contact_mode(
    modes: dict[tuple[str, str], FieldVisibilityMode], entity: str = "lead"
) -> FieldVisibilityMode:
    return modes.get((entity, "mobile"), FieldVisibilityMode.DENY)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_contact_share_link(
    db: AsyncSession,
    *,
    task_uuid: uuid.UUID,
    lead_uuid: uuid.UUID,
    created_by_uuid: uuid.UUID,
) -> tuple[ContactShareLink, str]:
    await _lock_policy_key(db, FieldTargetRole.EMPLOYEE, "lead", "mobile")
    modes = await effective_modes(db, FieldTargetRole.EMPLOYEE)
    if contact_mode(modes) != FieldVisibilityMode.SHARE_LINK:
        raise ContactShareNotAllowed

    now = datetime.now(UTC)
    await db.execute(
        update(ContactShareLink)
        .where(
            ContactShareLink.task_uuid == task_uuid,
            ContactShareLink.created_by_uuid == created_by_uuid,
            ContactShareLink.revoked_at.is_(None),
            ContactShareLink.used_at.is_(None),
        )
        .values(revoked_at=now)
    )
    token = secrets.token_urlsafe(32)
    link = ContactShareLink(
        token_hash=_token_hash(token),
        task_uuid=task_uuid,
        lead_uuid=lead_uuid,
        created_by_uuid=created_by_uuid,
        expires_at=now + _SHARE_LINK_TTL,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link, token


async def revoke_contact_share_link(
    db: AsyncSession, *, link_uuid: uuid.UUID, created_by_uuid: uuid.UUID
) -> bool:
    link = await db.scalar(
        select(ContactShareLink).where(
            ContactShareLink.id == link_uuid,
            ContactShareLink.created_by_uuid == created_by_uuid,
        )
    )
    if link is None:
        return False
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
        await db.commit()
    return True


async def invitation_is_valid(token: str) -> bool:
    if len(token) < 32 or len(token) > 128:
        return False
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        link = await db.scalar(
            select(ContactShareLink.id)
            .join(Task, Task.id == ContactShareLink.task_uuid)
            .join(StaffProfile, StaffProfile.id == Task.assigned_employee_profile_uuid)
            .where(
                ContactShareLink.token_hash == _token_hash(token),
                ContactShareLink.expires_at > now,
                ContactShareLink.revoked_at.is_(None),
                ContactShareLink.used_at.is_(None),
                Task.lead_uuid == ContactShareLink.lead_uuid,
                or_(
                    Task.business_line == StaffProfile.business_line,
                    StaffProfile.business_line == "both",
                ),
                StaffProfile.auth_user_uuid == ContactShareLink.created_by_uuid,
                StaffProfile.role == StaffRole.EMPLOYEE,
                StaffProfile.status == ProfileStatus.ACTIVE,
                Task.status.in_((TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED)),
            )
        )
        return link is not None


async def consume_invitation(token: str, mobile: str) -> bool:
    """Consume a valid token only when the invitee proves the linked mobile.

    A mismatch stays indistinguishable from an invalid token and never changes
    the lead.  The normal public enquiry still succeeds independently.
    """
    if len(token) < 32 or len(token) > 128:
        return False
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        link = await db.scalar(
            select(ContactShareLink)
            .join(Lead, Lead.id == ContactShareLink.lead_uuid)
            .join(Task, Task.id == ContactShareLink.task_uuid)
            .join(StaffProfile, StaffProfile.id == Task.assigned_employee_profile_uuid)
            .where(
                ContactShareLink.token_hash == _token_hash(token),
                ContactShareLink.expires_at > now,
                ContactShareLink.revoked_at.is_(None),
                ContactShareLink.used_at.is_(None),
                Lead.mobile == mobile,
                Task.lead_uuid == ContactShareLink.lead_uuid,
                or_(
                    Task.business_line == StaffProfile.business_line,
                    StaffProfile.business_line == "both",
                ),
                StaffProfile.auth_user_uuid == ContactShareLink.created_by_uuid,
                StaffProfile.role == StaffRole.EMPLOYEE,
                StaffProfile.status == ProfileStatus.ACTIVE,
                Task.status.in_((TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED)),
            )
            .with_for_update()
        )
        if link is None:
            return False
        link.used_at = now
        await db.commit()
        return True
