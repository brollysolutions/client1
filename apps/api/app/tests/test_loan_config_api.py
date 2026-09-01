"""Admin loan-config CRUD API — loan types, banks, per-bank availability
(FR-6.3/FR-6.4, feature-status.md §3 #4).

Every mutating test creates its OWN loan type and OWN bank via the API under
test — never a seeded row (the 7 seeded loan_types from 1a2b3c4d5e6f, the 10
seeded banks from d5e6f7a8b9c0). Deactivating/excluding a seeded row would
break test_loans_create_api.py's label assertions cross-file, and
test_loan_progress_api.py::_active_bank_id picks an active bank via an
unordered `LIMIT 1` — non-deterministically flaky if a seeded bank goes
inactive or excluded. See migration 678f7a77e812's docstring for why the
availability table is deliberately empty by default, and why this matters.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.scripts.seed_helpers import dev_indian_mobile
from conftest import full_registration

from .test_telecaller_api import (
    _seed_assigned_lead,
    _seed_telecaller,
    _telecaller_token,
)


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _client_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


async def _admin_headers(client: AsyncClient) -> dict[str, str]:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    return {"Authorization": f"Bearer {_admin_token(uid)}"}


async def _audit_row(action: str, entity_uuid: str) -> dict | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT action, entity_type, entity_uuid, actor_uuid "
                    "FROM audit_log WHERE action = :a AND entity_uuid = :e"
                ),
                {"a": action, "e": entity_uuid},
            )
        ).fetchone()
        return dict(row._mapping) if row is not None else None


def _unique_label() -> str:
    return f"Test Loan Type {uuid.uuid4().hex[:10]}"


def _unique_bank_name() -> str:
    return f"Test Config Bank {uuid.uuid4().hex[:10]}"


async def _create_loan_type(client: AsyncClient, headers: dict[str, str]) -> dict:
    res = await client.post(
        "/api/v1/admin/loan-types", json={"label": _unique_label()}, headers=headers
    )
    assert res.status_code == 201, res.text
    return res.json()


async def _create_bank(client: AsyncClient, headers: dict[str, str]) -> dict:
    res = await client.post(
        "/api/v1/admin/banks", json={"name": _unique_bank_name()}, headers=headers
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_admin_publishes_product_profile_and_explicit_provider_offer(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)

    blank_provider = await client.post(
        "/api/v1/admin/banks",
        json={"name": "   "},
        headers=headers,
    )
    assert blank_provider.status_code == 422

    incomplete = await client.patch(
        f"/api/v1/admin/loan-types/{product['id']}",
        json={"public_visible": True},
        headers=headers,
    )
    assert incomplete.status_code == 422

    published = await client.patch(
        f"/api/v1/admin/loan-types/{product['id']}",
        json={
            "public_visible": True,
            "public_summary": "A concise public summary.",
            "public_description": "A clear description for a prospective applicant.",
            "public_highlights": ["Assisted internal application"],
            "public_eligibility": ["Provider-specific review applies"],
            "public_documents": ["Income proof may be requested later"],
            "public_faq": [
                {
                    "question": "Is approval guaranteed?",
                    "answer": "No. The selected provider completes its own assessment.",
                }
            ],
            "homepage_featured": True,
            "homepage_feature_order": 3,
        },
        headers=headers,
    )
    assert published.status_code == 200, published.text
    assert published.json()["homepage_featured"] is True

    provider_name = _unique_bank_name()
    provider_response = await client.post(
        "/api/v1/admin/banks",
        json={
            "name": f"  {provider_name}  ",
            "legal_name": "Test Provider Private Limited",
            "provider_type": "nbfc",
        },
        headers=headers,
    )
    assert provider_response.status_code == 201, provider_response.text
    provider = provider_response.json()
    assert provider["name"] == provider_name
    assert provider["provider_type"] == "nbfc"
    assert provider["logo_url"] is None

    renamed = await client.patch(
        f"/api/v1/admin/banks/{provider['id']}",
        json={"name": f"  {provider_name} Updated  "},
        headers=headers,
    )
    assert renamed.status_code == 200, renamed.text
    provider = renamed.json()
    assert provider["name"] == f"{provider_name} Updated"

    future_offer = await client.post(
        "/api/v1/admin/product-provider-offers",
        json={
            "loan_type_id": product["id"],
            "bank_id": provider["id"],
            "offer_name": "Impossible future verification",
            "published": True,
            "last_verified_at": (datetime.now().astimezone() + timedelta(days=1)).isoformat(),
        },
        headers=headers,
    )
    assert future_offer.status_code == 422

    now = datetime.now().astimezone().isoformat()
    offer_response = await client.post(
        "/api/v1/admin/product-provider-offers",
        json={
            "loan_type_id": product["id"],
            "bank_id": provider["id"],
            "offer_name": "Standard assisted option",
            "summary": "Indicative terms only.",
            "published": True,
            "display_order": 1,
            "min_amount": "100000",
            "max_amount": "1000000",
            "min_interest_rate": "10.5",
            "max_interest_rate": "16.5",
            "min_tenure_months": 12,
            "max_tenure_months": 60,
            "last_verified_at": now,
        },
        headers=headers,
    )
    assert offer_response.status_code == 201, offer_response.text
    offer = offer_response.json()
    assert offer["product_label"] == product["label"]
    assert offer["provider_name"] == provider["name"]
    assert "destination_url" not in offer

    invalid_range = await client.patch(
        f"/api/v1/admin/product-provider-offers/{offer['id']}",
        json={"min_amount": "2000000"},
        headers=headers,
    )
    assert invalid_range.status_code == 422

    updated = await client.patch(
        f"/api/v1/admin/product-provider-offers/{offer['id']}",
        json={"summary": "Updated informational terms."},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["summary"] == "Updated informational terms."

    public = await client.get(f"/api/v1/public/financial-products/{product['name']}/providers")
    assert public.status_code == 200, public.text
    assert offer["id"] in {item["id"] for item in public.json()["items"]}

    audit = await _audit_row("financial_product_offer_created", offer["id"])
    assert audit is not None
    assert audit["entity_type"] == "financial_product_provider_offer"
    update_audit = await _audit_row("financial_product_offer_updated", offer["id"])
    assert update_audit is not None


@pytest.mark.asyncio
async def test_provider_logo_presign_is_raster_only_and_raw_remote_keys_are_rejected(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    svg = await client.post(
        "/api/v1/admin/provider-logos/upload-url",
        json={"filename": "logo.svg", "content_type": "image/svg+xml"},
        headers=headers,
    )
    assert svg.status_code == 422

    raster = await client.post(
        "/api/v1/admin/provider-logos/upload-url",
        json={"filename": "logo.png", "content_type": "image/png"},
        headers=headers,
    )
    assert raster.status_code == 200, raster.text
    assert raster.json()["object_key"].startswith("private/provider-logos/staging/")
    assert raster.json()["max_bytes"] == 1024 * 1024

    remote = await client.post(
        "/api/v1/admin/banks",
        json={"name": _unique_bank_name(), "logo_key": "https://example.com/logo.svg"},
        headers=headers,
    )
    assert remote.status_code == 422

    traversal = await client.post(
        "/api/v1/admin/banks",
        json={"name": _unique_bank_name(), "logo_key": "/provider-logos/../secret.svg"},
        headers=headers,
    )
    assert traversal.status_code == 422


@pytest.mark.asyncio
async def test_provider_logo_confirm_canonicalizes_and_verifies_managed_asset(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import financial_catalog

    headers = await _admin_headers(client)
    provider = await _create_bank(client, headers)
    staging_key = f"private/provider-logos/staging/{uuid.uuid4()}/logo.png"
    deleted: list[str] = []

    monkeypatch.setattr(financial_catalog.storage, "head_object", lambda _key: 512)
    monkeypatch.setattr(
        financial_catalog.storage,
        "content_matches_declared_type",
        lambda _key, _content_type: True,
    )
    monkeypatch.setattr(
        financial_catalog,
        "canonicalize_object",
        lambda *_args, **_kwargs: 512,
    )
    monkeypatch.setattr(
        financial_catalog.storage,
        "delete_object",
        lambda key: deleted.append(key),
    )

    response = await client.post(
        f"/api/v1/admin/banks/{provider['id']}/logo",
        json={
            "object_key": staging_key,
            "content_type": "image/png",
            "source_reference": "Official provider brand portal",
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["logo_key"].startswith(f"public/provider-logos/{provider['id']}/")
    assert body["logo_key"].endswith(".png")
    assert body["logo_url"] is not None
    assert body["logo_source"] == "Official provider brand portal"
    assert body["logo_verified_at"] is not None
    assert staging_key in deleted


# ---------------------------------------------------------------------------
# Loan types — authz
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loan_types_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/admin/loan-types")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_loan_types_forbidden_for_client(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        "/api/v1/admin/loan-types", headers={"Authorization": f"Bearer {_client_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_loan_types_forbidden_for_sub_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        "/api/v1/admin/loan-types", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_loan_types_forbidden_for_telecaller(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    res = await client.get(
        "/api/v1/admin/loan-types",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Loan types — create / update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_loan_type_derives_slug(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    label = _unique_label()
    res = await client.post("/api/v1/admin/loan-types", json={"label": label}, headers=headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["label"] == label
    assert body["active"] is True
    assert body["category"] == "loan"
    assert body["display_order"] == 1000
    assert body["form_version"] == 1
    assert body["form_schema"]["sections"][0]["fields"][0]["key"] == "requested_amount"
    assert body["application_count"] == 0
    assert body["enquiry_count"] == 0
    assert body["name"] == label.lower().replace(" ", "-")


@pytest.mark.asyncio
async def test_loan_type_labels_are_trimmed_and_cannot_be_blank(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    label = _unique_label()
    created = await client.post(
        "/api/v1/admin/loan-types", json={"label": f"  {label}  "}, headers=headers
    )
    assert created.status_code == 201, created.text
    assert created.json()["label"] == label

    rejected = await client.patch(
        f"/api/v1/admin/loan-types/{created.json()['id']}",
        json={"label": "   "},
        headers=headers,
    )
    assert rejected.status_code == 422


@pytest.mark.asyncio
async def test_create_loan_type_duplicate_slug_conflicts(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    label = _unique_label()
    first = await client.post("/api/v1/admin/loan-types", json={"label": label}, headers=headers)
    assert first.status_code == 201, first.text

    # Same label -> same derived slug -> collides on loan_types.name UNIQUE.
    second = await client.post("/api/v1/admin/loan-types", json={"label": label}, headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_admin_loan_types_list_includes_inactive(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    patched = await client.patch(
        f"/api/v1/admin/loan-types/{loan_type['id']}", json={"active": False}, headers=headers
    )
    assert patched.status_code == 200, patched.text

    listed = await client.get("/api/v1/admin/loan-types", headers=headers)
    assert listed.status_code == 200, listed.text
    ids = [row["id"] for row in listed.json()["loan_types"]]
    assert loan_type["id"] in ids


@pytest.mark.asyncio
async def test_deactivated_loan_type_vanishes_from_client_read(client: AsyncClient) -> None:
    """Proves the read split: the client-facing GET /api/v1/loans/loan-types
    filters active=True, unlike the admin console's GET /api/v1/admin/loan-types."""
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)

    before = await client.get("/api/v1/loans/loan-types", headers=headers)
    assert loan_type["id"] in [row["id"] for row in before.json()["loan_types"]]

    patched = await client.patch(
        f"/api/v1/admin/loan-types/{loan_type['id']}", json={"active": False}, headers=headers
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["active"] is False

    after = await client.get("/api/v1/loans/loan-types", headers=headers)
    assert loan_type["id"] not in [row["id"] for row in after.json()["loan_types"]]


@pytest.mark.asyncio
async def test_patch_loan_type_label(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    new_label = _unique_label()

    res = await client.patch(
        f"/api/v1/admin/loan-types/{loan_type['id']}", json={"label": new_label}, headers=headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["label"] == new_label
    # The slug is immutable even though the label changed.
    assert res.json()["name"] == loan_type["name"]


@pytest.mark.asyncio
async def test_patch_loan_type_unknown_id_404(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    res = await client.patch(
        f"/api/v1/admin/loan-types/{uuid.uuid4()}", json={"active": False}, headers=headers
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_patch_loan_type_empty_body_422(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    res = await client.patch(
        f"/api/v1/admin/loan-types/{loan_type['id']}", json={}, headers=headers
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_publish_form_increments_version_and_propagates_to_client(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    form_schema = product["form_schema"]
    form_schema["sections"][0]["fields"].append(
        {
            "key": "loan_purpose",
            "label": "Purpose of Loan",
            "input_type": "textarea",
            "required": False,
            "options": [],
            "condition": None,
        }
    )

    response = await client.patch(
        f"/api/v1/admin/loan-types/{product['id']}",
        json={"display_order": 77, "form_schema": form_schema},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["form_version"] == 2
    assert response.json()["display_order"] == 77

    client_read = await client.get("/api/v1/loans/loan-types", headers=headers)
    published = next(row for row in client_read.json()["loan_types"] if row["id"] == product["id"])
    assert published["form_version"] == 2
    assert published["last_updated_at"] == response.json()["updated_at"]
    # The API expands omitted optional field properties to their canonical
    # null defaults before publishing the schema.
    assert published["form_schema"] == response.json()["form_schema"]


@pytest.mark.asyncio
async def test_loan_form_cannot_remove_canonical_requested_amount(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    response = await client.patch(
        f"/api/v1/admin/loan-types/{product['id']}",
        json={
            "form_schema": {
                "sections": [
                    {
                        "key": "details",
                        "title": "Details",
                        "fields": [
                            {
                                "key": "purpose",
                                "label": "Purpose",
                                "input_type": "text",
                                "required": True,
                            }
                        ],
                    }
                ]
            }
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert "requested_amount" in response.json()["detail"]


@pytest.mark.asyncio
async def test_loan_form_cannot_make_requested_amount_conditional(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    response = await client.patch(
        f"/api/v1/admin/loan-types/{product['id']}",
        json={
            "form_schema": {
                "sections": [
                    {
                        "key": "details",
                        "title": "Details",
                        "fields": [
                            {
                                "key": "income_source",
                                "label": "Income Source",
                                "input_type": "select",
                                "required": True,
                                "options": [
                                    {"value": "salaried", "label": "Salaried"},
                                    {"value": "self_employed", "label": "Self-employed"},
                                ],
                            },
                            {
                                "key": "requested_amount",
                                "label": "Requested Loan Amount",
                                "input_type": "currency",
                                "required": True,
                                "condition": {
                                    "field_key": "income_source",
                                    "equals": "salaried",
                                },
                            },
                        ],
                    }
                ]
            }
        },
        headers=headers,
    )
    assert response.status_code == 422
    assert "unconditional" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_created_insurance_product_uses_enquiry_workflow(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    response = await client.post(
        "/api/v1/admin/loan-types",
        json={
            "label": f"Test Insurance {uuid.uuid4().hex[:8]}",
            "category": "insurance",
            "display_order": 900,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["category"] == "insurance"
    assert response.json()["form_schema"]["sections"][0]["fields"][0]["key"] == "coverage_amount"

    client_read = await client.get("/api/v1/loans/loan-types", headers=headers)
    published = next(
        row for row in client_read.json()["loan_types"] if row["id"] == response.json()["id"]
    )
    assert published["category"] == "insurance"


@pytest.mark.asyncio
async def test_delete_loan_type_not_allowed(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    res = await client.delete(f"/api/v1/admin/loan-types/{loan_type['id']}", headers=headers)
    assert res.status_code == 405


@pytest.mark.asyncio
async def test_loan_type_create_writes_audit_log(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)

    entry = await _audit_row("loan_type_created", loan_type["id"])
    assert entry is not None
    assert entry["entity_type"] == "loan_type"


@pytest.mark.asyncio
async def test_loan_type_deactivate_writes_audit_log(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    await client.patch(
        f"/api/v1/admin/loan-types/{loan_type['id']}", json={"active": False}, headers=headers
    )

    entry = await _audit_row("loan_type_updated", loan_type["id"])
    assert entry is not None


# ---------------------------------------------------------------------------
# Banks — create / update
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_banks_forbidden_for_telecaller(client: AsyncClient) -> None:
    auth_uuid, staff_uuid = await _seed_telecaller("loans")
    res = await client.get(
        "/api/v1/admin/banks",
        headers={"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_bank(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    name = _unique_bank_name()
    res = await client.post("/api/v1/admin/banks", json={"name": name}, headers=headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == name
    assert body["active"] is True
    assert body["application_count"] == 0
    assert body["offer_count"] == 0


@pytest.mark.asyncio
async def test_create_bank_duplicate_case_insensitive_conflicts(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    name = _unique_bank_name()
    first = await client.post("/api/v1/admin/banks", json={"name": name}, headers=headers)
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/admin/banks", json={"name": name.upper()}, headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_admin_banks_list_includes_inactive(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    await client.patch(f"/api/v1/admin/banks/{bank['id']}", json={"active": False}, headers=headers)

    listed = await client.get("/api/v1/admin/banks", headers=headers)
    assert bank["id"] in [row["id"] for row in listed.json()["banks"]]


@pytest.mark.asyncio
async def test_deactivated_bank_vanishes_from_client_read(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)

    before = await client.get("/api/v1/loans/banks", headers=headers)
    assert bank["id"] in [row["id"] for row in before.json()["banks"]]

    await client.patch(f"/api/v1/admin/banks/{bank['id']}", json={"active": False}, headers=headers)

    after = await client.get("/api/v1/loans/banks", headers=headers)
    assert bank["id"] not in [row["id"] for row in after.json()["banks"]]


@pytest.mark.asyncio
async def test_patch_bank_unknown_id_404(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    res = await client.patch(
        f"/api/v1/admin/banks/{uuid.uuid4()}", json={"active": False}, headers=headers
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_unused_bank_succeeds_and_is_audited(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    res = await client.delete(f"/api/v1/admin/banks/{bank['id']}", headers=headers)
    assert res.status_code == 204, res.text
    listed = await client.get("/api/v1/admin/banks", headers=headers)
    assert bank["id"] not in {row["id"] for row in listed.json()["banks"]}
    audit = await _audit_row("bank_deleted", bank["id"])
    assert audit is not None
    assert audit["entity_type"] == "bank"


@pytest.mark.asyncio
async def test_delete_bank_with_provider_offer_is_blocked(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    bank = await _create_bank(client, headers)
    offer = await client.post(
        "/api/v1/admin/product-provider-offers",
        json={
            "loan_type_id": product["id"],
            "bank_id": bank["id"],
            "offer_name": "Configured offer",
        },
        headers=headers,
    )
    assert offer.status_code == 201, offer.text

    res = await client.delete(f"/api/v1/admin/banks/{bank['id']}", headers=headers)
    assert res.status_code == 409
    assert "Disable it instead" in res.json()["detail"]


@pytest.mark.asyncio
async def test_delete_bank_used_by_loan_application_is_blocked(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    auth_uuid, staff_uuid, application_id, _ = await _seed_progressing_application()
    telecaller_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}
    progressed = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=telecaller_headers,
    )
    assert progressed.status_code == 200, progressed.text
    assigned = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=telecaller_headers,
    )
    assert assigned.status_code == 200, assigned.text

    res = await client.delete(f"/api/v1/admin/banks/{bank['id']}", headers=headers)
    assert res.status_code == 409
    assert "Disable it instead" in res.json()["detail"]


@pytest.mark.asyncio
async def test_delete_unknown_bank_is_404(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    res = await client.delete(f"/api/v1/admin/banks/{uuid.uuid4()}", headers=headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_bank_create_writes_audit_log(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)

    entry = await _audit_row("bank_created", bank["id"])
    assert entry is not None
    assert entry["entity_type"] == "bank"


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_availability_matrix_forbidden_for_client(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        "/api/v1/admin/bank-availability",
        headers={"Authorization": f"Bearer {_client_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_set_and_read_bank_availability(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    loan_type = await _create_loan_type(client, headers)
    before_banks = await client.get("/api/v1/loans/banks", headers=headers)
    before_bank = next(row for row in before_banks.json()["banks"] if row["id"] == bank["id"])
    before_products = await client.get("/api/v1/loans/loan-types", headers=headers)
    before_product = next(
        row for row in before_products.json()["loan_types"] if row["id"] == loan_type["id"]
    )

    res = await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type["id"], "available": False}]},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    entries = res.json()["entries"]
    assert {"bank_id": bank["id"], "loan_type_id": loan_type["id"], "available": False} in entries

    matrix = await client.get("/api/v1/admin/bank-availability", headers=headers)
    assert matrix.status_code == 200, matrix.text
    assert {
        "bank_id": bank["id"],
        "loan_type_id": loan_type["id"],
        "available": False,
    } in matrix.json()["entries"]

    after_banks = await client.get("/api/v1/loans/banks", headers=headers)
    after_bank = next(row for row in after_banks.json()["banks"] if row["id"] == bank["id"])
    after_products = await client.get("/api/v1/loans/loan-types", headers=headers)
    after_product = next(
        row for row in after_products.json()["loan_types"] if row["id"] == loan_type["id"]
    )
    assert datetime.fromisoformat(after_bank["last_updated_at"]) > datetime.fromisoformat(
        before_bank["last_updated_at"]
    )
    assert datetime.fromisoformat(after_product["last_updated_at"]) > datetime.fromisoformat(
        before_product["last_updated_at"]
    )


@pytest.mark.asyncio
async def test_availability_duplicate_loan_type_id_rejected(client: AsyncClient) -> None:
    """A repeated loan_type_id would hit Postgres's 'ON CONFLICT DO UPDATE
    command cannot affect row a second time' as an unhandled 500 without this
    guard -- caught by security review."""
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    loan_type = await _create_loan_type(client, headers)
    res = await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={
            "entries": [
                {"loan_type_id": loan_type["id"], "available": True},
                {"loan_type_id": loan_type["id"], "available": False},
            ]
        },
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_availability_unknown_bank_404(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    loan_type = await _create_loan_type(client, headers)
    res = await client.put(
        f"/api/v1/admin/banks/{uuid.uuid4()}/availability",
        json={"entries": [{"loan_type_id": loan_type["id"], "available": False}]},
        headers=headers,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_bank_availability_writes_audit_log(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    loan_type = await _create_loan_type(client, headers)

    await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type["id"], "available": False}]},
        headers=headers,
    )
    entry = await _audit_row("bank_availability_updated", bank["id"])
    assert entry is not None
    assert entry["entity_type"] == "bank_loan_type_availability"


@pytest.mark.asyncio
async def test_get_banks_filtered_by_loan_type_excludes(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    loan_type = await _create_loan_type(client, headers)

    unfiltered = await client.get("/api/v1/loans/banks", headers=headers)
    assert bank["id"] in [b["id"] for b in unfiltered.json()["banks"]]

    filtered_before_exclusion = await client.get(
        f"/api/v1/loans/banks?loan_type_id={loan_type['id']}", headers=headers
    )
    assert bank["id"] in [b["id"] for b in filtered_before_exclusion.json()["banks"]]

    await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type["id"], "available": False}]},
        headers=headers,
    )

    filtered_after_exclusion = await client.get(
        f"/api/v1/loans/banks?loan_type_id={loan_type['id']}", headers=headers
    )
    assert bank["id"] not in [b["id"] for b in filtered_after_exclusion.json()["banks"]]

    # Unparameterized call is untouched by the exclusion.
    still_unfiltered = await client.get("/api/v1/loans/banks", headers=headers)
    assert bank["id"] in [b["id"] for b in still_unfiltered.json()["banks"]]


@pytest.mark.asyncio
async def test_get_banks_unknown_loan_type_id_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {_client_token(await _auth_user_uuid(mobile))}"}
    res = await client.get(f"/api/v1/loans/banks?loan_type_id={uuid.uuid4()}", headers=headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_bank_with_no_availability_row_is_permissively_available(
    client: AsyncClient,
) -> None:
    """A brand-new bank/loan-type pair with no explicit override is available —
    the permissive-default guard against the migration ever flipping direction."""
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    loan_type = await _create_loan_type(client, headers)

    res = await client.get(f"/api/v1/loans/banks?loan_type_id={loan_type['id']}", headers=headers)
    assert bank["id"] in [b["id"] for b in res.json()["banks"]]


# ---------------------------------------------------------------------------
# Enforcement — server rejects an excluded bank on a progressing application
# ---------------------------------------------------------------------------


async def _seed_progressing_application(business_line: str = "loans") -> tuple[str, str, str, str]:
    """Returns (auth_uuid, staff_uuid, lead_id, application_id) advanced to
    submitted_to_bank (the terms gate) with its OWN loan_type — never a seeded
    one, so excluding it can't affect any other test."""
    import app.db.session as _session_mod
    from app.models.lead import Lead
    from app.models.loan import LoanApplication, LoanType

    auth_uuid, staff_uuid = await _seed_telecaller(business_line)
    lead_id = await _seed_assigned_lead(business_line, staff_uuid)

    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        from app.models.profile import ClientProfile, ProfileStatus
        from app.models.user import User

        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=dev_indian_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label=_unique_label())
        db.add_all([client_profile, loan_type])
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=500000,
        )
        db.add(application)
        await db.commit()
        application_id = str(application.id)
        loan_type_id = str(loan_type.id)

    return auth_uuid, staff_uuid, application_id, loan_type_id


@pytest.mark.asyncio
async def test_telecaller_patch_rejects_excluded_bank(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    auth_uuid, staff_uuid, application_id, loan_type_id = await _seed_progressing_application()

    await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type_id, "available": False}]},
        headers=headers,
    )

    tc_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}
    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=tc_headers,
    )
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=tc_headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_admin_patch_rejects_excluded_bank(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    auth_uuid, staff_uuid, application_id, loan_type_id = await _seed_progressing_application()

    await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type_id, "available": False}]},
        headers=headers,
    )

    tc_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}
    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=tc_headers,
    )
    res = await client.patch(
        f"/api/v1/admin/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reenabled_bank_can_be_assigned(client: AsyncClient) -> None:
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    auth_uuid, staff_uuid, application_id, loan_type_id = await _seed_progressing_application()

    await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type_id, "available": False}]},
        headers=headers,
    )
    tc_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}
    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=tc_headers,
    )
    blocked = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=tc_headers,
    )
    assert blocked.status_code == 422

    # Re-enable via ON CONFLICT DO UPDATE.
    reenable = await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type_id, "available": True}]},
        headers=headers,
    )
    assert reenable.status_code == 200, reenable.text

    allowed = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=tc_headers,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["bank_id"] == bank["id"]


@pytest.mark.asyncio
async def test_resending_unchanged_bank_id_after_exclusion_does_not_block_progress(
    client: AsyncClient,
) -> None:
    """Regression: the shared LoanProgressForm always resends the application's
    CURRENT bank_id on every submit, not just when the bank field itself
    changes (interest_rate/status/fee_outcome edits carry it too). If a bank
    assigned before this slice existed is later excluded for the loan type,
    every future edit through that form must still succeed -- only an actual
    bank CHANGE should be re-validated against availability."""
    headers = await _admin_headers(client)
    bank = await _create_bank(client, headers)
    auth_uuid, staff_uuid, application_id, loan_type_id = await _seed_progressing_application()
    tc_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}

    await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status": "submitted_to_bank"},
        headers=tc_headers,
    )
    assigned = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"]},
        headers=tc_headers,
    )
    assert assigned.status_code == 200, assigned.text

    # Exclude the bank for this loan type AFTER it's already assigned.
    excluded = await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        json={"entries": [{"loan_type_id": loan_type_id, "available": False}]},
        headers=headers,
    )
    assert excluded.status_code == 200, excluded.text

    # Resending the SAME bank_id alongside an unrelated field must still
    # succeed -- this is exactly what the real form does on every submit.
    res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"bank_id": bank["id"], "interest_rate": "9.25"},
        headers=tc_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["bank_id"] == bank["id"]
    # NUMERIC(6,3) round-trips DB-normalized, not verbatim -- see
    # api/v1/loans.py's comment on the same behavior for amount fields.
    assert res.json()["interest_rate"] == "9.250"


@pytest.mark.asyncio
async def test_loan_type_id_present_on_admin_and_telecaller_reads(client: AsyncClient) -> None:
    auth_uuid, staff_uuid, application_id, loan_type_id = await _seed_progressing_application()

    tc_headers = {"Authorization": f"Bearer {_telecaller_token(auth_uuid, staff_uuid)}"}
    tc_res = await client.patch(
        f"/api/v1/telecaller/loan-applications/{application_id}",
        json={"status_reason": None, "status": "submitted_to_bank"},
        headers=tc_headers,
    )
    assert tc_res.status_code == 200, tc_res.text
    assert tc_res.json()["loan_type_id"] == loan_type_id

    admin_headers = await _admin_headers(client)
    admin_res = await client.get("/api/v1/admin/loans", headers=admin_headers)
    assert admin_res.status_code == 200, admin_res.text
    matching = [row for row in admin_res.json()["applications"] if row["id"] == application_id]
    assert matching and matching[0]["loan_type_id"] == loan_type_id
