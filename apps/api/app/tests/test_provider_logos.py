from datetime import UTC, datetime

import pytest

from app.models.loan import Bank
from app.services.financial_catalog import provider_logo_metadata, provider_logo_url
from app.services.provider_logos import BUILT_IN_PROVIDER_LOGOS


@pytest.mark.parametrize("name", BUILT_IN_PROVIDER_LOGOS)
def test_known_bank_uses_reviewed_asset_without_mutating_record(name: str) -> None:
    bank = Bank(name=name.upper(), provider_type="bank")
    url, source, reviewed = provider_logo_metadata(bank)
    assert url == BUILT_IN_PROVIDER_LOGOS[name][0]
    assert source and source.startswith("https://")
    assert reviewed is not None
    assert bank.logo_key is None
    assert bank.logo_source is None
    assert bank.logo_verified_at is None


@pytest.mark.parametrize(
    ("name", "provider_type"),
    [("HDFC Housing", "bank"), ("HDFC Bank", "nbfc"), ("Unknown Bank", "bank")],
)
def test_unreviewed_identity_is_never_guessed(name: str, provider_type: str) -> None:
    assert provider_logo_metadata(Bank(name=name, provider_type=provider_type))[0] is None


def test_verified_managed_upload_wins_and_unverified_asset_stays_hidden(monkeypatch) -> None:
    key = (
        "public/provider-logos/10000000-0000-4000-8000-000000000001/"
        "20000000-0000-4000-8000-000000000001.png"
    )
    bank = Bank(name="HDFC Bank", provider_type="bank", logo_key=key)
    assert provider_logo_metadata(bank)[0] is None
    monkeypatch.setattr(
        "app.services.financial_catalog.storage.public_asset_url",
        lambda value: "https://assets.example.test/" + value,
    )
    bank.logo_verified_at = datetime.now(UTC)
    assert provider_logo_metadata(bank)[0] == "https://assets.example.test/" + key
    for unsafe in [
        "https://unknown.test/logo.svg",
        "/provider-logos/unreviewed.svg",
        "../logo.png",
    ]:
        assert provider_logo_url(unsafe) is None
