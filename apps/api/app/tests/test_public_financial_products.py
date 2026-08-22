"""Anonymous Financial Services catalogue and provider-offer publication.

These routes run without an RLS identity, so active + explicit publication is
the access-control boundary.  The operational availability matrix is
deliberately absent from every assertion: a missing matrix row must never make
a provider public.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text


async def _seed_catalogue() -> dict[str, str]:
    import app.db.session as session_mod

    suffix = uuid.uuid4().hex[:10]
    product_id = uuid.uuid4()
    hidden_id = uuid.uuid4()
    bank_id = uuid.uuid4()
    nbfc_id = uuid.uuid4()
    offer_id = uuid.uuid4()
    second_offer_id = uuid.uuid4()
    logo_id = uuid.uuid4()
    now = datetime.now(UTC)
    async with session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text(
                """
                INSERT INTO loan_types (
                    id, name, label, active, category, display_order,
                    public_visible, public_summary, public_description,
                    public_highlights, public_eligibility, public_documents,
                    public_faq, homepage_featured, homepage_feature_order,
                    created_at, updated_at
                ) VALUES
                (:product_id, :slug, :label, true, 'loan', 10, true,
                 'A clear public summary', 'A bounded public description',
                 '["Fast assisted journey"]'::jsonb,
                 '["Resident Indian"]'::jsonb,
                 '["Income proof"]'::jsonb,
                 '[{"question":"Guaranteed?","answer":"No. Provider review decides."}]'::jsonb,
                 true, 1, :now, :now),
                (:hidden_id, :hidden_slug, 'Hidden Product', true, 'loan', 11,
                 false, 'Must stay private', NULL, '[]'::jsonb, '[]'::jsonb,
                 '[]'::jsonb, '[]'::jsonb, false, 1000, :now, :now)
                """
            ),
            {
                "product_id": product_id,
                "slug": f"public-product-{suffix}",
                "label": f"Public Product {suffix}",
                "hidden_id": hidden_id,
                "hidden_slug": f"hidden-product-{suffix}",
                "now": now,
            },
        )
        await db.execute(
            text(
                """
                INSERT INTO banks (
                    id, name, legal_name, provider_type, logo_key, active,
                    logo_verified_at, created_at, updated_at
                ) VALUES
                (:bank_id, :bank_name, :bank_legal, 'bank',
                 :logo_key, true, :now, :now, :now),
                (:nbfc_id, :nbfc_name, NULL, 'nbfc', NULL, true, NULL, :now, :now)
                """
            ),
            {
                "bank_id": bank_id,
                "bank_name": f"Reviewed Bank {suffix}",
                "bank_legal": f"Reviewed Bank {suffix} Limited",
                "logo_key": f"public/provider-logos/{bank_id}/{logo_id}.png",
                "nbfc_id": nbfc_id,
                "nbfc_name": f"Helpful NBFC {suffix}",
                "now": now,
            },
        )
        await db.execute(
            text(
                """
                INSERT INTO financial_product_provider_offers (
                    id, loan_type_id, bank_id, offer_name, summary, published,
                    display_order, min_amount, max_amount, min_interest_rate,
                    max_interest_rate, min_tenure_months, max_tenure_months,
                    processing_fee_text, eligibility_summary, last_verified_at,
                    created_at, updated_at
                ) VALUES
                (:offer_id, :product_id, :bank_id, 'Standard option',
                 'Informational terms for comparison.', true, 1, 100000, 1000000,
                 9.5, 14.25, 12, 60, 'As assessed by the provider',
                 'Final eligibility is assessed by the provider.', :now, :now, :now),
                (:second_offer_id, :product_id, :nbfc_id, 'Flexible option',
                 'A second informational option.', true, 2, 50000, 500000,
                 12.0, 18.0, 6, 36, NULL, NULL, :now, :now, :now)
                """
            ),
            {
                "offer_id": offer_id,
                "second_offer_id": second_offer_id,
                "product_id": product_id,
                "bank_id": bank_id,
                "nbfc_id": nbfc_id,
                "now": now,
            },
        )
        await db.commit()
    return {
        "product_id": str(product_id),
        "hidden_id": str(hidden_id),
        "bank_id": str(bank_id),
        "nbfc_id": str(nbfc_id),
        "slug": f"public-product-{suffix}",
        "hidden_slug": f"hidden-product-{suffix}",
        "label": f"Public Product {suffix}",
        "bank_name": f"Reviewed Bank {suffix}",
        "offer_id": str(offer_id),
        "second_offer_id": str(second_offer_id),
    }


async def _cleanup(seed: dict[str, str]) -> None:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("DELETE FROM financial_product_provider_offers WHERE id IN (:one, :two)"),
            {"one": uuid.UUID(seed["offer_id"]), "two": uuid.UUID(seed["second_offer_id"])},
        )
        await db.execute(
            text("DELETE FROM banks WHERE id IN (:one, :two)"),
            {"one": uuid.UUID(seed["bank_id"]), "two": uuid.UUID(seed["nbfc_id"])},
        )
        await db.execute(
            text("DELETE FROM loan_types WHERE id IN (:one, :two)"),
            {"one": uuid.UUID(seed["product_id"]), "two": uuid.UUID(seed["hidden_id"])},
        )
        await db.commit()


@pytest.mark.asyncio
async def test_catalogue_is_explicitly_published_searchable_and_internal_only(
    client: AsyncClient,
) -> None:
    seed = await _seed_catalogue()
    try:
        response = await client.get(
            "/api/v1/public/financial-products",
            params={"q": seed["label"], "featured": "true", "page": 1, "page_size": 6},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total"] == 1
        assert body["page"] == 1
        assert body["page_size"] == 6
        product = body["items"][0]
        assert product["id"] == seed["product_id"]
        assert product["slug"] == seed["slug"]
        assert product["provider_count"] == 2
        assert product["homepage_featured"] is True
        assert "redirect" not in product
        assert "destination_url" not in product

        broad = await client.get("/api/v1/public/financial-products", params={"page_size": 100})
        ids = {item["id"] for item in broad.json()["items"]}
        assert seed["product_id"] in ids
        assert seed["hidden_id"] not in ids
    finally:
        await _cleanup(seed)


@pytest.mark.asyncio
async def test_detail_and_provider_results_filter_and_paginate_without_lender_links(
    client: AsyncClient,
) -> None:
    seed = await _seed_catalogue()
    try:
        detail = await client.get(f"/api/v1/public/financial-products/{seed['slug']}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["faq"][0]["question"] == "Guaranteed?"

        offers = await client.get(
            f"/api/v1/public/financial-products/{seed['slug']}/providers",
            params={
                "q": seed["bank_name"],
                "provider_type": "bank",
                "amount": 250000,
                "interest_rate_max": 15,
                "tenure_months": 24,
                "sort": "interest_rate",
                "page": 1,
                "page_size": 1,
            },
        )
        assert offers.status_code == 200, offers.text
        body = offers.json()
        assert body["total"] == 1
        assert body["items"][0]["provider"]["id"] == seed["bank_id"]
        logo_url = body["items"][0]["provider"]["logo_url"]
        assert logo_url is not None
        assert f"public/provider-logos/{seed['bank_id']}/" in logo_url
        serialized = str(body).lower()
        assert "destination_url" not in serialized
        assert "external_url" not in serialized
        assert "apply_url" not in serialized
    finally:
        await _cleanup(seed)


@pytest.mark.asyncio
async def test_unpublished_or_inactive_product_detail_is_404(client: AsyncClient) -> None:
    seed = await _seed_catalogue()
    try:
        hidden = await client.get(f"/api/v1/public/financial-products/{seed['hidden_slug']}")
        assert hidden.status_code == 404
    finally:
        await _cleanup(seed)
