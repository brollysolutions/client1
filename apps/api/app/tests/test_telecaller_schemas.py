"""Focused validation contracts for Telecaller lead-detail mutations."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.loans import LoanApplicationProgressUpdate
from app.schemas.property_deals import PropertyDealProgressUpdate
from app.schemas.telecaller import LoanTxnCreate, TaskCreate


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"bank_name": "HDFC"},
        {"bank_name": "HDFC", "amount": "500000"},
        {"bank_name": "HDFC", "amount": "500000", "interest_rate": "8.5"},
        {
            "bank_name": "   ",
            "amount": "500000",
            "interest_rate": "8.5",
            "txn_date": "2026-08-27",
        },
    ],
)
def test_loan_transaction_requires_every_meaningful_field(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        LoanTxnCreate.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("amount", "0"),
        ("amount", "-1"),
        ("amount", "1.001"),
        ("interest_rate", "-0.001"),
        ("interest_rate", "100.001"),
        ("interest_rate", "8.1234"),
    ],
)
def test_loan_transaction_rejects_values_outside_storage_contract(field: str, value: str) -> None:
    payload: dict[str, object] = {
        "bank_name": "HDFC",
        "amount": "500000",
        "interest_rate": "8.5",
        "txn_date": "2026-08-27",
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        LoanTxnCreate.model_validate(payload)


def test_loan_transaction_normalizes_valid_input() -> None:
    parsed = LoanTxnCreate.model_validate(
        {
            "bank_name": "  HDFC Bank  ",
            "amount": "500000.25",
            "interest_rate": "8.125",
            "txn_date": "2026-08-27",
        }
    )

    assert parsed.bank_name == "HDFC Bank"
    assert parsed.amount == Decimal("500000.25")
    assert parsed.interest_rate == Decimal("8.125")
    assert parsed.txn_date == date(2026, 8, 27)


def test_field_task_requires_trimmed_instructions() -> None:
    for payload in ({}, {"notes": None}, {"notes": "   "}):
        with pytest.raises(ValidationError):
            TaskCreate.model_validate(payload)

    parsed = TaskCreate.model_validate({"notes": "  Collect salary slips  "})
    assert parsed.notes == "Collect salary slips"
    assert parsed.due_at is None


def test_field_task_due_time_must_be_in_the_future() -> None:
    with pytest.raises(ValidationError):
        TaskCreate.model_validate(
            {"notes": "Collect salary slips", "due_at": datetime.now(UTC) - timedelta(minutes=1)}
        )

    future = datetime.now(UTC) + timedelta(hours=1)
    assert (
        TaskCreate.model_validate({"notes": "Collect salary slips", "due_at": future}).due_at
        == future
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"amount_sanctioned": "1000000000000"},
        {"amount_sanctioned": "1.001"},
        {"interest_rate": "8.1234"},
        {"processing_fee": "1000000000000"},
        {"processing_fee": "1.001"},
    ],
)
def test_loan_progress_rejects_values_outside_storage_contract(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        LoanApplicationProgressUpdate.model_validate(payload)


@pytest.mark.parametrize(
    "payload",
    [
        {"price_quoted": "1.001"},
        {"booking_amount": "1.001"},
        {"price_quoted": "1000000000000"},
    ],
)
def test_property_deal_terms_reject_values_outside_storage_contract(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        PropertyDealProgressUpdate.model_validate(payload)
