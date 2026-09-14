"""Client-facing "who is helping me" contact lookups (feature-status §2-7).

Both queries answer the same shape of question — "who is the staff/agent tied
to my most recent line-scoped record" — but deliberately do NOT use the
caller's RLS session. `_build_access_claims` (services/auth_service.py) stamps
exactly one `client_profile_uuid` onto the JWT (the LOANS profile, chosen
first alphabetically, when a client holds both — see memory
client-profile-uuid-single-claim-gotcha). A real-estate lookup keyed off that
claim would silently see nothing for a dual-line client. Instead this module
opens its own session and filters explicitly by `auth_user_uuid ==
current_user.id` (never caller-supplied), joined to the ClientProfile row for
the specific line being asked about — the identity check the RLS claim can't
express for the non-loans line.

The newest owned live lead supplies contacts as soon as registration claims it.
Application/deal history is a fallback when there is no live lead.

Returns name + staff_code / agent_code only — never phone/email. Contact is
platform-mediated through the support-ticket flow (docs/ai/plans/
create-plan-for-above-snuggly-sunbeam.md's Batch 6 decision).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select

import app.db.session as db_session
from app.models.lead import Lead, LeadStatus
from app.models.loan import LoanApplication
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus, StaffProfile, StaffRole
from app.models.property_deal import PropertyDeal
from app.models.user import User, UserStatus
from app.schemas.lead_details import JourneyContactRead, JourneyContactsRead


async def get_journey_contacts(
    auth_user_uuid: UUID, business_line: Literal["loans", "real_estate"]
) -> JourneyContactsRead:
    """Resolve the server identity's same-line team, including before application.

    As with the existing contact lookups, explicit identity and line predicates
    protect the independently scoped session used for dual-line Clients.
    No contact numbers, email addresses or profile UUIDs leave this service.
    """
    result = JourneyContactsRead(business_line=business_line)
    async with db_session.AsyncSessionLocal() as db:
        ownership = (
            ClientProfile.auth_user_uuid == auth_user_uuid,
            ClientProfile.business_line == business_line,
            ClientProfile.status == ProfileStatus.ACTIVE,
            Lead.business_line == business_line,
        )
        lead = await db.scalar(
            select(Lead)
            .join(ClientProfile, ClientProfile.id == Lead.client_profile_uuid)
            .where(*ownership, Lead.status != LeadStatus.CLOSED)
            .order_by(Lead.updated_at.desc(), Lead.id)
            .limit(1)
        )
        if lead is None:
            record = LoanApplication if business_line == "loans" else PropertyDeal
            lead = await db.scalar(
                select(Lead)
                .join(record, record.lead_uuid == Lead.id)
                .join(ClientProfile, ClientProfile.id == record.client_profile_uuid)
                .where(*ownership, record.business_line == business_line)
                .order_by(record.opened_at.desc(), record.id)
                .limit(1)
            )
        if lead is None:
            return result
        if lead.assigned_telecaller_profile_uuid is not None:
            row = (
                await db.execute(
                    select(User.first_name, User.last_name, StaffProfile.staff_code)
                    .join(StaffProfile, StaffProfile.auth_user_uuid == User.id)
                    .where(
                        StaffProfile.id == lead.assigned_telecaller_profile_uuid,
                        StaffProfile.role == StaffRole.TELECALLER,
                        StaffProfile.status == ProfileStatus.ACTIVE,
                        StaffProfile.business_line.in_((business_line, "both")),
                        User.status == UserStatus.ACTIVE,
                    )
                )
            ).first()
            if row:
                result.assigned_staff = JourneyContactRead(
                    name=f"{row[0]} {row[1]}".strip(), code=row[2], role="telecaller"
                )
        attributed = lead.agent_expired_at is None and (
            lead.expires_at is None
            or lead.expires_at > datetime.now(UTC)
            or lead.status in (LeadStatus.CONVERTED, LeadStatus.CLOSED)
        )
        if lead.origin_agent_profile_uuid is not None and attributed:
            row = (
                await db.execute(
                    select(User.first_name, User.last_name, AgentProfile.agent_code)
                    .join(AgentProfile, AgentProfile.auth_user_uuid == User.id)
                    .where(
                        AgentProfile.id == lead.origin_agent_profile_uuid,
                        AgentProfile.business_line == business_line,
                        AgentProfile.status == ProfileStatus.ACTIVE,
                        User.status == UserStatus.ACTIVE,
                    )
                )
            ).first()
            if row:
                result.introducing_agent = JourneyContactRead(
                    name=f"{row[0]} {row[1]}".strip(), code=row[2], role="agent"
                )
    return result


@dataclass
class StaffContact:
    name: str
    staff_code: str


@dataclass
class AgentContact:
    name: str
    agent_code: str


async def get_my_loan_officer(auth_user_uuid: UUID) -> StaffContact | None:
    contacts = await get_journey_contacts(auth_user_uuid, "loans")
    staff = contacts.assigned_staff
    return StaffContact(name=staff.name, staff_code=staff.code) if staff else None


async def get_my_agent(auth_user_uuid: UUID) -> AgentContact | None:
    contacts = await get_journey_contacts(auth_user_uuid, "real_estate")
    agent = contacts.introducing_agent
    return AgentContact(name=agent.name, agent_code=agent.code) if agent else None
