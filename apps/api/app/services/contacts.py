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

Anchored on the client's most recent LoanApplication / PropertyDeal, exactly
as the tracker decision states: a lead with no application/deal yet has no
"my officer"/"my agent" to show, and that is the real "not assigned yet"
empty state, not an error.

Returns name + staff_code / agent_code only — never phone/email. Contact is
platform-mediated through the support-ticket flow (docs/ai/plans/
create-plan-for-above-snuggly-sunbeam.md's Batch 6 decision).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select

import app.db.session as db_session
from app.models.lead import Lead
from app.models.loan import LoanApplication
from app.models.profile import AgentProfile, ClientProfile, StaffProfile
from app.models.property_deal import PropertyDeal
from app.models.user import User


@dataclass
class StaffContact:
    name: str
    staff_code: str


@dataclass
class AgentContact:
    name: str
    agent_code: str


async def get_my_loan_officer(auth_user_uuid: UUID) -> StaffContact | None:
    async with db_session.AsyncSessionLocal() as db:
        stmt = (
            select(User.first_name, User.last_name, StaffProfile.staff_code)
            .select_from(LoanApplication)
            .join(ClientProfile, ClientProfile.id == LoanApplication.client_profile_uuid)
            .join(Lead, Lead.id == LoanApplication.lead_uuid)
            .join(StaffProfile, StaffProfile.id == Lead.assigned_telecaller_profile_uuid)
            .join(User, User.id == StaffProfile.auth_user_uuid)
            .where(
                ClientProfile.auth_user_uuid == auth_user_uuid,
                ClientProfile.business_line == "loans",
            )
            .order_by(LoanApplication.opened_at.desc())
            .limit(1)
        )
        row = (await db.execute(stmt)).first()
        if row is None:
            return None
        first_name, last_name, staff_code = row
        return StaffContact(name=f"{first_name} {last_name}".strip(), staff_code=staff_code)


async def get_my_agent(auth_user_uuid: UUID) -> AgentContact | None:
    async with db_session.AsyncSessionLocal() as db:
        stmt = (
            select(User.first_name, User.last_name, AgentProfile.agent_code)
            .select_from(PropertyDeal)
            .join(ClientProfile, ClientProfile.id == PropertyDeal.client_profile_uuid)
            .join(Lead, Lead.id == PropertyDeal.lead_uuid)
            .join(AgentProfile, AgentProfile.id == Lead.origin_agent_profile_uuid)
            .join(User, User.id == AgentProfile.auth_user_uuid)
            .where(
                ClientProfile.auth_user_uuid == auth_user_uuid,
                ClientProfile.business_line == "real_estate",
            )
            .order_by(PropertyDeal.opened_at.desc())
            .limit(1)
        )
        row = (await db.execute(stmt)).first()
        if row is None:
            return None
        first_name, last_name, agent_code = row
        return AgentContact(name=f"{first_name} {last_name}".strip(), agent_code=agent_code)
