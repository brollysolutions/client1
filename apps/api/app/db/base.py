from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


from app.models.user import User  # noqa
from app.models.auth import RefreshToken, AuthEvent  # noqa
from app.models.profile import (  # noqa
    AgentApplication,
    AgentProfile,
    ClientProfile,
    StaffFeatureGrant,
    StaffProfile,
)
from app.models.lead import Lead  # noqa
from app.models.lead_activity import LeadActivity  # noqa
from app.models.loan import (  # noqa
    Bank,
    FinancialServiceEnquiry,
    LoanApplication,
    LoanTxnHistory,
    LoanType,
)
from app.models.task import EmployeeAssignmentCursor, Task, TaskDocument, TaskFeedbackMedia  # noqa
from app.models.loan_document import LoanDocument  # noqa
from app.models.support_ticket import SupportTicket  # noqa
from app.models.site_visit import SiteVisit  # noqa
from app.models.vehicle_arrangement import VehicleArrangement  # noqa
from app.models.enquiry import Enquiry  # noqa
from app.models.bookmark import Bookmark  # noqa
from app.models.notification import Notification  # noqa
from app.models.transaction import Transaction  # noqa
from app.models.payout import Payout  # noqa
from app.models.property import Property  # noqa
from app.models.property_submission import PropertySubmission  # noqa
from app.models.property_media import PropertyMedia, PropertySubmissionMedia  # noqa
from app.models.property_deal import PropertyDeal  # noqa
from app.models.push_subscription import PushSubscription  # noqa

# Banner, Offer, ContentBlock, ReferralBonusConfig predate this import (each
# landed in its own earlier PR, hand-migrated, never registered here), so
# Base.metadata was silently missing four real tables — an `alembic revision
# --autogenerate` against main would have proposed dropping them. Fixed here
# as a drive-by while adding the referral models below, which depend on
# ReferralBonusConfig (FK) needing to already be on Base.metadata.
from app.models.banner import Banner, BannerTemplate  # noqa
from app.models.campaign_media import CampaignMediaAsset  # noqa
from app.models.offer import Offer  # noqa
from app.models.content_block import ContentBlock  # noqa
from app.models.referral_bonus_config import ReferralBonusConfig  # noqa
from app.models.referral import ReferralCode, Referral  # noqa
from app.models.audit_log import AuditLog  # noqa
from app.models.commission import Commission  # noqa
from app.models.field_visibility import ContactShareLink, FieldVisibilityConfig  # noqa
from app.models.staff_invite import StaffInviteLink  # noqa
from app.models.agent_invite import AgentInviteLink  # noqa
from app.models.mobile_change import MobileChangeRequest  # noqa
from app.models.personalization import PersonalizationPreference  # noqa
