"""Populate the local stack with a deterministic, cross-role demo dataset.

Run from the API container (recommended):

    uv run python -m app.scripts.seed_demo

The command refuses to run outside ``ENV=development``.  It owns only the
UUIDv5 namespace and synthetic mobile/email range declared in ``demo_catalog``.
Existing unrelated rows are never deleted, reassigned, or used as identities.
Reruns reconcile the demo accounts and add any missing demo records.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db import base as _model_registry  # noqa: F401  # load all ORM models first
from app.models.audit_log import AuditAction, AuditLog
from app.models.banner import Banner, BannerPlacement, BannerStatus, BannerType
from app.models.bookmark import Bookmark
from app.models.commission import Commission, CommissionStatus
from app.models.content_block import ContentBlock, ContentStatus
from app.models.enquiry import Enquiry, EnquiryStatus
from app.models.fee_cashback import FeeCashback, FeeCashbackStatus
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.lead_activity import CallDisposition, InterestLevel, LeadActivity
from app.models.loan import FeeOutcome, LoanApplication, LoanStatus, LoanTxnHistory, LoanType
from app.models.notification import Notification, NotificationType
from app.models.offer import Offer, OfferStatus
from app.models.payout import (
    Payout,
    PayoutDestination,
    PayoutProvider,
    PayoutStatus,
    PayoutType,
)
from app.models.profile import (
    AgentApplication,
    AgentProfile,
    ClientProfile,
    ProfileScope,
    ProfileStatus,
    StaffFeatureGrant,
    StaffProfile,
    StaffRole,
)
from app.models.profile import (
    SubmissionStatus as AgentSubmissionStatus,
)
from app.models.property import (
    ConstructionStatus,
    Furnishing,
    Property,
    PropertyCategory,
    PropertySubtype,
    ReraApplicability,
    ReraVerificationStatus,
)
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.models.property_submission import PropertySubmission, SubmissionStatus
from app.models.referral import Referral, ReferralCode, ReferralStatus
from app.models.referral_bonus_config import ReferralBonusConfig
from app.models.site_visit import SiteVisit, SiteVisitStatus, SiteVisitTimeSlot
from app.models.support_ticket import SupportCategory, SupportStatus, SupportTicket
from app.models.task import BgCheckOutcome, Task, TaskStatus, TaskType
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.models.user import User, UserStatus
from app.models.vehicle_arrangement import VehicleArrangement, VehicleArrangementStatus
from app.scripts.demo_catalog import (
    DEMO_ACCOUNT_BY_KEY,
    DEMO_ACCOUNTS,
    DEMO_PASSWORD,
    credentials_table,
    demo_uuid,
)


class DemoSeedConflict(RuntimeError):
    """A deterministic identity collides with data not owned by this seeder."""


def _require_development() -> None:
    if settings.ENV != "development":
        raise SystemExit(
            f"seed_demo is development-only; refusing to run with ENV={settings.ENV!r}."
        )


async def _add_once(db: AsyncSession, row: Any) -> bool:
    existing = await db.get(type(row), row.id)
    if existing is not None:
        return False
    db.add(row)
    return True


async def _seed_accounts(db: AsyncSession, now: datetime) -> dict[str, User]:
    password_hash = await hash_password(DEMO_PASSWORD)
    users: dict[str, User] = {}
    for account in DEMO_ACCOUNTS:
        user_id = demo_uuid(f"user:{account.key}")
        by_id = await db.get(User, user_id)
        by_mobile = await db.scalar(select(User).where(User.mobile == account.mobile))
        by_email = await db.scalar(select(User).where(User.email == account.email))
        for existing, field in ((by_mobile, "mobile"), (by_email, "email")):
            if existing is not None and existing.id != user_id:
                raise DemoSeedConflict(
                    f"Synthetic {field} for {account.key} belongs to a non-demo account."
                )
        if by_id is None:
            user = User(
                id=user_id,
                first_name=account.first_name,
                last_name=account.last_name,
                mobile=account.mobile,
                email=account.email,
                gender="prefer_not_to_say",
                occupation=f"Synthetic {account.label}",
                location="Demo Nagar, Hyderabad",
                password_hash=password_hash,
                status=UserStatus.ACTIVE,
                phone_verified_at=now,
                email_verified_at=now,
            )
            db.add(user)
        else:
            if by_id.mobile != account.mobile:
                raise DemoSeedConflict(f"UUID for {account.key} is owned by another mobile.")
            user = by_id
            user.first_name = account.first_name
            user.last_name = account.last_name
            user.email = account.email
            user.password_hash = password_hash
            user.status = UserStatus.ACTIVE
            user.phone_verified_at = user.phone_verified_at or now
            user.email_verified_at = user.email_verified_at or now
        users[account.key] = user
    await db.flush()
    return users


async def _seed_profiles(
    db: AsyncSession, users: dict[str, User], now: datetime
) -> tuple[dict[str, StaffProfile], dict[str, AgentProfile], dict[str, ClientProfile]]:
    staff: dict[str, StaffProfile] = {}
    agents: dict[str, AgentProfile] = {}
    clients: dict[str, ClientProfile] = {}

    primary_admin_id = await db.scalar(
        select(StaffProfile.id).where(
            StaffProfile.is_primary_admin.is_(True),
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
    )
    for key in (
        "admin",
        "admin_checker",
        "sub_admin",
        "telecaller_loans",
        "telecaller_real_estate",
        "employee_loans",
        "employee_real_estate",
    ):
        account = DEMO_ACCOUNT_BY_KEY[key]
        profile_id = demo_uuid(f"staff:{key}")
        profile = await db.get(StaffProfile, profile_id)
        role = StaffRole(account.role)
        scope = (
            ProfileScope.PLATFORM
            if role in {StaffRole.ADMIN, StaffRole.SUB_ADMIN}
            else ProfileScope.LINE
        )
        is_primary = key == "admin" and primary_admin_id in {None, profile_id}
        if profile is None:
            profile = StaffProfile(
                id=profile_id,
                auth_user_uuid=users[key].id,
                role=role,
                scope=scope,
                business_line=account.business_line if scope == ProfileScope.LINE else None,
                staff_code={
                    "admin": "AD-DEMO01",
                    "admin_checker": "AD-DEMO02",
                    "sub_admin": "SA-DEMO01",
                    "telecaller_loans": "TC-LNDEMO01",
                    "telecaller_real_estate": "TC-REDEMO01",
                    "employee_loans": "EM-LNDEMO01",
                    "employee_real_estate": "EM-REDEMO01",
                }[key],
                status=ProfileStatus.ACTIVE,
                created_by_auth_user_uuid=users["admin"].id if key != "admin" else None,
                is_primary_admin=is_primary,
            )
            db.add(profile)
        staff[key] = profile

    # StaffFeatureGrant has no ORM relationship to StaffProfile, so SQLAlchemy's
    # unit-of-work cannot infer insertion order from object links alone.
    await db.flush()

    grant_key = (staff["sub_admin"].id, "payout_requests")
    grant = await db.get(StaffFeatureGrant, grant_key)
    if grant is None:
        db.add(
            StaffFeatureGrant(
                staff_profile_uuid=staff["sub_admin"].id,
                feature="payout_requests",
                granted_by_auth_user_uuid=users["admin"].id,
                created_at=now,
            )
        )

    for key in ("agent_loans", "agent_real_estate"):
        account = DEMO_ACCOUNT_BY_KEY[key]
        profile_id = demo_uuid(f"agent:{key}")
        profile = await db.get(AgentProfile, profile_id)
        if profile is None:
            profile = AgentProfile(
                id=profile_id,
                auth_user_uuid=users[key].id,
                agent_code="AG-LNDEMO01" if key == "agent_loans" else "AG-REDEMO01",
                business_line=account.business_line,
                kyc_status="verified",
                rera_code="RERA/DEMO/AG/001" if key == "agent_real_estate" else None,
                status=ProfileStatus.ACTIVE,
                approved_by_staff_profile_uuid=staff["admin"].id,
                approved_at=now - timedelta(days=90),
            )
            db.add(profile)
        agents[key] = profile

    for account_key in ("client", "client_referred"):
        for line in ("loans", "real_estate"):
            profile_key = f"{account_key}:{line}"
            profile_id = demo_uuid(f"client:{profile_key}")
            profile = await db.get(ClientProfile, profile_id)
            if profile is None:
                profile = ClientProfile(
                    id=profile_id,
                    auth_user_uuid=users[account_key].id,
                    business_line=line,
                    customer_code=(
                        "CL-LNDEMO01"
                        if profile_key == "client:loans"
                        else "CL-REDEMO01"
                        if profile_key == "client:real_estate"
                        else "CL-LNDEMO02"
                        if profile_key == "client_referred:loans"
                        else "CL-REDEMO02"
                    ),
                    status=ProfileStatus.ACTIVE,
                )
                db.add(profile)
            clients[profile_key] = profile

    await db.flush()
    return staff, agents, clients


async def _seed_agent_applications(db: AsyncSession, now: datetime) -> None:
    rows = (
        AgentApplication(
            id=demo_uuid("agent-application:pending"),
            first_name="Nila",
            last_name="Applicant",
            mobile="+919000009001",
            email="agent.application.pending.demo@example.com",
            business_line="real_estate",
            rera_code="RERA/DEMO/PENDING/001",
            status=AgentSubmissionStatus.PENDING,
            created_at=now - timedelta(days=2),
        ),
        AgentApplication(
            id=demo_uuid("agent-application:rejected"),
            first_name="Kabir",
            last_name="Applicant",
            mobile="+919000009002",
            email="agent.application.rejected.demo@example.com",
            business_line="loans",
            status=AgentSubmissionStatus.REJECTED,
            review_note="Synthetic rejection: document details need correction.",
            reviewed_at=now - timedelta(days=1),
            created_at=now - timedelta(days=5),
        ),
    )
    for row in rows:
        await _add_once(db, row)


async def _seed_properties(
    db: AsyncSession, users: dict[str, User], now: datetime
) -> dict[str, Property]:
    definitions = (
        (
            "villa",
            "Demo Lakeview Villa",
            "Villa",
            "Kokapet, Hyderabad",
            "₹2.40 Cr",
            PropertyCategory.VILLAS,
            PropertySubtype.VILLA,
            2_40_00_00_000,
            4,
            3200,
            "/illustrations/properties/villa-1.svg",
        ),
        (
            "apartment",
            "Demo Metro Apartment",
            "Apartment",
            "Gachibowli, Hyderabad",
            "₹1.35 Cr",
            PropertyCategory.APARTMENTS,
            PropertySubtype.GATED_COMMUNITY_APARTMENT,
            1_35_00_00_000,
            3,
            1850,
            "/illustrations/properties/apartment-1.svg",
        ),
        (
            "plot",
            "Demo Gated Community Plot",
            "Plot",
            "Mokila, Hyderabad",
            "₹58 L",
            PropertyCategory.PLOTS,
            PropertySubtype.PLOT,
            58_00_00_000,
            0,
            2400,
            "/illustrations/properties/plot-1.svg",
        ),
    )
    result: dict[str, Property] = {}
    for index, definition in enumerate(definitions, start=1):
        (
            key,
            title,
            type_label,
            location,
            price_display,
            category,
            subtype,
            price,
            bhk,
            area,
            image,
        ) = definition
        property_id = demo_uuid(f"property:{key}")
        prop = await db.get(Property, property_id)
        if prop is None:
            locality, city = location.split(", ", 1)
            prop = Property(
                id=property_id,
                business_line="real_estate",
                active=True,
                title=title,
                type=type_label,
                location=location,
                price_display=price_display,
                meta=f"{bhk} bed · {area:,} sqft" if bhk else f"{area:,} sqft",
                image=image,
                category=category,
                property_subtype=subtype,
                city=city,
                locality=locality,
                state="Telangana",
                pincode=("500075", "500032", "501203")[index - 1],
                price_paise=price,
                bhk=bhk,
                area_sqft=area,
                furnishing=Furnishing.SEMI if bhk else Furnishing.UNFURNISHED,
                construction_status=ConstructionStatus.READY,
                amenities=["Parking", "Security", "Power Backup"],
                age_years=2 if bhk else 0,
                rera_number=f"RERA/TS/DEMO/{index:04d}",
                rera_applicability=ReraApplicability.APPLICABLE,
                rera_verification_status=ReraVerificationStatus.VERIFIED,
                rera_verified_at=now - timedelta(days=30),
                rera_verified_by_uuid=users["admin"].id,
                details={"demo": True},
            )
            db.add(prop)
        result[key] = prop
    await db.flush()
    return result


def _submission(
    key: str,
    *,
    submitter_uuid: Any,
    title: str,
    status: SubmissionStatus,
    property_id: Any | None = None,
    reviewer_uuid: Any | None = None,
    now: datetime,
) -> PropertySubmission:
    return PropertySubmission(
        id=demo_uuid(f"property-submission:{key}"),
        submitter_uuid=submitter_uuid,
        business_line="real_estate",
        status=status,
        review_note=(
            "Synthetic rejection: clarify the ownership narrative."
            if status == SubmissionStatus.REJECTED
            else None
        ),
        reviewed_by_uuid=reviewer_uuid,
        reviewed_at=now - timedelta(days=2) if reviewer_uuid else None,
        approved_property_id=property_id,
        title=title,
        type="Apartment",
        location="Kondapur, Hyderabad",
        meta="3 bed · 1,750 sqft",
        image="/illustrations/properties/apartment-2.svg",
        category=PropertyCategory.APARTMENTS,
        property_subtype=PropertySubtype.STANDALONE_APARTMENT,
        city="Hyderabad",
        locality="Kondapur",
        state="Telangana",
        pincode="500084",
        price_paise=1_20_00_00_000,
        bhk=3,
        area_sqft=1750,
        furnishing=Furnishing.SEMI,
        construction_status=ConstructionStatus.READY,
        amenities=["Lift", "Parking", "Power Backup"],
        age_years=3,
        rera_number="RERA/TS/DEMO/SUB01",
        rera_applicability=ReraApplicability.APPLICABLE,
        rera_verification_status=(
            ReraVerificationStatus.VERIFIED
            if status == SubmissionStatus.APPROVED
            else ReraVerificationStatus.NOT_REVIEWED
        ),
        rera_verified_at=now - timedelta(days=2) if status == SubmissionStatus.APPROVED else None,
        rera_verified_by_uuid=reviewer_uuid if status == SubmissionStatus.APPROVED else None,
        details={"demo": True},
        created_at=now - timedelta(days=7),
    )


async def _seed_property_submissions(
    db: AsyncSession, users: dict[str, User], properties: dict[str, Property], now: datetime
) -> None:
    rows = (
        _submission(
            "agent-pending",
            submitter_uuid=users["agent_real_estate"].id,
            title="Demo Agent Pending Apartment",
            status=SubmissionStatus.PENDING,
            now=now,
        ),
        _submission(
            "agent-approved",
            submitter_uuid=users["agent_real_estate"].id,
            title=properties["apartment"].title,
            status=SubmissionStatus.APPROVED,
            property_id=properties["apartment"].id,
            reviewer_uuid=users["admin"].id,
            now=now,
        ),
        _submission(
            "agent-rejected",
            submitter_uuid=users["agent_real_estate"].id,
            title="Demo Agent Rejected Apartment",
            status=SubmissionStatus.REJECTED,
            reviewer_uuid=users["admin"].id,
            now=now,
        ),
        _submission(
            "sub-admin-pending",
            submitter_uuid=users["sub_admin"].id,
            title="Demo Sub Admin Pending Apartment",
            status=SubmissionStatus.PENDING,
            now=now,
        ),
    )
    for row in rows:
        await _add_once(db, row)


async def _seed_leads(
    db: AsyncSession,
    users: dict[str, User],
    clients: dict[str, ClientProfile],
    staff: dict[str, StaffProfile],
    agents: dict[str, AgentProfile],
    now: datetime,
) -> dict[str, Lead]:
    definitions = (
        (
            "client-loans",
            clients["client:loans"],
            "loans",
            None,
            staff["telecaller_loans"],
            users["client"].mobile,
            "Charan Client",
            LeadStatus.WORKING,
        ),
        (
            "client-real-estate",
            clients["client:real_estate"],
            "real_estate",
            agents["agent_real_estate"],
            staff["telecaller_real_estate"],
            users["client"].mobile,
            "Charan Client",
            LeadStatus.WORKING,
        ),
        (
            "referred-loans",
            clients["client_referred:loans"],
            "loans",
            agents["agent_loans"],
            staff["telecaller_loans"],
            users["client_referred"].mobile,
            "Diya Client",
            LeadStatus.CONVERTED,
        ),
        (
            "telecaller-loans",
            None,
            "loans",
            None,
            staff["telecaller_loans"],
            "+919000009101",
            "Demo Personal Loan Lead",
            LeadStatus.ASSIGNED,
        ),
        (
            "telecaller-real-estate",
            None,
            "real_estate",
            None,
            staff["telecaller_real_estate"],
            "+919000009102",
            "Demo Property Buyer",
            LeadStatus.ASSIGNED,
        ),
        (
            "closed-loans",
            clients["client:loans"],
            "loans",
            agents["agent_loans"],
            staff["telecaller_loans"],
            "+919000009103",
            "Demo Closed Loan",
            LeadStatus.CLOSED,
        ),
        (
            "closed-real-estate",
            clients["client_referred:real_estate"],
            "real_estate",
            agents["agent_real_estate"],
            staff["telecaller_real_estate"],
            "+919000009104",
            "Demo Closed Property Deal",
            LeadStatus.CLOSED,
        ),
    )
    result: dict[str, Lead] = {}
    for key, client_profile, line, agent, telecaller, mobile, name, status in definitions:
        lead_id = demo_uuid(f"lead:{key}")
        lead = await db.get(Lead, lead_id)
        if lead is None:
            lead = Lead(
                id=lead_id,
                client_profile_uuid=client_profile.id if client_profile else None,
                business_line=line,
                origin=LeadOrigin.AGENT if agent else LeadOrigin.DIRECT,
                origin_agent_profile_uuid=agent.id if agent else None,
                assigned_telecaller_profile_uuid=telecaller.id,
                name=name,
                mobile=mobile,
                requirement={
                    "product": "Personal Loan" if line == "loans" else "Residential Property",
                    "location": "Hyderabad",
                    "budget": "Synthetic demo only",
                },
                detail_ownership={},
                status=status,
                expires_at=now + timedelta(days=20)
                if agent and status != LeadStatus.CLOSED
                else None,
                created_at=now - timedelta(days=20),
            )
            db.add(lead)
        result[key] = lead
    await db.flush()

    activities = (
        LeadActivity(
            id=demo_uuid("lead-activity:loans-due"),
            lead_uuid=result["client-loans"].id,
            telecaller_staff_profile_uuid=staff["telecaller_loans"].id,
            business_line="loans",
            disposition=CallDisposition.CALLBACK_REQUESTED,
            interest_level=InterestLevel.WARM,
            notes="Synthetic callback due for the demo workspace.",
            follow_up_at=now - timedelta(hours=1),
        ),
        LeadActivity(
            id=demo_uuid("lead-activity:real-estate-due"),
            lead_uuid=result["client-real-estate"].id,
            telecaller_staff_profile_uuid=staff["telecaller_real_estate"].id,
            business_line="real_estate",
            disposition=CallDisposition.CONNECTED,
            interest_level=InterestLevel.HOT,
            notes="Synthetic buyer requested a site-visit follow-up.",
            follow_up_at=now - timedelta(minutes=30),
        ),
    )
    for row in activities:
        await _add_once(db, row)
    return result


async def _seed_loans(
    db: AsyncSession,
    clients: dict[str, ClientProfile],
    leads: dict[str, Lead],
    staff: dict[str, StaffProfile],
    now: datetime,
) -> dict[str, LoanApplication]:
    personal = await db.scalar(select(LoanType).where(LoanType.name == "personal-loan"))
    home = await db.scalar(select(LoanType).where(LoanType.name == "home-loan"))
    if personal is None or home is None:
        raise RuntimeError("Run `alembic upgrade head`; personal-loan/home-loan config is missing.")

    definitions = (
        (
            "active",
            leads["client-loans"],
            clients["client:loans"],
            personal,
            LoanStatus.SANCTIONED,
            750_000,
            700_000,
            None,
        ),
        (
            "closed",
            leads["closed-loans"],
            clients["client:loans"],
            home,
            LoanStatus.CLOSED,
            4_500_000,
            4_200_000,
            now - timedelta(days=120),
        ),
        (
            "referred",
            leads["referred-loans"],
            clients["client_referred:loans"],
            personal,
            LoanStatus.NEW,
            500_000,
            None,
            None,
        ),
    )
    result: dict[str, LoanApplication] = {}
    for key, lead, client, loan_type, status, requested, sanctioned, disbursed_at in definitions:
        app_id = demo_uuid(f"loan-application:{key}")
        application = await db.get(LoanApplication, app_id)
        if application is None:
            closed_at = now - timedelta(days=90) if status == LoanStatus.CLOSED else None
            application = LoanApplication(
                id=app_id,
                lead_uuid=lead.id,
                client_profile_uuid=client.id,
                business_line="loans",
                loan_type_id=loan_type.id,
                amount_requested=requested,
                amount_sanctioned=sanctioned,
                interest_rate=Decimal("10.75") if sanctioned else None,
                processing_fee=Decimal("7500.00") if sanctioned else None,
                fee_outcome=FeeOutcome.CASHBACK if sanctioned else None,
                status=status,
                form_version=loan_type.form_version,
                form_schema_snapshot=loan_type.custom_fields,
                form_answers={
                    "date_of_birth": "1992-04-14",
                    "current_location": "Hyderabad",
                    "current_pincode": "500032",
                    "employment_type": "salaried",
                    "net_monthly_salary": "95000",
                    "requested_amount": str(requested),
                },
                opened_at=now - timedelta(days=150 if key == "closed" else 12),
                closed_at=closed_at,
                disbursed_at=disbursed_at,
            )
            db.add(application)
        result[key] = application
    await db.flush()

    history = LoanTxnHistory(
        id=demo_uuid("loan-txn-history:active"),
        loan_application_uuid=result["active"].id,
        business_line="loans",
        bank_name="Demo selected provider (non-binding)",
        amount=700_000,
        interest_rate=Decimal("10.75"),
        txn_date=date.today() - timedelta(days=2),
        entered_by_staff_profile_uuid=staff["telecaller_loans"].id,
    )
    await _add_once(db, history)
    return result


async def _seed_real_estate_workflows(
    db: AsyncSession,
    users: dict[str, User],
    clients: dict[str, ClientProfile],
    properties: dict[str, Property],
    leads: dict[str, Lead],
    staff: dict[str, StaffProfile],
    now: datetime,
) -> dict[str, PropertyDeal]:
    bookmark_rows = (
        Bookmark(
            id=demo_uuid("bookmark:villa"),
            user_uuid=users["client"].id,
            business_line="real_estate",
            property_ref=str(properties["villa"].id),
            title=properties["villa"].title,
            locality=properties["villa"].locality,
            city=properties["villa"].city,
        ),
        Bookmark(
            id=demo_uuid("bookmark:plot"),
            user_uuid=users["client"].id,
            business_line="real_estate",
            property_ref=str(properties["plot"].id),
            title=properties["plot"].title,
            locality=properties["plot"].locality,
            city=properties["plot"].city,
        ),
    )
    for row in bookmark_rows:
        await _add_once(db, row)

    enquiry_rows = (
        Enquiry(
            id=demo_uuid("enquiry:new"),
            user_uuid=users["client"].id,
            business_line="real_estate",
            property_ref=str(properties["villa"].id),
            title=properties["villa"].title,
            locality=properties["villa"].locality,
            city=properties["villa"].city,
            contact_name="Charan Client",
            contact_mobile=users["client"].mobile,
            message="Synthetic enquiry for UI testing.",
            status=EnquiryStatus.NEW,
        ),
        Enquiry(
            id=demo_uuid("enquiry:contacted"),
            user_uuid=users["client"].id,
            business_line="real_estate",
            property_ref=str(properties["plot"].id),
            title=properties["plot"].title,
            locality=properties["plot"].locality,
            city=properties["plot"].city,
            contact_name="Charan Client",
            contact_mobile=users["client"].mobile,
            status=EnquiryStatus.CONTACTED,
        ),
    )
    for row in enquiry_rows:
        await _add_once(db, row)

    visits: dict[str, SiteVisit] = {}
    visit_definitions = (
        (
            "upcoming",
            users["client"],
            properties["villa"],
            SiteVisitStatus.CONFIRMED,
            date.today() + timedelta(days=3),
        ),
        (
            "done",
            users["client_referred"],
            properties["apartment"],
            SiteVisitStatus.DONE,
            date.today() - timedelta(days=14),
        ),
        (
            "cancelled",
            users["client"],
            properties["plot"],
            SiteVisitStatus.CANCELLED,
            date.today() + timedelta(days=7),
        ),
    )
    for key, user, prop, status, preferred_date in visit_definitions:
        visit_id = demo_uuid(f"site-visit:{key}")
        visit = await db.get(SiteVisit, visit_id)
        if visit is None:
            visit = SiteVisit(
                id=visit_id,
                user_uuid=user.id,
                business_line="real_estate",
                property_ref=str(prop.id),
                title=prop.title,
                locality=prop.locality,
                city=prop.city,
                contact_name=f"{user.first_name} {user.last_name}",
                contact_mobile=user.mobile,
                preferred_date=preferred_date,
                preferred_time_slot=SiteVisitTimeSlot.AFTERNOON,
                message="Synthetic site visit for local UI testing.",
                status=status,
                cancelled_at=now - timedelta(days=1)
                if status == SiteVisitStatus.CANCELLED
                else None,
            )
            db.add(visit)
        visits[key] = visit
    await db.flush()

    arrangement = VehicleArrangement(
        id=demo_uuid("vehicle-arrangement:upcoming"),
        site_visit_uuid=visits["upcoming"].id,
        business_line="real_estate",
        pickup_location="Demo Nagar Metro Station, Hyderabad",
        pickup_at=now + timedelta(days=3),
        status=VehicleArrangementStatus.ASSIGNED,
        vehicle_make_model="Demo Electric Sedan",
        vehicle_registration="TS00DEMO1",
        driver_name="Synthetic Driver",
        driver_mobile="+919000009201",
        assigned_employee_profile_uuid=staff["employee_real_estate"].id,
        arranged_by_staff_profile_uuid=staff["admin"].id,
    )
    await _add_once(db, arrangement)

    deals: dict[str, PropertyDeal] = {}
    deal_definitions = (
        (
            "active",
            leads["client-real-estate"],
            clients["client:real_estate"],
            properties["villa"],
            visits["upcoming"],
            PropertyDealStatus.NEGOTIATION,
            None,
        ),
        (
            "closed",
            leads["closed-real-estate"],
            clients["client_referred:real_estate"],
            properties["apartment"],
            visits["done"],
            PropertyDealStatus.CLOSED,
            now - timedelta(days=5),
        ),
    )
    for key, lead, client, prop, visit, status, closed_at in deal_definitions:
        deal_id = demo_uuid(f"property-deal:{key}")
        deal = await db.get(PropertyDeal, deal_id)
        if deal is None:
            deal = PropertyDeal(
                id=deal_id,
                lead_uuid=lead.id,
                client_profile_uuid=client.id,
                property_id=prop.id,
                business_line="real_estate",
                site_visit_uuid=visit.id,
                price_quoted=Decimal("23000000.00"),
                booking_amount=Decimal("500000.00")
                if status == PropertyDealStatus.CLOSED
                else None,
                status=status,
                opened_at=now - timedelta(days=30),
                closed_at=closed_at,
            )
            db.add(deal)
        deals[key] = deal
    return deals


async def _seed_tasks(
    db: AsyncSession,
    leads: dict[str, Lead],
    staff: dict[str, StaffProfile],
    now: datetime,
) -> dict[str, Task]:
    definitions = (
        (
            "loan-docs",
            "loans",
            TaskType.DOCUMENT_COLLECTION,
            leads["client-loans"],
            staff["telecaller_loans"],
            staff["employee_loans"],
            TaskStatus.IN_PROGRESS,
            now + timedelta(hours=3),
            None,
        ),
        (
            "loan-background",
            "loans",
            TaskType.BACKGROUND_CHECK,
            leads["referred-loans"],
            staff["telecaller_loans"],
            staff["employee_loans"],
            TaskStatus.COMPLETED,
            now - timedelta(days=2),
            BgCheckOutcome.CLEAR,
        ),
        (
            "loan-overdue",
            "loans",
            TaskType.DOCUMENT_COLLECTION,
            leads["telecaller-loans"],
            staff["telecaller_loans"],
            staff["employee_loans"],
            TaskStatus.BLOCKED,
            now - timedelta(days=1),
            None,
        ),
        (
            "property-visit",
            "real_estate",
            TaskType.PROPERTY_VISIT,
            leads["client-real-estate"],
            staff["telecaller_real_estate"],
            staff["employee_real_estate"],
            TaskStatus.IN_PROGRESS,
            now + timedelta(hours=5),
            None,
        ),
        (
            "property-docs",
            "real_estate",
            TaskType.DOCUMENT_COLLECTION,
            leads["telecaller-real-estate"],
            staff["telecaller_real_estate"],
            staff["employee_real_estate"],
            TaskStatus.ASSIGNED,
            now + timedelta(days=1),
            None,
        ),
    )
    result: dict[str, Task] = {}
    for key, line, task_type, lead, raiser, employee, status, due_at, outcome in definitions:
        task_id = demo_uuid(f"task:{key}")
        task = await db.get(Task, task_id)
        if task is None:
            task = Task(
                id=task_id,
                assigned_employee_profile_uuid=employee.id,
                raised_by_staff_profile_uuid=raiser.id,
                business_line=line,
                task_type=task_type,
                lead_uuid=lead.id,
                status=status,
                notes=f"Synthetic {task_type.value.replace('_', ' ')} task.",
                outcome=outcome,
                due_at=due_at,
            )
            db.add(task)
        result[key] = task
    return result


async def _seed_money_and_referrals(
    db: AsyncSession,
    users: dict[str, User],
    clients: dict[str, ClientProfile],
    agents: dict[str, AgentProfile],
    leads: dict[str, Lead],
    loans: dict[str, LoanApplication],
    deals: dict[str, PropertyDeal],
    now: datetime,
) -> None:
    for key, code in (("client", "DM000001"), ("client_referred", "DM000002")):
        if await db.get(ReferralCode, users[key].id) is None:
            db.add(ReferralCode(auth_user_uuid=users[key].id, code=code))

    configs: dict[str, ReferralBonusConfig] = {}
    for line, amount in (("loans", Decimal("1500")), ("real_estate", Decimal("2500"))):
        config_id = demo_uuid(f"referral-config:{line}")
        config = await db.get(ReferralBonusConfig, config_id)
        if config is None:
            other_active = await db.scalar(
                select(ReferralBonusConfig.id).where(
                    ReferralBonusConfig.business_line == line,
                    ReferralBonusConfig.active.is_(True),
                )
            )
            config = ReferralBonusConfig(
                id=config_id,
                business_line=line,
                bonus_amount=amount,
                rule={"minimum_conversions": 1, "monthly_cap": 10, "demo": True},
                active=other_active is None,
                created_by_uuid=users["sub_admin"].id,
            )
            db.add(config)
        configs[line] = config
    await db.flush()

    transactions = {
        "client-cashback": Transaction(
            id=demo_uuid("transaction:client-cashback"),
            user_uuid=users["client"].id,
            business_line="loans",
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=500_000,
            description="Synthetic processing-fee cashback",
            reference="demo-cashback-paid",
            created_at=now - timedelta(days=20),
        ),
        "client-referral": Transaction(
            id=demo_uuid("transaction:client-referral"),
            user_uuid=users["client"].id,
            business_line="loans",
            type=TransactionType.REFERRAL_BONUS,
            status=TransactionStatus.PAID,
            amount_paise=150_000,
            description="Synthetic referral reward",
            reference="demo-referral-paid",
            created_at=now - timedelta(days=10),
        ),
        "agent-loans": Transaction(
            id=demo_uuid("transaction:agent-loans"),
            user_uuid=users["agent_loans"].id,
            business_line="loans",
            type=TransactionType.COMMISSION,
            status=TransactionStatus.PAID,
            amount_paise=2_500_000,
            description="Synthetic paid Loans commission",
            reference="demo-commission-loans",
            created_at=now - timedelta(days=30),
        ),
        "agent-real-estate": Transaction(
            id=demo_uuid("transaction:agent-real-estate"),
            user_uuid=users["agent_real_estate"].id,
            business_line="real_estate",
            type=TransactionType.COMMISSION,
            status=TransactionStatus.PROCESSING,
            amount_paise=7_500_000,
            description="Synthetic pending Real Estate commission",
            reference="demo-commission-real-estate",
            created_at=now - timedelta(days=3),
        ),
    }
    for row in transactions.values():
        await _add_once(db, row)
    # Payout-link integrity is enforced by a database trigger at INSERT time;
    # the referenced ledger rows must already be visible to that trigger.
    await db.flush()

    payouts = {
        "cashback": Payout(
            id=demo_uuid("payout:cashback-pending"),
            recipient_user_uuid=users["client"].id,
            business_line="loans",
            type=PayoutType.CASHBACK,
            amount_paise=750_000,
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.CHEQUE,
            provider=PayoutProvider.MANUAL,
            destination_hint="Cheque · demo pending",
            idempotency_key="demo-cashback-pending",
            maker_user_uuid=users["sub_admin"].id,
        ),
        "cashback-paid": Payout(
            id=demo_uuid("payout:cashback-paid"),
            recipient_user_uuid=users["client"].id,
            business_line="loans",
            type=PayoutType.CASHBACK,
            amount_paise=500_000,
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.CHEQUE,
            provider=PayoutProvider.MANUAL,
            destination_hint="Cheque · DEMO03",
            idempotency_key="demo-cashback-paid",
            maker_user_uuid=users["admin"].id,
            checker_user_uuid=users["admin_checker"].id,
            manual_reference_fingerprint="c" * 64,
            manual_issued_at=now - timedelta(days=21),
            manual_cleared_at=now - timedelta(days=20),
            ledger_transaction_id=transactions["client-cashback"].id,
        ),
        "commission": Payout(
            id=demo_uuid("payout:commission-paid"),
            recipient_user_uuid=users["agent_loans"].id,
            business_line="loans",
            type=PayoutType.COMMISSION,
            amount_paise=2_500_000,
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.CHEQUE,
            provider=PayoutProvider.MANUAL,
            destination_hint="Cheque · DEMO01",
            idempotency_key="demo-commission-paid",
            maker_user_uuid=users["admin"].id,
            checker_user_uuid=users["admin_checker"].id,
            manual_reference_fingerprint="a" * 64,
            manual_issued_at=now - timedelta(days=31),
            manual_cleared_at=now - timedelta(days=30),
            ledger_transaction_id=transactions["agent-loans"].id,
        ),
        "referral": Payout(
            id=demo_uuid("payout:referral-paid"),
            recipient_user_uuid=users["client"].id,
            business_line="loans",
            type=PayoutType.REFERRAL_BONUS,
            amount_paise=150_000,
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.CHEQUE,
            provider=PayoutProvider.MANUAL,
            destination_hint="Cheque · DEMO02",
            idempotency_key="demo-referral-paid",
            maker_user_uuid=users["admin"].id,
            checker_user_uuid=users["admin_checker"].id,
            manual_reference_fingerprint="b" * 64,
            manual_issued_at=now - timedelta(days=11),
            manual_cleared_at=now - timedelta(days=10),
            ledger_transaction_id=transactions["client-referral"].id,
        ),
    }
    for row in payouts.values():
        await _add_once(db, row)
    await db.flush()

    commissions = (
        Commission(
            id=demo_uuid("commission:loans-paid"),
            agent_auth_user_uuid=users["agent_loans"].id,
            agent_profile_uuid=agents["agent_loans"].id,
            business_line="loans",
            lead_uuid=leads["closed-loans"].id,
            loan_application_uuid=loans["closed"].id,
            agreed_amount_paise=2_500_000,
            status=CommissionStatus.PAID,
            payout_uuid=payouts["commission"].id,
            payout_txn_uuid=transactions["agent-loans"].id,
            entered_by_uuid=users["admin"].id,
            notes="Synthetic paid commission.",
        ),
        Commission(
            id=demo_uuid("commission:real-estate-pending"),
            agent_auth_user_uuid=users["agent_real_estate"].id,
            agent_profile_uuid=agents["agent_real_estate"].id,
            business_line="real_estate",
            lead_uuid=leads["client-real-estate"].id,
            property_deal_uuid=deals["active"].id,
            agreed_amount_paise=7_500_000,
            status=CommissionStatus.PENDING,
            entered_by_uuid=users["admin"].id,
            notes="Synthetic negotiated commission awaiting payout.",
        ),
    )
    for row in commissions:
        await _add_once(db, row)

    cashbacks = (
        FeeCashback(
            id=demo_uuid("fee-cashback:pending"),
            loan_application_uuid=loans["active"].id,
            client_profile_uuid=clients["client:loans"].id,
            recipient_auth_user_uuid=users["client"].id,
            business_line="loans",
            processing_fee_paise=750_000,
            amount_paise=750_000,
            status=FeeCashbackStatus.PENDING,
            entered_by_uuid=users["admin"].id,
            notes="Synthetic cashback awaiting payout approval.",
        ),
        FeeCashback(
            id=demo_uuid("fee-cashback:paid"),
            loan_application_uuid=loans["closed"].id,
            client_profile_uuid=clients["client:loans"].id,
            recipient_auth_user_uuid=users["client"].id,
            business_line="loans",
            processing_fee_paise=500_000,
            amount_paise=500_000,
            status=FeeCashbackStatus.PAID,
            payout_uuid=payouts["cashback-paid"].id,
            payout_txn_uuid=transactions["client-cashback"].id,
            entered_by_uuid=users["admin"].id,
            notes="Synthetic paid cashback.",
        ),
    )
    for row in cashbacks:
        await _add_once(db, row)

    referrals = (
        Referral(
            id=demo_uuid("referral:paid"),
            referrer_auth_user_uuid=users["client"].id,
            referred_mobile=users["client_referred"].mobile,
            referred_auth_user_uuid=users["client_referred"].id,
            referred_lead_uuid=leads["referred-loans"].id,
            business_line="loans",
            conversion_status=ReferralStatus.PAID,
            converted_ref_type="loan_application",
            converted_ref_uuid=loans["closed"].id,
            converted_at=now - timedelta(days=12),
            bonus_config_uuid=configs["loans"].id,
            bonus_amount_paise=150_000,
            accrual_reason="accrued",
            reward_txn_uuid=transactions["client-referral"].id,
            reward_payout_uuid=payouts["referral"].id,
        ),
        Referral(
            id=demo_uuid("referral:pending"),
            referrer_auth_user_uuid=users["client"].id,
            referred_mobile="+919000009301",
            conversion_status=ReferralStatus.PENDING,
        ),
    )
    for row in referrals:
        await _add_once(db, row)


async def _seed_content(db: AsyncSession, users: dict[str, User], now: datetime) -> None:
    banners = (
        Banner(
            id=demo_uuid("banner:pending"),
            business_line="loans",
            placement=BannerPlacement.FINANCIAL_SERVICES,
            banner_type=BannerType.ACTION,
            title="Demo campaign awaiting review",
            subtitle="Synthetic Admin approval-queue item.",
            cta_label="Apply",
            deep_link="/loans",
            audience_rules={},
            priority=10,
            status=BannerStatus.PENDING_APPROVAL,
            created_by_uuid=users["sub_admin"].id,
        ),
    )
    for row in banners:
        await _add_once(db, row)

    offers = (
        Offer(
            id=demo_uuid("offer:loans-active"),
            business_line="loans",
            title="Demo processing-fee benefit",
            description="Synthetic offer for local UI testing only.",
            discount_type="flat",
            discount_value=Decimal("2500"),
            code="DEMOLOAN",
            audience_rules={},
            priority=50,
            status=OfferStatus.ACTIVE,
            created_by_uuid=users["sub_admin"].id,
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=30),
        ),
        Offer(
            id=demo_uuid("offer:real-estate-draft"),
            business_line="real_estate",
            title="Demo site-visit campaign",
            description="Draft offer for the Sub Admin editing state.",
            discount_type="flat",
            discount_value=Decimal("1000"),
            code="DEMOVISIT",
            audience_rules={},
            priority=10,
            status=OfferStatus.DRAFT,
            created_by_uuid=users["sub_admin"].id,
        ),
    )
    for row in offers:
        await _add_once(db, row)

    blocks = (
        ContentBlock(
            id=demo_uuid("content:published"),
            slug="demo-home-trust-copy",
            section="home",
            title="Demo published content",
            body="Synthetic published copy for local CMS verification.",
            business_line=None,
            status=ContentStatus.PUBLISHED,
            created_by_uuid=users["sub_admin"].id,
        ),
        ContentBlock(
            id=demo_uuid("content:draft"),
            slug="demo-loans-help-copy",
            section="loans",
            title="Demo draft content",
            body="Synthetic draft copy for testing edit and publish controls.",
            business_line="loans",
            status=ContentStatus.DRAFT,
            created_by_uuid=users["sub_admin"].id,
        ),
    )
    for row in blocks:
        await _add_once(db, row)


async def _seed_support_notifications_audit(
    db: AsyncSession,
    users: dict[str, User],
    staff: dict[str, StaffProfile],
    leads: dict[str, Lead],
    now: datetime,
) -> None:
    tickets = (
        SupportTicket(
            id=demo_uuid("support:open"),
            auth_user_uuid=users["client"].id,
            category=SupportCategory.GENERAL,
            subject="Demo open support request",
            body="Synthetic request for checking Admin triage and Client status.",
            status=SupportStatus.OPEN,
        ),
        SupportTicket(
            id=demo_uuid("support:progress"),
            auth_user_uuid=users["agent_real_estate"].id,
            category=SupportCategory.ACCOUNT_LOGIN,
            subject="Demo account-access request",
            body="Synthetic in-progress support record.",
            status=SupportStatus.IN_PROGRESS,
        ),
        SupportTicket(
            id=demo_uuid("support:resolved"),
            auth_user_uuid=users["client_referred"].id,
            category=SupportCategory.OTP,
            subject="Demo resolved OTP request",
            body="Synthetic resolved support record.",
            status=SupportStatus.RESOLVED,
            resolution_note="Resolved in the synthetic demo dataset.",
        ),
    )
    for row in tickets:
        await _add_once(db, row)

    notification_specs = (
        (
            "client-loan",
            "client",
            NotificationType.LOAN_STATUS_UPDATED,
            "Loan status updated",
            "Your synthetic Personal Loan reached sanctioned status.",
            "/dashboard/loan-applications",
        ),
        (
            "client-visit",
            "client",
            NotificationType.SITE_VISIT_REQUESTED,
            "Site visit confirmed",
            "Your synthetic property visit has a vehicle assignment.",
            "/dashboard/site-visits",
        ),
        (
            "agent-loans",
            "agent_loans",
            NotificationType.LEAD_ASSIGNED,
            "Lead introduced",
            "A synthetic Loans lead is active in your workspace.",
            "/dashboard/leads",
        ),
        (
            "agent-real-estate",
            "agent_real_estate",
            NotificationType.PROPERTY_DEAL_STATUS_UPDATED,
            "Deal moved to negotiation",
            "Your synthetic property lead is in negotiation.",
            "/dashboard/earnings",
        ),
        (
            "telecaller-loans",
            "telecaller_loans",
            NotificationType.LEAD_ASSIGNED,
            "Loans lead assigned",
            "A synthetic callback is due now.",
            "/dashboard/leads",
        ),
        (
            "telecaller-real-estate",
            "telecaller_real_estate",
            NotificationType.LEAD_ASSIGNED,
            "Property lead assigned",
            "A synthetic buyer follow-up is due now.",
            "/dashboard/leads",
        ),
        (
            "employee-loans",
            "employee_loans",
            NotificationType.TASK_ASSIGNED,
            "Document task assigned",
            "A synthetic document-collection task is due today.",
            "/dashboard/tasks",
        ),
        (
            "employee-real-estate",
            "employee_real_estate",
            NotificationType.TASK_ASSIGNED,
            "Property visit task assigned",
            "A synthetic visit-feedback task is due today.",
            "/dashboard/tasks",
        ),
        (
            "sub-admin",
            "sub_admin",
            NotificationType.ADMIN_BROADCAST,
            "Demo content workspace ready",
            "Synthetic CMS records are ready for review.",
            "/dashboard/banners",
        ),
        (
            "admin",
            "admin",
            NotificationType.ADMIN_ACCOUNT_ACTION,
            "Demo dataset ready",
            "Synthetic operational records are available across Admin workspaces.",
            "/dashboard/operations",
        ),
        (
            "admin-checker",
            "admin_checker",
            NotificationType.ADMIN_PAYOUT_REVIEWED,
            "Payout review example",
            "A synthetic maker/checker payout is available.",
            "/dashboard/payouts",
        ),
    )
    for key, account_key, kind, title, body, href in notification_specs:
        await _add_once(
            db,
            Notification(
                id=demo_uuid(f"notification:{key}"),
                user_uuid=users[account_key].id,
                type=kind,
                title=title,
                body=body,
                href=href,
                created_at=now - timedelta(hours=2),
            ),
        )

    audits = (
        AuditLog(
            id=demo_uuid("audit:lead-assigned"),
            actor_uuid=users["admin"].id,
            actor_role="admin",
            action=AuditAction.LEAD_ASSIGNED,
            entity_type="lead",
            entity_uuid=leads["client-loans"].id,
            business_line="loans",
            detail={"demo": True, "operation": "seeded_assignment"},
            created_at=now - timedelta(hours=3),
        ),
        AuditLog(
            id=demo_uuid("audit:feature-granted"),
            actor_uuid=users["admin"].id,
            actor_role="admin",
            action=AuditAction.STAFF_FEATURE_GRANTED,
            entity_type="staff_profile",
            entity_uuid=staff["sub_admin"].id,
            business_line=None,
            detail={"demo": True, "feature": "payout_requests"},
            created_at=now - timedelta(hours=2),
        ),
    )
    for row in audits:
        await _add_once(db, row)


async def seed_demo(*, include_media: bool = True) -> dict[str, int]:
    _require_development()
    from app.db.session import AsyncSessionLocal

    now = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        users = await _seed_accounts(db, now)
        staff, agents, clients = await _seed_profiles(db, users, now)
        await _seed_agent_applications(db, now)
        properties = await _seed_properties(db, users, now)
        await _seed_property_submissions(db, users, properties, now)
        leads = await _seed_leads(db, users, clients, staff, agents, now)
        loans = await _seed_loans(db, clients, leads, staff, now)
        deals = await _seed_real_estate_workflows(db, users, clients, properties, leads, staff, now)
        tasks = await _seed_tasks(db, leads, staff, now)
        await _seed_money_and_referrals(db, users, clients, agents, leads, loans, deals, now)
        await _seed_content(db, users, now)
        await _seed_support_notifications_audit(db, users, staff, leads, now)
        await db.commit()

    if include_media:
        await _seed_managed_media(users=users, loans=loans, tasks=tasks)

    async with AsyncSessionLocal() as db:
        return {
            "accounts": len(DEMO_ACCOUNTS),
            "leads": int(
                await db.scalar(
                    select(func.count())
                    .select_from(Lead)
                    .where(
                        Lead.id.in_(
                            [
                                demo_uuid(f"lead:{key}")
                                for key in (
                                    "client-loans",
                                    "client-real-estate",
                                    "referred-loans",
                                    "telecaller-loans",
                                    "telecaller-real-estate",
                                    "closed-loans",
                                    "closed-real-estate",
                                )
                            ]
                        )
                    )
                )
                or 0
            ),
            "tasks": int(
                await db.scalar(
                    select(func.count())
                    .select_from(Task)
                    .where(
                        Task.id.in_(
                            [
                                demo_uuid(f"task:{key}")
                                for key in (
                                    "loan-docs",
                                    "loan-background",
                                    "loan-overdue",
                                    "property-visit",
                                    "property-docs",
                                )
                            ]
                        )
                    )
                )
                or 0
            ),
            "properties": int(
                await db.scalar(
                    select(func.count())
                    .select_from(Property)
                    .where(
                        Property.id.in_(
                            [
                                demo_uuid("property:villa"),
                                demo_uuid("property:apartment"),
                                demo_uuid("property:plot"),
                            ]
                        )
                    )
                )
                or 0
            ),
        }


async def _seed_managed_media(
    *, users: dict[str, User], loans: dict[str, LoanApplication], tasks: dict[str, Task]
) -> None:
    """Create three honest local media examples through existing service paths."""
    import io

    import redis.asyncio as aioredis
    from PIL import Image, ImageDraw
    from sqlalchemy import select

    from app.cache.redis_keys import RedisCache
    from app.db.session import AsyncSessionLocal
    from app.models.loan_document import LoanDocument
    from app.models.task import TaskDocument, TaskFeedbackMedia
    from app.services import storage
    from app.services.employee import (
        create_task_document,
        presign_task_document_upload,
    )
    from app.services.loan_documents import build_object_key, create_loan_document
    from app.services.task_feedback import create_feedback_media, presign_feedback_upload

    pdf = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
        b"trailer<</Root 1 0 R>>\n%%EOF\n"
    )
    image = Image.new("RGB", (1200, 800), "#f6f0e4")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 1120, 720), outline="#b46b3e", width=12)
    draw.text((130, 360), "SYNTHETIC DEMO VISIT PHOTO", fill="#2f2a25")
    image_buffer = io.BytesIO()
    image.save(image_buffer, format="PNG")

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    cache = RedisCache(redis_client)
    try:
        async with AsyncSessionLocal() as db:
            loan_doc_exists = await db.scalar(
                select(LoanDocument.id).where(
                    LoanDocument.loan_application_uuid == loans["active"].id,
                    LoanDocument.doc_type == "salary_slip",
                )
            )
            if loan_doc_exists is None:
                application = await db.get(LoanApplication, loans["active"].id)
                if application is None:
                    raise RuntimeError("Demo loan application disappeared before media seeding.")
                object_key = build_object_key(
                    application.client_profile_uuid,
                    application.id,
                    "salary_slip",
                    "application/pdf",
                )
                await asyncio.to_thread(
                    storage.put_object_bytes, object_key, pdf, "application/pdf"
                )
                await create_loan_document(
                    db,
                    application,
                    doc_type="salary_slip",
                    object_key=object_key,
                    content_type="application/pdf",
                    uploaded_by_uuid=users["client"].id,
                )

        async with AsyncSessionLocal() as db:
            task = await db.get(Task, tasks["loan-docs"].id)
            task_doc_exists = await db.scalar(
                select(TaskDocument.id).where(
                    TaskDocument.task_uuid == tasks["loan-docs"].id,
                    TaskDocument.doc_type == "income_proof",
                )
            )
            if task is not None and task_doc_exists is None:
                object_key, _, _, _ = await presign_task_document_upload(
                    cache,
                    task,
                    owner_uuid=users["employee_loans"].id,
                    doc_type="income_proof",
                    content_type="application/pdf",
                )
                await asyncio.to_thread(
                    storage.put_object_bytes, object_key, pdf, "application/pdf"
                )
                await create_task_document(
                    db,
                    cache,
                    task,
                    owner_uuid=users["employee_loans"].id,
                    doc_type="income_proof",
                    object_key=object_key,
                )

        async with AsyncSessionLocal() as db:
            task = await db.get(Task, tasks["property-visit"].id)
            feedback_exists = await db.scalar(
                select(TaskFeedbackMedia.id).where(
                    TaskFeedbackMedia.task_uuid == tasks["property-visit"].id
                )
            )
            if task is not None and feedback_exists is None:
                object_key, _, _, _ = await presign_feedback_upload(
                    cache,
                    task,
                    owner_uuid=users["employee_real_estate"].id,
                    content_type="image/png",
                )
                await asyncio.to_thread(
                    storage.put_object_bytes,
                    object_key,
                    image_buffer.getvalue(),
                    "image/png",
                )
                await create_feedback_media(
                    db,
                    task,
                    owner_uuid=users["employee_real_estate"].id,
                    content_type="image/png",
                    object_key=object_key,
                )
    finally:
        await redis_client.aclose()


def _assert_demo_api_data(account_key: str, endpoint: str, payload: Any) -> None:
    """Reject a role API that is reachable but empty for its demo account."""
    if not isinstance(payload, dict):
        raise RuntimeError(f"Demo API check returned a non-object at {endpoint}.")

    if endpoint.endswith("/loans/applications"):
        has_data = bool(payload.get("applications"))
    elif endpoint.endswith("/site-visits"):
        has_data = bool(payload.get("visits"))
    elif account_key in {"admin", "admin_checker"}:
        has_data = bool(payload.get("pending_review")) or any(
            isinstance(value, int) and value > 0
            for key, value in payload.items()
            if key.endswith("_count")
        )
    elif account_key == "sub_admin":
        has_data = bool(payload.get("pending_approval"))
    else:
        counts = payload.get("counts_by_status")
        has_data = isinstance(counts, dict) and any(
            isinstance(value, int) and value > 0 for value in counts.values()
        )

    if not has_data:
        raise RuntimeError(
            f"Demo API check returned no representative data for {account_key} at {endpoint}."
        )


async def verify_demo_api(base_url: str) -> dict[str, str]:
    """Log in every demo identity and exercise its primary RLS-scoped API."""
    import httpx

    from app.core.security import decode_access_token

    endpoints: dict[str, tuple[str, ...]] = {
        "admin": ("/api/v1/admin/home",),
        "admin_checker": ("/api/v1/admin/home",),
        "sub_admin": ("/api/v1/sub-admin/home",),
        "client": ("/api/v1/loans/applications", "/api/v1/site-visits"),
        "client_referred": ("/api/v1/loans/applications", "/api/v1/site-visits"),
        "agent_loans": ("/api/v1/agent/home",),
        "agent_real_estate": ("/api/v1/agent/home",),
        "telecaller_loans": ("/api/v1/telecaller/home",),
        "telecaller_real_estate": ("/api/v1/telecaller/home",),
        "employee_loans": ("/api/v1/employee/home",),
        "employee_real_estate": ("/api/v1/employee/home",),
    }
    verified: dict[str, str] = {}
    async with httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=30) as client:
        for account in DEMO_ACCOUNTS:
            login = await client.post(
                "/api/v1/auth/login",
                json={"mobile": account.mobile, "password": DEMO_PASSWORD},
            )
            if login.status_code != 200:
                raise RuntimeError(
                    f"Demo login failed for {account.key}: HTTP {login.status_code}."
                )
            token = login.json()["access_token"]
            claims = decode_access_token(token)
            if claims.get("role") != account.role:
                raise RuntimeError(f"Demo role mismatch for {account.key}: {claims.get('role')!r}.")
            expected_line = account.business_line or ""
            if claims.get("business_line") != expected_line:
                raise RuntimeError(
                    f"Demo business-line mismatch for {account.key}: "
                    f"{claims.get('business_line')!r}."
                )
            headers = {"Authorization": f"Bearer {token}"}
            for endpoint in endpoints[account.key]:
                response = await client.get(endpoint, headers=headers)
                if response.status_code != 200:
                    raise RuntimeError(
                        f"Demo API check failed for {account.key} at {endpoint}: "
                        f"HTTP {response.status_code}."
                    )
                _assert_demo_api_data(account.key, endpoint, response.json())
            verified[account.key] = account.role
    return verified


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--credentials",
        action="store_true",
        help="Print the deterministic credential roster without writing data.",
    )
    parser.add_argument(
        "--skip-media",
        action="store_true",
        help="Populate database rows without local MinIO/ClamAV media examples.",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="After seeding, log in every account and call its primary role API.",
    )
    parser.add_argument(
        "--api-base-url",
        default="http://localhost:8000",
        help="API origin used by --verify (default: http://localhost:8000).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _require_development()
    if args.credentials:
        print(credentials_table())
        return

    async def run() -> tuple[dict[str, int], dict[str, str] | None]:
        result = await seed_demo(include_media=not args.skip_media)
        verified = await verify_demo_api(args.api_base_url) if args.verify else None
        return result, verified

    result, verified = asyncio.run(run())
    print(f"[seed_demo] Ready: {result}")
    if verified is not None:
        print(f"[seed_demo] Verified logins and role APIs: {verified}")
    print("[seed_demo] Login at http://localhost:3000/login")
    print(credentials_table())


if __name__ == "__main__":
    main()
