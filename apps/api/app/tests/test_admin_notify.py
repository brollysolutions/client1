"""Admin notification fan-out (FR-11.3, feature-status.md §5-1).

notify_admins must: fan out to every ACTIVE admin, exclude the given actor,
dedupe an auth_user holding two staff_profiles rows, no-op when there are no
admins, and — the load-bearing property — never fire for an action whose own
commit never happened (record_audit(...) before commit, notify_admins(...)
after; a rolled-back approve must produce zero notifications).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.models.notification import NotificationType
from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
from app.models.user import User
from app.services.admin_notify import notify_admins
from conftest import unique_mobile

pytestmark = pytest.mark.asyncio


async def _seed_admin(*, status: ProfileStatus = ProfileStatus.ACTIVE) -> str:
    """Returns auth_user_uuid of a new ADMIN staff profile."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Admin",
            mobile=unique_mobile(),
            email=f"admin_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        db.add(
            StaffProfile(
                auth_user_uuid=user.id,
                role=StaffRole.ADMIN,
                scope=ProfileScope.PLATFORM,
                staff_code=f"AD-{uuid.uuid4().hex[:8]}",
                status=status,
            )
        )
        await db.commit()
        return str(user.id)


async def _notification_recipients(notification_type: NotificationType, title: str) -> set[str]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text("SELECT user_uuid FROM notifications WHERE type = :type AND title = :title"),
                {"type": notification_type.value, "title": title},
            )
        ).fetchall()
        return {str(r[0]) for r in rows}


def _uncap_fanout(monkeypatch: pytest.MonkeyPatch) -> None:
    """The shared test Postgres never truncates, so real ACTIVE admin
    staff_profiles rows accumulate across the whole session/suite —
    without raising the cap, _MAX_ADMIN_FANOUT's real truncation logic
    could silently drop a test's own fresh admin uuid, producing a false
    pass/fail unrelated to the behaviour under test."""
    import app.services.admin_notify as admin_notify_module

    monkeypatch.setattr(admin_notify_module, "_MAX_ADMIN_FANOUT", 10_000)


async def test_notify_admins_fans_out_to_active_admins_only(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _uncap_fanout(monkeypatch)
    active1 = await _seed_admin()
    active2 = await _seed_admin()
    inactive = await _seed_admin(status=ProfileStatus.INACTIVE)
    title = f"test-fanout-{uuid.uuid4().hex[:8]}"

    await notify_admins(
        notification_type=NotificationType.ADMIN_ACCOUNT_ACTION, title=title, body="x"
    )

    recipients = await _notification_recipients(NotificationType.ADMIN_ACCOUNT_ACTION, title)
    assert active1 in recipients
    assert active2 in recipients
    assert inactive not in recipients


async def test_notify_admins_excludes_given_actor(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _uncap_fanout(monkeypatch)
    acting_admin = await _seed_admin()
    other_admin = await _seed_admin()
    title = f"test-exclude-{uuid.uuid4().hex[:8]}"

    await notify_admins(
        notification_type=NotificationType.ADMIN_ACCOUNT_ACTION,
        title=title,
        body="x",
        exclude_user_uuid=uuid.UUID(acting_admin),
    )

    recipients = await _notification_recipients(NotificationType.ADMIN_ACCOUNT_ACTION, title)
    assert acting_admin not in recipients
    assert other_admin in recipients


async def test_notify_admins_excludes_the_only_admin_it_is_told_to(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Must never raise, and the excluded uuid must never appear — even
    though the shared test Postgres has accumulated many other real ACTIVE
    admins across the session, so this is NOT a "zero recipients" assertion
    (that would be false: every other real admin legitimately gets
    notified), only "the excluded one specifically does not"."""
    _uncap_fanout(monkeypatch)
    only_admin = await _seed_admin()
    title = f"test-noop-{uuid.uuid4().hex[:8]}"

    await notify_admins(
        notification_type=NotificationType.ADMIN_ACCOUNT_ACTION,
        title=title,
        body="x",
        exclude_user_uuid=uuid.UUID(only_admin),
    )

    recipients = await _notification_recipients(NotificationType.ADMIN_ACCOUNT_ACTION, title)
    assert only_admin not in recipients


# ---------------------------------------------------------------------------
# Integration through a real call site: payments.approve_payout
# ---------------------------------------------------------------------------


async def _seed_payout_pending_approval(recipient_uid: str, maker_uid: str) -> str:
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uid),
            type=PayoutType.CASHBACK,
            amount_paise=25_000,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uid),
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def test_payout_approve_notifies_other_admins_not_the_approver(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _uncap_fanout(monkeypatch)
    from app.services import payments as payments_service

    approver = await _seed_admin()
    other_admin = await _seed_admin()
    maker_mobile = unique_mobile()
    from conftest import full_registration

    _, maker_mobile = await full_registration(client, mobile=maker_mobile, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        maker_uid = (
            await db.execute(
                text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": maker_mobile}
            )
        ).scalar_one()

    payout_id = await _seed_payout_pending_approval(str(maker_uid), str(maker_uid))

    await payments_service.approve_payout(
        payout_id=uuid.UUID(payout_id), checker_user_uuid=uuid.UUID(approver), checker_role="admin"
    )

    recipients = await _notification_recipients(
        NotificationType.ADMIN_PAYOUT_REVIEWED, "Payout approved"
    )
    assert approver not in recipients
    assert other_admin in recipients


async def test_payout_approve_rollback_writes_no_notification(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The load-bearing test: if the approve transaction never commits, zero
    notifications must exist for it — proves notify_admins runs strictly
    after the commit, not interleaved with it."""
    _uncap_fanout(monkeypatch)
    from app.services import payments as payments_service

    approver = await _seed_admin()
    other_admin = await _seed_admin()  # would otherwise be notified
    from conftest import full_registration

    _, maker_mobile = await full_registration(client, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        maker_uid = (
            await db.execute(
                text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": maker_mobile}
            )
        ).scalar_one()

    payout_id = await _seed_payout_pending_approval(str(maker_uid), str(maker_uid))

    async def _raise(*args, **kwargs):
        raise RuntimeError("simulated audit failure before commit")

    monkeypatch.setattr(payments_service, "record_audit", _raise)

    with pytest.raises(RuntimeError):
        await payments_service.approve_payout(
            payout_id=uuid.UUID(payout_id),
            checker_user_uuid=uuid.UUID(approver),
            checker_role="admin",
        )

    # Scoped to this test's own fresh admin uuids, not a global-empty
    # assertion — the shared test DB accumulates rows across the whole
    # suite/session, so a global "== set()" would be flaky against
    # unrelated tests' "Payout approved" notifications.
    recipients = await _notification_recipients(
        NotificationType.ADMIN_PAYOUT_REVIEWED, "Payout approved"
    )
    assert approver not in recipients
    assert other_admin not in recipients
