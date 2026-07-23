"""Employee field-task schemas (list/detail, status+outcome update, home summary)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

TaskTypeLiteral = Literal["document_collection", "property_visit", "background_check"]
# 'unassigned' intentionally excluded: tasks_rls never surfaces an unassigned
# task to an employee (assigned_employee_profile_uuid is NULL until Admin
# assigns it).
TaskStatusLiteral = Literal["assigned", "in_progress", "completed", "cancelled", "blocked"]
BgCheckOutcomeLiteral = Literal["clear", "flagged", "inconclusive"]

# Fixed vocabulary enforced at the API layer; the DB column stays free TEXT
# per the ERD. Matches the labels already used in the public apply-form KYC tiles.
DocTypeLiteral = Literal[
    "aadhaar_front",
    "aadhaar_back",
    "pan",
    "salary_slip",
    "bank_statement",
    "sale_deed",
    "photo",
    "other",
]
DocContentTypeLiteral = Literal["image/jpeg", "image/png", "application/pdf"]


class EmployeeTaskRead(BaseModel):
    id: UUID
    lead_uuid: UUID
    lead_name: str | None
    lead_mobile: str
    business_line: Literal["loans", "real_estate"]
    task_type: TaskTypeLiteral
    status: TaskStatusLiteral
    outcome: BgCheckOutcomeLiteral | None
    notes: str | None
    due_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EmployeeTaskUpdate(BaseModel):
    status: TaskStatusLiteral | None = None
    notes: Annotated[str | None, Field(default=None, max_length=1000)] = None
    outcome: BgCheckOutcomeLiteral | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> EmployeeTaskUpdate:
        if self.status is None and self.notes is None and self.outcome is None:
            raise ValueError("Provide at least one of status, notes, or outcome.")
        return self


class EmployeeHomeResponse(BaseModel):
    tasks_today: list[EmployeeTaskRead]
    overdue_count: int
    counts_by_type: dict[str, int]
    counts_by_status: dict[str, int]


class TaskDocumentPresignRequest(BaseModel):
    doc_type: DocTypeLiteral
    content_type: DocContentTypeLiteral


class TaskDocumentPresignResponse(BaseModel):
    object_key: str
    upload_url: str


class TaskDocumentCreate(BaseModel):
    doc_type: DocTypeLiteral
    object_key: str


class TaskDocumentRead(BaseModel):
    id: UUID
    doc_type: str
    verified: bool
    uploaded_at: datetime
    download_url: str
