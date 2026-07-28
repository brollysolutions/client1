"""Admin loan-config CRUD schemas — loan types, banks, per-bank availability
(FR-6.3/FR-6.4, feature-status.md §3 #4).

Deliberately separate from `schemas/loans.py`, which stays frozen: the
client-facing `LoanTypeRead{id,label}`/`BankRead{id,name}` shapes are read by
every authenticated role and must not grow the admin-only fields below.

`custom_fields` is read-only everywhere here (Open Item A,
Admin_Dashboard_System_Design.md §5.2 — the per-loan-type custom-field builder
is out of scope, feature-status.md §4). There is no Delete request/response
shape anywhere in this module — see migration 678f7a77e812 for why.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AdminLoanTypeRead(BaseModel):
    id: UUID
    name: str
    label: str
    active: bool
    custom_fields: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    application_count: int


class AdminLoanTypeListResponse(BaseModel):
    loan_types: list[AdminLoanTypeRead]


class LoanTypeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=200)


class LoanTypeUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    active: bool | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> LoanTypeUpdate:
        if self.label is None and self.active is None:
            raise ValueError("Provide at least one field to update.")
        return self


class AdminBankRead(BaseModel):
    id: UUID
    name: str
    logo_key: str | None
    active: bool
    created_at: datetime
    updated_at: datetime
    application_count: int


class AdminBankListResponse(BaseModel):
    banks: list[AdminBankRead]


class BankCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    logo_key: str | None = Field(default=None, max_length=500)


class BankUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    logo_key: str | None = Field(default=None, max_length=500)
    active: bool | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> BankUpdate:
        if self.name is None and self.logo_key is None and self.active is None:
            raise ValueError("Provide at least one field to update.")
        return self


class BankAvailabilityEntry(BaseModel):
    bank_id: UUID
    loan_type_id: UUID
    available: bool


class BankAvailabilityMatrixResponse(BaseModel):
    """The full picture the admin console renders as a grid: every loan type
    (columns) x every bank (rows), plus the sparse set of explicit overrides.
    A (bank_id, loan_type_id) pair absent from `entries` is available — see the
    module docstring on `services/loan_config.py`."""

    banks: list[AdminBankRead]
    loan_types: list[AdminLoanTypeRead]
    entries: list[BankAvailabilityEntry]


class BankAvailabilitySetEntry(BaseModel):
    loan_type_id: UUID
    available: bool


class BankAvailabilitySet(BaseModel):
    """PUT body for one bank's availability overrides.

    This is an UPSERT, not a full-replace: `services/loan_config.py::
    set_bank_availability` writes exactly the rows submitted here and never
    deletes a row omitted from `entries` (the table's grant has no DELETE, by
    design — migration 678f7a77e812). An omitted loan_type_id keeps whatever
    it already was, not the permissive default. The admin console's checkbox
    grid always submits every current loan type on every save, so in
    practice a save behaves like a full-replace — but that is a UI
    convention, not something this endpoint enforces.
    """

    entries: Annotated[list[BankAvailabilitySetEntry], Field(max_length=500)]

    @model_validator(mode="after")
    def _no_duplicate_loan_types(self) -> BankAvailabilitySet:
        seen = {e.loan_type_id for e in self.entries}
        if len(seen) != len(self.entries):
            raise ValueError("entries must not repeat the same loan_type_id.")
        return self
