"""Client KYC-upload schemas against a loan application (docs/specs/client-kyc-upload.md).

Same fixed doc-type vocabulary as `schemas/employee.DocTypeLiteral` (the DB
column stays free TEXT, per the ERD convention). Content types match
`schemas/agent_applications.AgentDocContentTypeLiteral` and
`schemas/employee.DocContentTypeLiteral` — all three are the same set.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

LoanDocTypeLiteral = Literal[
    "aadhaar_front",
    "aadhaar_back",
    "pan",
    "salary_slip",
    "bank_statement",
    "sale_deed",
    "photo",
    "other",
]
LoanDocContentTypeLiteral = Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]


class LoanDocumentPresignRequest(BaseModel):
    doc_type: LoanDocTypeLiteral
    content_type: LoanDocContentTypeLiteral


class LoanDocumentPresignResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class LoanDocumentCreate(BaseModel):
    doc_type: LoanDocTypeLiteral
    object_key: Annotated[str, Field(max_length=300)]
    content_type: LoanDocContentTypeLiteral


class LoanDocumentRead(BaseModel):
    id: UUID
    loan_application_uuid: UUID
    doc_type: str
    verified: bool
    review_note: str | None
    uploaded_at: datetime
    download_url: str


class LoanDocumentListResponse(BaseModel):
    documents: list[LoanDocumentRead]
