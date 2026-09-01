"""Artwork sourcing for banners and offers.

Public campaigns used to be locked to a governed category template: the router
returned 422 for any `media_asset_id` outside the dashboard placement. A Sub
Admin can now attach Media Library artwork -- pre-existing or uploaded -- to any
placement, so these tests pin the rules that replaced that blanket refusal:
exactly one artwork source per campaign, and artwork shaped for the surface that
will render it.

They also cover bundled artwork end to end. Bundled assets are referenced by
public path rather than an object-store key, and `storage.public_asset_url`
returns None for those -- resolving an `image_key` through it left dashboard
campaigns imageless and blocked offer submission outright.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.campaign_artwork import ARTWORK_SPECS, spec_for
from app.core.security import create_access_token
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


async def _asset(usage_type: str, *, business_line: str | None = None) -> tuple[str, str]:
    """One active bundled asset for a usage type, as (id, image_ref).

    Restricted to bundled artwork on purpose. The shared test database also
    holds uploaded assets left by other tests, whose `image_url` is a signed
    object-store URL rather than the ref -- selecting one would make the
    bundled-resolution assertions below meaningless.
    """
    import app.db.session as _session_mod

    clause = "AND business_line = :line" if business_line else ""
    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT id, image_ref FROM campaign_media_assets "
                    f"WHERE usage_type = :usage AND active AND source_type = 'bundled' {clause} "
                    "ORDER BY created_at LIMIT 1"
                ),
                {"usage": usage_type, "line": business_line},
            )
        ).fetchone()
    assert row is not None, f"no seeded {usage_type} artwork; run alembic upgrade head"
    return str(row[0]), row[1]


async def _template_id(placement: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT id FROM banner_templates WHERE placement::text = :p AND active LIMIT 1"
                ),
                {"p": placement},
            )
        ).fetchone()
    assert row is not None, f"no active template for {placement}"
    return str(row[0])


# placement -> (usage type its artwork must carry, business line the banner takes)
_PUBLIC_SURFACES = [
    ("homepage", "homepage_banner", "both"),
    ("homepage_ad", "sponsor", "both"),
    ("financial_services", "section_banner", "loans"),
    ("properties", "section_banner", "real_estate"),
]


@pytest.mark.parametrize(("placement", "usage_type", "business_line"), _PUBLIC_SURFACES)
@pytest.mark.asyncio
async def test_public_banner_accepts_media_library_artwork(
    client: AsyncClient, placement: str, usage_type: str, business_line: str
) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    asset_id, image_ref = await _asset(usage_type, business_line=business_line)
    res = await client.post(
        "/api/v1/banners",
        json={
            "placement": placement,
            "business_line": business_line,
            "banner_type": "default",
            "title": f"{placement} media campaign",
            "media_asset_id": asset_id,
            "audience_rules": {},
            "priority": 0,
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["media_asset_id"] == asset_id
    # Bundled refs must survive as a servable URL, not collapse to null.
    assert body["image_url"] == image_ref


@pytest.mark.asyncio
async def test_public_banner_rejects_two_artwork_sources(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    asset_id, _ = await _asset("homepage_banner")
    res = await client.post(
        "/api/v1/banners",
        json={
            "placement": "homepage",
            "business_line": "both",
            "banner_type": "default",
            "title": "Two sources",
            "template_id": await _template_id("homepage"),
            "media_asset_id": asset_id,
            "audience_rules": {},
            "priority": 0,
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422, res.text
    assert "not both" in res.json()["detail"]


@pytest.mark.asyncio
async def test_public_banner_rejects_artwork_from_another_surface(client: AsyncClient) -> None:
    """5:2 section artwork must not land in the 9:5 homepage hero."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    asset_id, _ = await _asset("section_banner", business_line="loans")
    res = await client.post(
        "/api/v1/banners",
        json={
            "placement": "homepage",
            "business_line": "loans",
            "banner_type": "default",
            "title": "Wrong shape",
            "media_asset_id": asset_id,
            "audience_rules": {},
            "priority": 0,
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_public_banner_still_requires_some_artwork(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners",
        json={
            "placement": "homepage",
            "business_line": "both",
            "banner_type": "default",
            "title": "No artwork at all",
            "audience_rules": {},
            "priority": 0,
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_patch_swaps_template_artwork_for_media(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post(
        "/api/v1/banners",
        json={
            "placement": "homepage",
            "business_line": "both",
            "banner_type": "default",
            "title": "Starts on a template",
            "template_id": await _template_id("homepage"),
            "audience_rules": {},
            "priority": 0,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    banner_id = created.json()["id"]

    asset_id, image_ref = await _asset("homepage_banner")
    patched = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"template_id": None, "media_asset_id": asset_id},
        headers=headers,
    )
    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["media_asset_id"] == asset_id
    assert body["image_url"] == image_ref


@pytest.mark.asyncio
async def test_dashboard_banner_uses_bundled_artwork(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    # A cross-line banner needs cross-line artwork: line-tagged assets are
    # rejected for a "both" campaign by resolve_campaign_asset.
    asset_id, image_ref = await _asset("dashboard_banner", business_line="both")
    res = await client.post(
        "/api/v1/banners",
        json={
            "placement": "dashboard",
            "business_line": "both",
            "banner_type": "default",
            "title": "Dashboard bundled artwork",
            "media_asset_id": asset_id,
            "audience_rules": {},
            "priority": 0,
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["image_url"] == image_ref


@pytest.mark.asyncio
async def test_offer_with_bundled_artwork_can_be_submitted(client: AsyncClient) -> None:
    """Submission readiness must accept bundled artwork, not only uploads."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    asset_id, image_ref = await _asset("dashboard_offer")
    created = await client.post(
        "/api/v1/offers",
        json={
            "business_line": "loans",
            "title": "Bundled artwork offer",
            "discount_type": "percentage",
            "discount_value": "10",
            "code": "BUNDLED10",
            "partner_name": "Example Partner",
            "redemption_url": "https://partner.example/checkout",
            "terms_summary": "Valid once per customer while campaign inventory lasts.",
            "media_asset_id": asset_id,
            "audience_rules": {"version": 1, "user_types": ["client"]},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["image_url"] == image_ref

    submitted = await client.post(f"/api/v1/offers/{created.json()['id']}/submit", headers=headers)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "pending_approval"


def test_artwork_specs_separate_hero_from_section_shapes() -> None:
    """A 5:2 image must fail the 9:5 hero and vice versa."""
    hero = ARTWORK_SPECS["homepage_banner"]
    section = ARTWORK_SPECS["section_banner"]

    assert hero.accepts(1440, 800)
    assert not hero.accepts(1440, 576)
    assert section.accepts(1440, 576)
    assert not section.accepts(1440, 800)

    # Too small for the surface even at the right shape.
    assert not hero.accepts(800, 444)
    # The multi-use bucket keeps the original wide band.
    assert ARTWORK_SPECS["campaign"].accepts(1440, 800)
    assert ARTWORK_SPECS["campaign"].accepts(1440, 576)


def test_unknown_usage_type_has_no_spec() -> None:
    assert spec_for("not_a_surface") is None


@pytest.mark.asyncio
async def test_patch_cannot_strip_a_public_banner_to_no_artwork(client: AsyncClient) -> None:
    """A media-backed public banner must not fall through the legacy escape hatch.

    `allow_legacy` exists for rows written before placements and templates did.
    A media-backed campaign also has no template and no category, so without an
    explicit exclusion clearing `media_asset_id` would leave a public banner
    that renders with no image at all.
    """
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    asset_id, _ = await _asset("homepage_banner")
    created = await client.post(
        "/api/v1/banners",
        json={
            "placement": "homepage",
            "business_line": "both",
            "banner_type": "default",
            "title": "Media backed",
            "media_asset_id": asset_id,
            "audience_rules": {},
            "priority": 0,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text

    stripped = await client.patch(
        f"/api/v1/banners/{created.json()['id']}",
        json={"media_asset_id": None},
        headers=headers,
    )
    assert stripped.status_code == 422, stripped.text
