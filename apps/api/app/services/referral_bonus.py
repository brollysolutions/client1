"""Audited referral-rule commands with history-preserving deletion."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.deps import CurrentUser, is_platform_admin
from app.models.audit_log import AuditAction
from app.models.referral import Referral
from app.models.referral_bonus_config import ReferralBonusConfig
from app.schemas.referral_bonus import ReferralBonusConfigCreate, ReferralBonusConfigUpdate
from app.services.audit_log import record as record_audit


def _assert_owner(current_user: CurrentUser, config: ReferralBonusConfig) -> None:
    if not is_platform_admin(current_user) and config.created_by_uuid != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage referral bonus rules you created.",
        )


async def referenced_rule_ids(config_ids: list[UUID]) -> set[UUID]:
    """Return only rule identifiers that have history, without exposing referrals.

    Sub Admin intentionally has no SELECT policy on referrals.  This narrow
    bypass query is therefore required for a truthful delete guard; it returns
    no customer, referrer, status, or payout data.
    """
    if not config_ids:
        return set()
    async with db_session.AsyncSessionLocal() as history_db:
        return set(
            (
                await history_db.scalars(
                    select(Referral.bonus_config_uuid)
                    .where(Referral.bonus_config_uuid.in_(config_ids))
                    .distinct()
                )
            ).all()
        )


async def is_referenced(config_id: UUID) -> bool:
    return config_id in await referenced_rule_ids([config_id])


async def create_rule(
    db: AsyncSession,
    *,
    current_user: CurrentUser,
    payload: ReferralBonusConfigCreate,
) -> ReferralBonusConfig:
    config = ReferralBonusConfig(created_by_uuid=current_user.id, **payload.model_dump())
    db.add(config)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.REFERRAL_RULE_CREATED,
        entity_type="referral_bonus_config",
        entity_uuid=config.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=config.business_line,
        detail={"active": config.active},
    )
    await db.commit()
    await db.refresh(config)
    return config


async def update_rule(
    db: AsyncSession,
    *,
    current_user: CurrentUser,
    config_id: UUID,
    payload: ReferralBonusConfigUpdate,
) -> ReferralBonusConfig:
    config = await db.scalar(
        select(ReferralBonusConfig).where(ReferralBonusConfig.id == config_id).with_for_update()
    )
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral bonus config not found.",
        )
    _assert_owner(current_user, config)
    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(config, field, value)
    await record_audit(
        db,
        action=AuditAction.REFERRAL_RULE_UPDATED,
        entity_type="referral_bonus_config",
        entity_uuid=config.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=config.business_line,
        detail={"changed_fields": sorted(changed), "active": config.active},
    )
    await db.commit()
    await db.refresh(config)
    return config


async def delete_rule(
    db: AsyncSession,
    *,
    current_user: CurrentUser,
    config_id: UUID,
) -> None:
    config = await db.scalar(
        select(ReferralBonusConfig).where(ReferralBonusConfig.id == config_id).with_for_update()
    )
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referral bonus config not found.",
        )
    _assert_owner(current_user, config)
    if config.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Retire this referral bonus rule before deleting it.",
        )
    if await is_referenced(config.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This rule has referral history and must be retained as retired.",
        )

    await db.delete(config)
    await record_audit(
        db,
        action=AuditAction.REFERRAL_RULE_DELETED,
        entity_type="referral_bonus_config",
        entity_uuid=config.id,
        actor_uuid=current_user.id,
        actor_role=current_user.role,
        business_line=config.business_line,
        detail={"active": False},
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        # A referral may select the rule between the history check and DELETE.
        # The immutable FK remains authoritative; translate that race to the
        # same stable product response instead of surfacing a database error.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This rule has referral history and must be retained as retired.",
        ) from exc
