"""Versioned Financial Product forms and non-loan enquiry routing."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import PASSWORD, full_registration, loan_application_payload

from .test_telecaller_api import _seed_telecaller, _telecaller_token


async def _products(client: AsyncClient, token: str) -> list[dict]:
    response = await client.get(
        "/api/v1/loans/loan-types", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, response.text
    return response.json()["loan_types"]


def _credit_card_answers() -> dict[str, object]:
    return {
        "date_of_birth": "1990-01-01",
        "income_source": "salaried",
        "net_monthly_income": "85000",
        "occupation_or_business": "Acme Private Limited",
        "current_location": "Bengaluru",
        "current_pincode": "560001",
        "preferred_benefits": ["cashback", "travel"],
    }


@pytest.mark.asyncio
async def test_catalogue_is_ordered_and_contains_distinct_workflows(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    products = await _products(client, token)

    assert len(products) == 16
    assert [product["display_order"] for product in products] == list(range(1, 17))
    assert {product["category"] for product in products} == {
        "loan",
        "credit_card",
        "insurance",
    }
    assert all(product["form_schema"]["sections"] for product in products)


@pytest.mark.asyncio
async def test_loan_submission_rejects_missing_extra_and_stale_answers(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    payload = await loan_application_payload(client, token)

    missing = {
        **payload,
        "answers": {
            key: value for key, value in payload["answers"].items() if key != "current_location"
        },
    }
    response = await client.post("/api/v1/loans/applications", headers=headers, json=missing)
    assert response.status_code == 422
    assert response.json()["detail"] == "Current Location is required."

    extra = {
        **payload,
        "answers": {**payload["answers"], "full_name": "Untrusted Client Value"},
    }
    response = await client.post("/api/v1/loans/applications", headers=headers, json=extra)
    assert response.status_code == 422
    assert "no longer available" in response.json()["detail"]

    stale = {**payload, "form_version": int(payload["form_version"]) + 1}
    response = await client.post("/api/v1/loans/applications", headers=headers, json=stale)
    assert response.status_code == 409
    assert "updated" in response.json()["detail"]


@pytest.mark.asyncio
async def test_credit_card_uses_enquiry_workflow_and_private_cache_headers(
    client: AsyncClient,
) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    product = next(
        item for item in await _products(client, token) if item["name"] == "credit-cards"
    )

    response = await client.post(
        "/api/v1/loans/enquiries",
        headers=headers,
        json={
            "product_id": product["id"],
            "form_version": product["form_version"],
            "answers": _credit_card_answers(),
        },
    )
    assert response.status_code == 201, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["product"]["category"] == "credit_card"
    assert response.json()["status"] == "submitted"

    listed = await client.get("/api/v1/loans/enquiries", headers=headers)
    assert listed.status_code == 200
    assert listed.headers["cache-control"] == "private, no-store"
    assert [item["id"] for item in listed.json()["enquiries"]] == [response.json()["id"]]


@pytest.mark.asyncio
async def test_product_category_cannot_cross_workflows(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    products = await _products(client, token)
    card = next(item for item in products if item["name"] == "credit-cards")
    loan_payload = await loan_application_payload(client, token)

    response = await client.post(
        "/api/v1/loans/applications",
        headers=headers,
        json={
            "loan_type_id": card["id"],
            "form_version": card["form_version"],
            "answers": _credit_card_answers(),
        },
    )
    assert response.status_code == 422

    response = await client.post(
        "/api/v1/loans/enquiries",
        headers=headers,
        json={
            "product_id": loan_payload["loan_type_id"],
            "form_version": loan_payload["form_version"],
            "answers": loan_payload["answers"],
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_enquiry_list_is_isolated_between_clients(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["loans"])
    other_token, _ = await full_registration(client, lines=["loans"])
    product = next(
        item for item in await _products(client, owner_token) if item["name"] == "credit-cards"
    )
    created = await client.post(
        "/api/v1/loans/enquiries",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "product_id": product["id"],
            "form_version": product["form_version"],
            "answers": _credit_card_answers(),
        },
    )
    assert created.status_code == 201

    listed = await client.get(
        "/api/v1/loans/enquiries", headers={"Authorization": f"Bearer {other_token}"}
    )
    assert listed.status_code == 200
    assert listed.json() == {"enquiries": []}


@pytest.mark.asyncio
async def test_enquiry_list_is_scoped_to_assigned_telecaller(client: AsyncClient) -> None:
    owner_token, _ = await full_registration(client, lines=["loans"])
    product = next(
        item for item in await _products(client, owner_token) if item["name"] == "credit-cards"
    )
    created = await client.post(
        "/api/v1/loans/enquiries",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "product_id": product["id"],
            "form_version": product["form_version"],
            "answers": _credit_card_answers(),
        },
    )
    assert created.status_code == 201, created.text

    assigned_auth_uuid, assigned_staff_uuid = await _seed_telecaller("loans")
    other_auth_uuid, other_staff_uuid = await _seed_telecaller("loans")

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        lead_id = await db.scalar(
            text("SELECT lead_uuid FROM financial_service_enquiries WHERE id = :enquiry_id"),
            {"enquiry_id": created.json()["id"]},
        )
        await db.execute(
            text(
                "UPDATE leads SET assigned_telecaller_profile_uuid = :staff_id WHERE id = :lead_id"
            ),
            {
                "staff_id": assigned_staff_uuid,
                "lead_id": lead_id,
            },
        )
        await db.commit()

    assigned = await client.get(
        "/api/v1/loans/enquiries",
        headers={
            "Authorization": f"Bearer {_telecaller_token(assigned_auth_uuid, assigned_staff_uuid)}"
        },
    )
    assert assigned.status_code == 200, assigned.text
    assert [row["id"] for row in assigned.json()["enquiries"]] == [created.json()["id"]]

    unassigned = await client.get(
        "/api/v1/loans/enquiries",
        headers={"Authorization": f"Bearer {_telecaller_token(other_auth_uuid, other_staff_uuid)}"},
    )
    assert unassigned.status_code == 200, unassigned.text
    assert unassigned.json() == {"enquiries": []}


@pytest.mark.asyncio
async def test_account_deletion_scrubs_dynamic_financial_answers(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    loan_payload = await loan_application_payload(client, token)
    loan = await client.post("/api/v1/loans/applications", headers=headers, json=loan_payload)
    assert loan.status_code == 201, loan.text

    card = next(item for item in await _products(client, token) if item["name"] == "credit-cards")
    enquiry = await client.post(
        "/api/v1/loans/enquiries",
        headers=headers,
        json={
            "product_id": card["id"],
            "form_version": card["form_version"],
            "answers": _credit_card_answers(),
        },
    )
    assert enquiry.status_code == 201, enquiry.text

    deleted = await client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers=headers,
        json={"current_password": PASSWORD},
    )
    assert deleted.status_code == 200, deleted.text

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        loan_answers = await db.scalar(
            text("SELECT form_answers FROM loan_applications WHERE id = :id"),
            {"id": loan.json()["id"]},
        )
        enquiry_answers = await db.scalar(
            text("SELECT form_answers FROM financial_service_enquiries WHERE id = :id"),
            {"id": enquiry.json()["id"]},
        )
    assert loan_answers is None
    assert enquiry_answers is None
