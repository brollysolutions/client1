"""Redirect and email-rendering safety checks for FR-11.2."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.navigation import is_safe_internal_path, notification_path_or_none
from app.schemas.notifications import BroadcastRequest
from app.services.email import notification_email_body


@pytest.mark.parametrize(
    "href",
    ["/dashboard/notifications", "/dashboard/leads?id=123#open", "/login"],
)
def test_safe_internal_notification_paths_are_allowed(href: str) -> None:
    assert is_safe_internal_path(href)
    assert notification_path_or_none(href) == href


@pytest.mark.parametrize(
    "href",
    [
        "https://attacker.example",
        "//attacker.example",
        "/\\attacker.example",
        "/%2f%2fattacker.example",
        "/%5cattacker.example",
        "javascript:alert(1)",
    ],
)
def test_external_or_ambiguous_notification_paths_are_rejected(href: str) -> None:
    assert not is_safe_internal_path(href)
    assert notification_path_or_none(href) is None
    with pytest.raises(ValidationError):
        BroadcastRequest(audience="clients", title="Title", body="Body", href=href)


def test_notification_email_uses_safe_action_url_and_fallback() -> None:
    assert notification_email_body("An update is ready.", "/dashboard/support").endswith(
        "http://localhost:3001/dashboard/support"
    )
    assert notification_email_body("An update is ready.", "//attacker.example").endswith(
        "http://localhost:3001/dashboard/notifications"
    )
