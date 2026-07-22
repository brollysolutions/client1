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
from app.models.profile import ClientProfile, StaffProfile, AgentApplication, AgentProfile  # noqa
from app.models.lead import Lead  # noqa
from app.models.loan import LoanType, Bank, LoanApplication  # noqa
from app.models.support_ticket import SupportTicket  # noqa
from app.models.site_visit import SiteVisit  # noqa
from app.models.enquiry import Enquiry  # noqa
from app.models.bookmark import Bookmark  # noqa
from app.models.notification import Notification  # noqa
from app.models.transaction import Transaction  # noqa
from app.models.payout import Payout  # noqa
from app.models.property import Property  # noqa
from app.models.property_submission import PropertySubmission  # noqa
