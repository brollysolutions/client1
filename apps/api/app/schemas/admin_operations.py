"""Least-data response contracts for platform-Admin operational oversight."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.models.enquiry import EnquiryStatus
from app.models.lead_activity import CallDisposition, InterestLevel
from app.models.site_visit import SiteVisitStatus, SiteVisitTimeSlot
from app.models.transaction import TransactionStatus, TransactionType
from app.schemas.field_visibility import FieldTargetRoleLiteral, FieldVisibilityModeLiteral


class AdminAuthEventRead(BaseModel):
    id: UUID
    auth_user_uuid: UUID | None
    event_type: str
    success: bool
    created_at: datetime


class AdminAuthEventListResponse(BaseModel):
    events: list[AdminAuthEventRead]
    total: int


class AdminEnquiryRead(BaseModel):
    id: UUID
    user_uuid: UUID
    property_ref: str
    title: str
    locality: str
    city: str
    status: EnquiryStatus
    created_at: datetime
    updated_at: datetime


class AdminEnquiryListResponse(BaseModel):
    enquiries: list[AdminEnquiryRead]
    total: int


class AdminFinancialServiceEnquiryRead(BaseModel):
    id: UUID
    product_label: str
    product_category: Literal["credit_card", "insurance"]
    status: Literal["submitted"]
    form_version: int
    submitted_at: datetime


class AdminFinancialServiceEnquiryListResponse(BaseModel):
    enquiries: list[AdminFinancialServiceEnquiryRead]
    total: int


class AdminFieldVisibilityConfigRead(BaseModel):
    id: UUID
    target_role: FieldTargetRoleLiteral
    entity: str
    field_key: str
    mode: FieldVisibilityModeLiteral
    updated_at: datetime


class AdminFieldVisibilityConfigListResponse(BaseModel):
    configs: list[AdminFieldVisibilityConfigRead]
    total: int


class AdminLeadActivityRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    telecaller_staff_profile_uuid: UUID
    business_line: Literal["loans", "real_estate"]
    disposition: CallDisposition
    interest_level: InterestLevel | None
    follow_up_at: datetime | None
    created_at: datetime


class AdminLeadActivityListResponse(BaseModel):
    activities: list[AdminLeadActivityRead]
    total: int


class AdminLoanTransactionHistoryRead(BaseModel):
    id: UUID
    loan_application_uuid: UUID
    business_line: Literal["loans", "real_estate"]
    bank_name: str | None
    amount: Decimal | None
    interest_rate: Decimal | None
    txn_date: date | None
    entered_by_staff_profile_uuid: UUID | None
    created_at: datetime


class AdminLoanTransactionHistoryListResponse(BaseModel):
    entries: list[AdminLoanTransactionHistoryRead]
    total: int


class AdminSiteVisitRead(BaseModel):
    id: UUID
    user_uuid: UUID
    property_ref: str
    title: str
    locality: str
    city: str
    preferred_date: date
    preferred_time_slot: SiteVisitTimeSlot
    status: SiteVisitStatus
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AdminSiteVisitListResponse(BaseModel):
    visits: list[AdminSiteVisitRead]
    total: int


class AdminTransactionRead(BaseModel):
    id: UUID
    user_uuid: UUID | None
    business_line: Literal["loans", "real_estate"]
    type: TransactionType
    status: TransactionStatus
    amount_paise: int
    currency: str
    description: str
    created_at: datetime


class AdminTransactionListResponse(BaseModel):
    transactions: list[AdminTransactionRead]
    total: int
