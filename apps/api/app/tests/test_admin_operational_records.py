"""Platform-Admin operational record visibility with least-data projections."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile

OPERATION_PATHS = (
    "/api/v1/admin/operations/auth-events",
    "/api/v1/admin/operations/enquiries",
    "/api/v1/admin/operations/field-visibility-config",
    "/api/v1/admin/operations/lead-activities",
    "/api/v1/admin/operations/loan-transaction-history",
    "/api/v1/admin/operations/site-visits",
    "/api/v1/admin/operations/transactions",
    "/api/v1/admin/operations/financial-service-enquiries",
)


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        user_id = await db.scalar(
            text("SELECT id FROM auth_users WHERE mobile = :mobile"),
            {"mobile": mobile},
        )
        assert user_id is not None
        return str(user_id)


def _token(user_id: str, *, role: str, platform_scope: str, business_line: str = "") -> str:
    return create_access_token(
        {
            "sub": user_id,
            "role": role,
            "business_line": business_line,
            "platform_scope": platform_scope,
        }
    )


async def _seed_operational_records(client: AsyncClient) -> tuple[str, dict[str, str]]:
    _, client_mobile = await full_registration(client, lines=["loans", "real_estate"])
    client_user_id = await _auth_user_uuid(client_mobile)

    import app.db.session as session_module
    from app.models.auth import AuthEvent
    from app.models.enquiry import Enquiry, EnquiryStatus
    from app.models.field_visibility import (
        FieldTargetRole,
        FieldVisibilityConfig,
        FieldVisibilityMode,
    )
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.lead_activity import CallDisposition, InterestLevel, LeadActivity
    from app.models.loan import (
        Bank,
        FinancialServiceEnquiry,
        LoanApplication,
        LoanTxnHistory,
        LoanType,
    )
    from app.models.profile import (
        ClientProfile,
        ProfileScope,
        ProfileStatus,
        StaffProfile,
        StaffRole,
    )
    from app.models.site_visit import SiteVisit, SiteVisitStatus, SiteVisitTimeSlot
    from app.models.transaction import Transaction, TransactionStatus, TransactionType
    from app.models.user import User

    async with session_module.AsyncSessionLocal() as db:
        client_profiles = (
            await db.scalars(
                select(ClientProfile).where(
                    ClientProfile.auth_user_uuid == uuid.UUID(client_user_id)
                )
            )
        ).all()
        loans_profile = next(p for p in client_profiles if p.business_line == "loans")
        real_estate_profile = next(p for p in client_profiles if p.business_line == "real_estate")
        real_estate_profile.status = ProfileStatus.PENDING

        telecaller_user = User(
            first_name="Operations",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"ops-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(telecaller_user)
        await db.flush()
        telecaller = StaffProfile(
            auth_user_uuid=telecaller_user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=f"OPS-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"ops-{uuid.uuid4().hex[:8]}", label="Operations loan")
        service_product = LoanType(
            name=f"ops-card-{uuid.uuid4().hex[:8]}",
            label="Operations credit card",
            category="credit_card",
        )
        bank = Bank(name=f"Operations Bank {uuid.uuid4().hex[:8]}")
        db.add_all([telecaller, loan_type, service_product, bank])
        await db.flush()

        lead = Lead(
            client_profile_uuid=loans_profile.id,
            business_line="loans",
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=telecaller.id,
            mobile=unique_mobile(),
            status=LeadStatus.ASSIGNED,
        )
        db.add(lead)
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=loans_profile.id,
            business_line="loans",
            loan_type_id=loan_type.id,
            bank_id=bank.id,
        )
        db.add(application)
        await db.flush()

        auth_event = AuthEvent(
            auth_user_uuid=uuid.UUID(client_user_id),
            event_type="operations_visibility_test",
            mobile=client_mobile,
            ip="203.0.113.42",
            user_agent="sensitive-test-agent",
            success=False,
            detail={"reason": "must not be exposed"},
        )
        enquiry = Enquiry(
            user_uuid=uuid.UUID(client_user_id),
            business_line="real_estate",
            property_ref="ops-property",
            title="Operations enquiry",
            locality="Whitefield",
            city="Bengaluru",
            contact_name="Sensitive Name",
            contact_mobile=client_mobile,
            message="Sensitive enquiry message",
            status=EnquiryStatus.CONTACTED,
        )
        activity = LeadActivity(
            lead_uuid=lead.id,
            telecaller_staff_profile_uuid=telecaller.id,
            business_line="loans",
            disposition=CallDisposition.CONNECTED,
            interest_level=InterestLevel.WARM,
            notes="Sensitive call notes",
            follow_up_at=datetime.now(UTC) + timedelta(days=1),
        )
        visibility_config = await db.scalar(
            select(FieldVisibilityConfig).where(
                FieldVisibilityConfig.target_role == FieldTargetRole.EMPLOYEE,
                FieldVisibilityConfig.entity == "lead",
                FieldVisibilityConfig.field_key == "name",
            )
        )
        if visibility_config is None:
            visibility_config = FieldVisibilityConfig(
                target_role=FieldTargetRole.EMPLOYEE,
                entity="lead",
                field_key="name",
                mode=FieldVisibilityMode.ALLOW,
                updated_by_uuid=uuid.UUID(client_user_id),
            )
            db.add(visibility_config)
        loan_history = LoanTxnHistory(
            loan_application_uuid=application.id,
            business_line="loans",
            bank_name="Operations Bank",
            amount=Decimal("123456.78"),
            interest_rate=Decimal("8.625"),
            txn_date=date.today(),
            entered_by_staff_profile_uuid=telecaller.id,
        )
        visit = SiteVisit(
            user_uuid=uuid.UUID(client_user_id),
            business_line="real_estate",
            property_ref="ops-property",
            title="Operations visit",
            locality="Whitefield",
            city="Bengaluru",
            contact_name="Sensitive Name",
            contact_mobile=client_mobile,
            preferred_date=date.today() + timedelta(days=2),
            preferred_time_slot=SiteVisitTimeSlot.MORNING,
            message="Sensitive visit message",
            status=SiteVisitStatus.CONFIRMED,
        )
        transaction = Transaction(
            user_uuid=uuid.UUID(client_user_id),
            business_line="loans",
            type=TransactionType.REFERRAL_BONUS,
            status=TransactionStatus.PAID,
            amount_paise=125_000,
            currency="INR",
            description="Operations referral payout",
            reference="external-secret-reference",
            retained_ref="internal-retained-reference",
        )
        financial_service_enquiry = FinancialServiceEnquiry(
            lead_uuid=lead.id,
            client_profile_uuid=loans_profile.id,
            business_line="loans",
            product_id=service_product.id,
            product_category="credit_card",
            status="submitted",
            form_version=7,
            form_schema_snapshot={
                "sections": [
                    {
                        "title": "Sensitive application facts",
                        "fields": [{"key": "annual_income"}],
                    }
                ]
            },
            form_answers={
                "registered_mobile": client_mobile,
                "annual_income": 1_234_567,
            },
            provider_offer_snapshot={
                "provider_name": "Sensitive Provider",
                "annual_fee": "4999",
            },
        )
        db.add_all(
            [
                auth_event,
                enquiry,
                activity,
                loan_history,
                visit,
                transaction,
                financial_service_enquiry,
            ]
        )
        await db.flush()
        record_ids = {
            "client_mobile": client_mobile,
            "auth_event": str(auth_event.id),
            "enquiry": str(enquiry.id),
            "visibility_config": str(visibility_config.id),
            "visibility_mode": visibility_config.mode.value,
            "activity": str(activity.id),
            "loan_history": str(loan_history.id),
            "visit": str(visit.id),
            "transaction": str(transaction.id),
            "financial_service_enquiry": str(financial_service_enquiry.id),
        }
        await db.commit()

    return client_user_id, record_ids


def _find(rows: list[dict], record_id: str) -> dict:
    return next(row for row in rows if row["id"] == record_id)


@pytest.mark.asyncio
async def test_platform_admin_lists_only_minimized_operational_fields(client: AsyncClient) -> None:
    client_user_id, record_ids = await _seed_operational_records(client)
    _, admin_mobile = await full_registration(client)
    admin_user_id = await _auth_user_uuid(admin_mobile)
    headers = {
        "Authorization": f"Bearer {_token(admin_user_id, role='admin', platform_scope='true')}"
    }

    responses = {
        path: await client.get(path, params={"limit": 100}, headers=headers)
        for path in OPERATION_PATHS
    }
    for response in responses.values():
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "private, no-store"

    auth_event = _find(responses[OPERATION_PATHS[0]].json()["events"], record_ids["auth_event"])
    assert set(auth_event) == {"id", "auth_user_uuid", "event_type", "success", "created_at"}
    assert auth_event["auth_user_uuid"] == client_user_id

    enquiry = _find(responses[OPERATION_PATHS[1]].json()["enquiries"], record_ids["enquiry"])
    assert set(enquiry) == {
        "id",
        "user_uuid",
        "property_ref",
        "title",
        "locality",
        "city",
        "status",
        "created_at",
        "updated_at",
    }

    visibility_config = _find(
        responses[OPERATION_PATHS[2]].json()["configs"],
        record_ids["visibility_config"],
    )
    assert set(visibility_config) == {
        "id",
        "target_role",
        "entity",
        "field_key",
        "mode",
        "updated_at",
    }
    assert visibility_config["target_role"] == "employee"
    assert visibility_config["entity"] == "lead"
    assert visibility_config["field_key"] == "name"
    assert visibility_config["mode"] == record_ids["visibility_mode"]

    activity = _find(responses[OPERATION_PATHS[3]].json()["activities"], record_ids["activity"])
    assert set(activity) == {
        "id",
        "lead_uuid",
        "telecaller_staff_profile_uuid",
        "business_line",
        "disposition",
        "interest_level",
        "follow_up_at",
        "created_at",
    }

    loan_history = _find(
        responses[OPERATION_PATHS[4]].json()["entries"], record_ids["loan_history"]
    )
    assert set(loan_history) == {
        "id",
        "loan_application_uuid",
        "business_line",
        "bank_name",
        "amount",
        "interest_rate",
        "txn_date",
        "entered_by_staff_profile_uuid",
        "created_at",
    }

    visit = _find(responses[OPERATION_PATHS[5]].json()["visits"], record_ids["visit"])
    assert set(visit) == {
        "id",
        "user_uuid",
        "property_ref",
        "title",
        "locality",
        "city",
        "preferred_date",
        "preferred_time_slot",
        "status",
        "cancelled_at",
        "created_at",
        "updated_at",
    }

    transaction = _find(
        responses[OPERATION_PATHS[6]].json()["transactions"], record_ids["transaction"]
    )
    assert set(transaction) == {
        "id",
        "user_uuid",
        "business_line",
        "type",
        "status",
        "amount_paise",
        "currency",
        "description",
        "created_at",
    }

    financial_service_enquiry_response = responses[OPERATION_PATHS[7]]
    financial_service_enquiry = _find(
        financial_service_enquiry_response.json()["enquiries"],
        record_ids["financial_service_enquiry"],
    )
    assert set(financial_service_enquiry) == {
        "id",
        "product_label",
        "product_category",
        "status",
        "form_version",
        "submitted_at",
    }
    assert financial_service_enquiry["product_label"] == "Operations credit card"
    assert financial_service_enquiry["product_category"] == "credit_card"
    assert financial_service_enquiry["status"] == "submitted"
    assert financial_service_enquiry["form_version"] == 7
    serialized_enquiries = financial_service_enquiry_response.text
    assert record_ids["client_mobile"] not in serialized_enquiries
    assert "Sensitive application facts" not in serialized_enquiries
    assert "Sensitive Provider" not in serialized_enquiries
    for protected_field in {
        "lead_uuid",
        "client_profile_uuid",
        "form_schema_snapshot",
        "form_answers",
        "preferred_provider_offer_id",
        "provider_offer_snapshot",
    }:
        assert protected_field not in serialized_enquiries

    users_response = await client.get("/api/v1/admin/users", params={"limit": 200}, headers=headers)
    assert users_response.status_code == 200, users_response.text
    assert users_response.headers["cache-control"] == "private, no-store"
    user = next(item for item in users_response.json()["users"] if item["id"] == client_user_id)
    profile_states = [
        (profile["business_line"], profile["status"]) for profile in user["client_profiles"]
    ]
    assert profile_states == [
        ("loans", "active"),
        ("real_estate", "pending"),
    ]
    assert all(profile["customer_code"] for profile in user["client_profiles"])


@pytest.mark.asyncio
async def test_operational_record_pagination_has_stable_total(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    admin_user_id = await _auth_user_uuid(admin_mobile)
    headers = {
        "Authorization": f"Bearer {_token(admin_user_id, role='admin', platform_scope='true')}"
    }

    first = await client.get(OPERATION_PATHS[0], params={"limit": 1, "offset": 0}, headers=headers)
    second = await client.get(OPERATION_PATHS[0], params={"limit": 1, "offset": 1}, headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["total"] == second.json()["total"]
    assert len(first.json()["events"]) == 1
    assert len(second.json()["events"]) == 1
    assert first.json()["events"][0]["id"] != second.json()["events"][0]["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "platform_scope", "business_line"),
    [
        ("client", "false", ""),
        ("sub_admin", "true", ""),
        ("admin", "false", "loans"),
    ],
)
async def test_non_platform_admins_cannot_list_operational_records(
    client: AsyncClient,
    role: str,
    platform_scope: str,
    business_line: str,
) -> None:
    _, mobile = await full_registration(client)
    user_id = await _auth_user_uuid(mobile)
    access_token = _token(
        user_id,
        role=role,
        platform_scope=platform_scope,
        business_line=business_line,
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    for path in OPERATION_PATHS:
        response = await client.get(path, headers=headers)
        assert response.status_code == 403, (path, response.text)


@pytest.mark.asyncio
async def test_operational_records_require_authentication(client: AsyncClient) -> None:
    for path in OPERATION_PATHS:
        response = await client.get(path)
        assert response.status_code == 401, (path, response.text)
