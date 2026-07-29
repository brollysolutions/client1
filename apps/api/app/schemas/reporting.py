"""Admin analytics & reporting contract (FR-16.1-16.3, feature-status.md §3 #2).

Four reports share one shape family: a paginated, sortable set of grouped rows
plus a `summary` block computed over the FULL filtered set, independent of
pagination -- the summary is what stat tiles render, the rows are what the
table renders, and they must never drift apart because one query is limited
and the other is not (see `services/reporting.py`).

`business_line` on `LeadsReportRow` can be the literal string "unassigned"
-- `leads.business_line` is nullable (models/lead.py), and an unassigned
lead must render as an explicit row, never be dropped or folded into a line
(see the migration/service docstrings for why). `LoansReportRow` and
`DealsReportRow` never carry "unassigned": `loan_applications.business_line`
and `property_deals.business_line` are NOT NULL and always "loans" /
"real_estate" respectively.

No request schema here (mirrors `api/v1/referrals.py`'s GET routes): every
report is read via query parameters declared directly on the route, not a
POST body.
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ReportBucket(enum.StrEnum):
    WEEK = "week"
    MONTH = "month"


class ReportSummary(BaseModel):
    """Aggregate over the entire filtered set, ignoring `limit`/`offset` --
    what the stat tiles render, always in sync with the table's true totals
    even when the table itself is paginated."""

    total_count: int
    converted_count: int


class LeadsReportRow(BaseModel):
    bucket_start: datetime
    business_line: str
    total: int
    converted: int


class LeadsReportResponse(BaseModel):
    rows: list[LeadsReportRow]
    total: int
    summary: ReportSummary


class LoansReportRow(BaseModel):
    bucket_start: datetime
    business_line: str
    total: int
    converted: int


class LoansReportResponse(BaseModel):
    rows: list[LoansReportRow]
    total: int
    summary: ReportSummary


class DealsReportRow(BaseModel):
    bucket_start: datetime
    business_line: str
    total: int
    converted: int


class DealsReportResponse(BaseModel):
    rows: list[DealsReportRow]
    total: int
    summary: ReportSummary


class AgentsReportRow(BaseModel):
    """One row per agent. Counts are per-agent totals across the whole date
    range (no weekly/monthly bucketing -- FR-16.3 asks for a performance
    summary per agent, not a time series per agent)."""

    agent_profile_uuid: UUID
    agent_code: str
    agent_name: str
    business_line: str
    leads_total: int
    leads_converted: int
    loans_total: int
    loans_converted: int
    deals_total: int
    deals_converted: int


class AgentsSummary(BaseModel):
    agent_count: int
    leads_total: int
    leads_converted: int
    loans_total: int
    loans_converted: int
    deals_total: int
    deals_converted: int


class AgentsReportResponse(BaseModel):
    rows: list[AgentsReportRow]
    total: int
    summary: AgentsSummary
