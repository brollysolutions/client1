"""Admin lifecycle changes must reach anonymous readers without losing history."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token
from conftest import full_registration

from .test_loan_config_api import (
    _admin_headers,
    _audit_row,
    _auth_user_uuid,
    _create_bank,
    _create_loan_type,
)
from .test_loan_config_rls import ADMIN_CTX, _engine, _set_ctx


@pytest.mark.asyncio
async def test_publication_activation_and_deletion_control_all_public_reads(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    admin_url = f"/api/v1/admin/loan-types/{product['id']}"
    public_url = f"/api/v1/public/financial-products/{product['name']}"

    async def visible(expected: bool) -> None:
        for params in ({"q": product["label"]}, {"q": product["label"], "featured": True}):
            response = await client.get("/api/v1/public/financial-products", params=params)
            assert response.status_code == 200
            assert (product["id"] in {row["id"] for row in response.json()["items"]}) is expected
        for suffix in ("", "/providers"):
            assert (await client.get(public_url + suffix)).status_code == (200 if expected else 404)

    await visible(False)
    published = await client.patch(
        admin_url,
        headers=headers,
        json={
            "public_visible": True,
            "homepage_featured": True,
            "public_summary": "Synthetic published product summary.",
            "public_description": "Synthetic public product description for a lifecycle test.",
        },
    )
    assert published.status_code == 200, published.text
    await visible(True)
    for active in (False, True):
        response = await client.patch(admin_url, headers=headers, json={"active": active})
        assert response.status_code == 200
        await visible(active)
    assert (await client.delete(admin_url, headers=headers)).status_code == 204
    await visible(False)
    assert (
        await client.patch(admin_url, headers=headers, json={"active": True})
    ).status_code == 404
    assert (await client.delete(admin_url, headers=headers)).status_code == 404


@pytest.mark.asyncio
async def test_product_delete_preserves_provider_and_cascades_only_availability(
    client: AsyncClient,
) -> None:
    headers = await _admin_headers(client)
    product = await _create_loan_type(client, headers)
    bank = await _create_bank(client, headers)
    response = await client.put(
        f"/api/v1/admin/banks/{bank['id']}/availability",
        headers=headers,
        json={"entries": [{"loan_type_id": product["id"], "available": False}]},
    )
    assert response.status_code == 200, response.text
    assert (
        await client.delete(f"/api/v1/admin/loan-types/{product['id']}", headers=headers)
    ).status_code == 204
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        assert (
            await db.scalar(
                text("SELECT count(*) FROM bank_loan_type_availability WHERE loan_type_id = :id"),
                {"id": product["id"]},
            )
            == 0
        )
        assert (
            await db.scalar(text("SELECT count(*) FROM banks WHERE id = :id"), {"id": bank["id"]})
            == 1
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("reference", ["application", "enquiry", "offer"])
async def test_used_product_delete_is_blocked_by_service_and_foreign_key(
    client: AsyncClient, reference: str
) -> None:
    headers = await _admin_headers(client)
    category = "insurance" if reference == "enquiry" else "loan"
    response = await client.post(
        "/api/v1/admin/loan-types",
        headers=headers,
        json={
            "label": f"Lifecycle {uuid.uuid4().hex[:10]}",
            "category": category,
        },
    )
    assert response.status_code == 201, response.text
    product = response.json()
    if reference == "offer":
        bank = await _create_bank(client, headers)
        linked = await client.post(
            "/api/v1/admin/product-provider-offers",
            headers=headers,
            json={
                "loan_type_id": product["id"],
                "bank_id": bank["id"],
                "offer_name": "Unpublished offer",
            },
        )
    else:
        token, _ = await full_registration(client, lines=["loans"])
        payload = {"form_version": product["form_version"]}
        if reference == "application":
            payload.update(loan_type_id=product["id"], answers={"requested_amount": "500000"})
            path = "/api/v1/loans/applications"
        else:
            payload.update(product_id=product["id"], answers={"coverage_amount": "500000"})
            path = "/api/v1/loans/enquiries"
        linked = await client.post(path, headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert linked.status_code == 201, linked.text
    url = f"/api/v1/admin/loan-types/{product['id']}"
    assert (await client.delete(url, headers=headers)).status_code == 409
    assert await _audit_row("loan_type_deleted", product["id"]) is None
    assert (await client.patch(url, headers=headers, json={"active": False})).status_code == 200
    # Disable does not make referenced data disposable.
    assert (await client.delete(url, headers=headers)).status_code == 409
    engine = _engine()
    try:
        async with engine.begin() as connection:
            await _set_ctx(connection, **ADMIN_CTX)
            with pytest.raises(IntegrityError):
                await connection.execute(
                    text("DELETE FROM loan_types WHERE id = :id"), {"id": product["id"]}
                )
    finally:
        await engine.dispose()
    listed = await client.get("/api/v1/admin/loan-types", headers=headers)
    retained = next(row for row in listed.json()["loan_types"] if row["id"] == product["id"])
    assert retained["form_schema"] == product["form_schema"]
    assert retained["form_version"] == product["form_version"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role,scope",
    [
        ("client", "false"),
        ("agent", "false"),
        ("employee", "false"),
        ("telecaller", "false"),
        ("sub_admin", "true"),
        ("admin", "false"),
    ],
)
async def test_product_delete_rejects_non_platform_admin(
    client: AsyncClient, role: str, scope: str
) -> None:
    _, mobile = await full_registration(client)
    token = create_access_token(
        {
            "sub": await _auth_user_uuid(mobile),
            "role": role,
            "business_line": "real_estate",
            "platform_scope": scope,
        }
    )
    response = await client.delete(
        f"/api/v1/admin/loan-types/{uuid.uuid4()}", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_product_delete_rejects_anonymous(client: AsyncClient) -> None:
    assert (await client.delete(f"/api/v1/admin/loan-types/{uuid.uuid4()}")).status_code == 401
