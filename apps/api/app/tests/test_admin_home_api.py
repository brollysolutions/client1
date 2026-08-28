"""Admin home API — aggregated summary (Admin Dashboard slice 1).

Every underlying query runs on the request session under each table's own
RLS; this test suite exercises the aggregation and role gate, plus the two
RLS shapes admin_home.py's module docstring calls out (banners_select's
explicit role='admin' disjunct vs. the platform_scope bypass every other
table here uses).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile

_URL = "/api/v1/admin/home"


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


def _telecaller_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )


async def _create_pending_agent_application(mobile: str | None = None) -> str:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            first_name="Ravi",
            last_name="Kumar",
            mobile=mobile,
            business_line="real_estate",
            rera_code="RERA/AG/2026/00099",
            status=SubmissionStatus.PENDING,
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return str(application.id)


async def _create_pending_agent_application_with_no_name() -> str:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            first_name=None,
            last_name=None,
            mobile=None,
            business_line="real_estate",
            status=SubmissionStatus.PENDING,
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return str(application.id)


async def _seed_staff_profile(role: str, business_line: str = "loans") -> str:
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Staff",
            mobile=unique_mobile(),
            email=f"st_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole(role),
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"ST-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _seed_unassigned_task(business_line: str, raised_by_staff_uuid: str) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.task import Task, TaskStatus, TaskType

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(raised_by_staff_uuid),
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=uuid.UUID(raised_by_staff_uuid),
            business_line=business_line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
            status=TaskStatus.UNASSIGNED,
        )
        db.add(task)
        await db.commit()
        return str(task.id)


async def _seed_pending_payout(recipient_uuid: str, maker_uuid: str) -> str:
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(recipient_uuid),
            business_line="loans",
            type=PayoutType.REFERRAL_BONUS,
            amount_paise=100_000,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(maker_uuid),
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


@pytest.mark.asyncio
async def test_admin_can_load_home(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body["pending_review"], list)
    assert isinstance(body["pending_agent_applications_count"], int)
    assert isinstance(body["pending_banners_count"], int)
    assert isinstance(body["pending_property_submissions_count"], int)
    assert isinstance(body["open_loan_applications_count"], int)
    assert isinstance(body["open_property_deals_count"], int)
    assert isinstance(body["unassigned_leads_count"], int)
    assert isinstance(body["unassigned_tasks_count"], int)
    assert isinstance(body["payouts_awaiting_approval_count"], int)


@pytest.mark.asyncio
async def test_client_cannot_load_home(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_sub_admin_cannot_load_home(client: AsyncClient) -> None:
    """This is Admin's own landing page, not a shared-oversight endpoint —
    Sub Admin has its own composed home (test_sub_admin_home_api.py)."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_telecaller_cannot_load_home(client: AsyncClient) -> None:
    """Pins that require_admin, not RLS, is the gate: telecaller is
    platform_scope='false' and would see nothing even if it got past the
    role check, but it should never get past the role check at all."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_telecaller_token(uid)}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_pending_banner_from_another_author_appears(client: AsyncClient) -> None:
    """The key RLS test: banners_select admits Admin via an explicit
    role='admin' disjunct, not the platform_scope bypass every other table
    in this endpoint uses. Seeding under a DIFFERENT sub_admin than the
    querying admin proves that disjunct, not just app-layer plumbing."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    owner_headers = {
        "Authorization": (
            "Bearer "
            + create_access_token(
                {
                    "sub": owner_uid,
                    "role": "sub_admin",
                    "business_line": "both",
                    "platform_scope": "true",
                }
            )
        )
    }
    create_res = await client.post(
        "/api/v1/banners",
        json={
            "business_line": "loans",
            "banner_type": "default",
            "title": "Admin-home-queue banner",
        },
        headers=owner_headers,
    )
    assert create_res.status_code == 201, create_res.text
    banner_id = create_res.json()["id"]
    submit_res = await client.post(f"/api/v1/banners/{banner_id}/submit", headers=owner_headers)
    assert submit_res.status_code == 200, submit_res.text

    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    pending_ids = [item["id"] for item in body["pending_review"] if item["kind"] == "banner"]
    assert banner_id in pending_ids
    assert body["pending_banners_count"] >= 1


_PROJECT_AMENITIES = " ".join(["landscaped"] * 150)

_SUBMISSION_PAYLOAD = {
    "title": "Admin-home-queue submission",
    "type": "Apartment",
    "location": "Koramangala, Bengaluru",
    "category": "apartments",
    "property_subtype": "standalone_apartment",
    "city": "Bengaluru",
    "locality": "Koramangala",
    "state": "Karnataka",
    "pincode": "560095",
    "price_paise": 78_00_00_000,
    "area_sqft": 1200,
    "furnishing": "furnished",
    "construction_status": "ready",
    "rera_applicability": "applicable",
    "rera_number": "RERA/RE/2026/00098",
    "structured_details": {
        "kind": "project_residence",
        "project_name": "Admin Home Residences",
        "project_area_acres": 4.5,
        "number_of_towers": 3,
        "total_units": 120,
        "configurations": ["2_bhk", "3_bhk"],
        "unit_or_plot_area_sqft": 1200,
        "price_per_sqft_paise": 650_000,
        "sale_type": "new_sale",
        "plot_facing": "not_applicable",
        "entrance_facing": "east",
        "amenities_description": _PROJECT_AMENITIES,
        "about_project": "A calm community with landscaped gardens and generous shared spaces.",
    },
}


@pytest.mark.asyncio
async def test_pending_property_submission_from_another_submitter_appears(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import property_submissions, storage

    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)
    monkeypatch.setattr(storage, "copy_object", lambda _source, _destination, _ct: None)
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)
    monkeypatch.setattr(
        property_submissions,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: 2048,
    )

    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    owner_headers = {
        "Authorization": (
            "Bearer "
            + create_access_token(
                {
                    "sub": owner_uid,
                    "role": "sub_admin",
                    "business_line": "both",
                    "platform_scope": "true",
                }
            )
        )
    }
    submission_payload = {
        **_SUBMISSION_PAYLOAD,
        "media": [
            {
                "kind": "image",
                "content_type": "image/jpeg",
                "object_key": (
                    f"private/property-submissions/staging/{owner_uid}/{uuid.uuid4()}/asset.jpg"
                ),
                "position": 0,
            }
        ],
    }
    create_res = await client.post(
        "/api/v1/property-submissions", json=submission_payload, headers=owner_headers
    )
    assert create_res.status_code == 201, create_res.text
    submission_id = create_res.json()["id"]

    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    pending_ids = [
        item["id"] for item in body["pending_review"] if item["kind"] == "property_submission"
    ]
    assert submission_id in pending_ids
    assert body["pending_property_submissions_count"] >= 1


@pytest.mark.asyncio
async def test_pending_agent_application_appears(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_agent_application(mobile=unique_mobile())

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    pending_ids = [
        item["id"] for item in body["pending_review"] if item["kind"] == "agent_application"
    ]
    assert app_id in pending_ids
    assert body["pending_agent_applications_count"] >= 1


@pytest.mark.asyncio
async def test_pending_queue_is_capped_while_counts_are_not(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    for _ in range(35):
        await _create_pending_agent_application(mobile=unique_mobile())

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["pending_review"]) <= 30
    assert body["pending_agent_applications_count"] >= 35


@pytest.mark.asyncio
async def test_unassigned_counts_are_visible_to_admin(client: AsyncClient) -> None:
    """Seeds a task and a payout under OTHER accounts than the querying
    admin, proving tasks_rls / payouts_rls admit Admin on the request
    session rather than relying on own-authored visibility."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    raiser_uuid = await _seed_staff_profile("telecaller", "loans")
    await _seed_unassigned_task("loans", raiser_uuid)

    _, recipient_mobile = await full_registration(client)
    recipient_uid = await _auth_user_uuid(recipient_mobile)
    _, maker_mobile = await full_registration(client)
    maker_uid = await _auth_user_uuid(maker_mobile)
    await _seed_pending_payout(recipient_uid, maker_uid)

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["unassigned_tasks_count"] >= 1
    assert body["payouts_awaiting_approval_count"] >= 1


@pytest.mark.asyncio
async def test_agent_application_with_null_name_does_not_500(client: AsyncClient) -> None:
    """Title-fallback regression: first_name/last_name/mobile are all
    nullable on AgentApplication. A None reaching a str field 500s the
    whole endpoint, taking every other admin down with it."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_agent_application_with_no_name()

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    item = next(i for i in body["pending_review"] if i["id"] == app_id)
    assert item["title"] == "Agent application"
