"""Unified Admin document-verification schemas (FR-7.4).

`VerifiableDocumentRead` is deliberately NOT a subclass of `TaskDocumentRead`
or `LoanDocumentRead` — a future sensitive column added to either
employee-facing or client-facing read schema can never silently surface
here, and vice versa. Same reasoning `schemas/support_tickets.py`'s
`SupportTicketAdminRead` docstring records.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

DocumentSourceLiteral = Literal["task", "loan_application"]


class DocumentSubjectRead(BaseModel):
    source: DocumentSourceLiteral
    subject_uuid: UUID
    lead_uuid: UUID
    lead_name: str | None
    lead_mobile_masked: str
    business_line: str
    subject_label: str
    total_count: int
    verified_count: int
    latest_upload_at: datetime


class DocumentSubjectListResponse(BaseModel):
    subjects: list[DocumentSubjectRead]
    total: int


class VerifiableDocumentRead(BaseModel):
    source: DocumentSourceLiteral
    document_id: UUID
    subject_uuid: UUID
    doc_type: str
    verified: bool
    review_note: str | None
    verified_at: datetime | None
    verified_by_name: str | None
    uploaded_at: datetime
    download_url: str


class VerifiableDocumentListResponse(BaseModel):
    documents: list[VerifiableDocumentRead]


class DocumentVerifyRequest(BaseModel):
    verified: bool
    review_note: Annotated[str | None, Field(default=None, max_length=1000)] = None
