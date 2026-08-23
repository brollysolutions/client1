"""Regression coverage for development-only synthetic seed values."""

from __future__ import annotations

import re

import pytest

from app.core.security import validate_password_policy
from app.scripts.demo_catalog import (
    DEMO_ACCOUNT_BY_KEY,
    DEMO_ACCOUNTS,
    DEMO_PASSWORD,
    credentials_table,
    demo_uuid,
)
from app.scripts.seed_demo import _assert_demo_api_data, _require_development
from app.scripts.seed_helpers import dev_indian_mobile, dev_seed_email


def test_dev_indian_mobile_has_ten_digit_indian_local_number() -> None:
    numbers = [dev_indian_mobile() for _ in range(20)]

    assert all(re.fullmatch(r"\+91[6-9]\d{9}", number) for number in numbers)


def test_dev_seed_email_normalizes_valid_address() -> None:
    assert dev_seed_email("Admin@EXAMPLE.com") == "Admin@example.com"


def test_dev_seed_email_rejects_reserved_domain() -> None:
    with pytest.raises(ValueError, match="non-reserved"):
        dev_seed_email("admin.local@example.test")


def test_demo_credentials_are_complete_synthetic_and_policy_valid() -> None:
    expected_keys = {
        "admin",
        "admin_checker",
        "sub_admin",
        "client",
        "client_referred",
        "agent_loans",
        "agent_real_estate",
        "telecaller_loans",
        "telecaller_real_estate",
        "employee_loans",
        "employee_real_estate",
    }

    assert set(DEMO_ACCOUNT_BY_KEY) == expected_keys
    assert len({account.mobile for account in DEMO_ACCOUNTS}) == len(DEMO_ACCOUNTS)
    assert len({account.email for account in DEMO_ACCOUNTS}) == len(DEMO_ACCOUNTS)
    assert all(account.mobile.startswith("+919000001") for account in DEMO_ACCOUNTS)
    assert all(account.email.endswith(".demo@example.com") for account in DEMO_ACCOUNTS)
    for account in DEMO_ACCOUNTS:
        validate_password_policy(DEMO_PASSWORD, account.mobile)


def test_demo_ids_and_credential_output_are_deterministic() -> None:
    assert demo_uuid("user:admin") == demo_uuid("user:admin")
    assert demo_uuid("user:admin") != demo_uuid("user:sub_admin")
    output = credentials_table()
    assert output.count(DEMO_PASSWORD) == len(DEMO_ACCOUNTS)
    assert all(account.mobile in output for account in DEMO_ACCOUNTS)


def test_demo_seed_refuses_non_development_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.scripts.seed_demo.settings.ENV", "staging")

    with pytest.raises(SystemExit, match="development-only"):
        _require_development()


@pytest.mark.parametrize(
    ("account_key", "endpoint", "payload"),
    [
        ("admin", "/api/v1/admin/home", {"pending_review": [], "open_count": 0}),
        ("sub_admin", "/api/v1/sub-admin/home", {"pending_approval": []}),
        ("client", "/api/v1/loans/applications", {"applications": []}),
        ("client", "/api/v1/site-visits", {"visits": []}),
        ("agent_loans", "/api/v1/agent/home", {"counts_by_status": {}}),
        ("telecaller_loans", "/api/v1/telecaller/home", {"counts_by_status": {}}),
        ("employee_loans", "/api/v1/employee/home", {"counts_by_status": {}}),
    ],
)
def test_demo_api_verification_rejects_empty_role_data(
    account_key: str, endpoint: str, payload: dict[str, object]
) -> None:
    with pytest.raises(RuntimeError, match="no representative data"):
        _assert_demo_api_data(account_key, endpoint, payload)


def test_demo_api_verification_accepts_populated_role_data() -> None:
    examples = (
        ("admin", "/api/v1/admin/home", {"pending_banners_count": 1}),
        ("sub_admin", "/api/v1/sub-admin/home", {"pending_approval": [{"id": "demo"}]}),
        ("client", "/api/v1/loans/applications", {"applications": [{"id": "demo"}]}),
        ("client", "/api/v1/site-visits", {"visits": [{"id": "demo"}]}),
        ("agent_loans", "/api/v1/agent/home", {"counts_by_status": {"working": 1}}),
        (
            "telecaller_loans",
            "/api/v1/telecaller/home",
            {"counts_by_status": {"assigned": 1}},
        ),
        (
            "employee_loans",
            "/api/v1/employee/home",
            {"counts_by_status": {"in_progress": 1}},
        ),
    )

    for account_key, endpoint, payload in examples:
        _assert_demo_api_data(account_key, endpoint, payload)
