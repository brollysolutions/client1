"""content_blocks API — create, publish/archive, slug uniqueness, guards.

Mints role-specific access tokens (sub_admin / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as a sub_admin/admin for the endpoint under test. Mirrors test_offers_api.py —
content_blocks has no Admin-approval gate either.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration

_URL = "/api/v1/content-blocks"


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


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "both", "platform_scope": "true"}
    )


def _unique_slug() -> str:
    return f"block-{uuid.uuid4().hex[:12]}"


def _payload(**overrides) -> dict:
    base = {
        "slug": _unique_slug(),
        "section": "homepage-hero",
        "title": "Why choose us",
        "body": "Some marketing copy.",
        "business_line": "loans",
    }
    base.update(overrides)
    return base


async def _create(client: AsyncClient, headers: dict, **overrides) -> dict:
    res = await client.post(_URL, json=_payload(**overrides), headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sub_admin_create_starts_draft(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    body = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})
    assert body["status"] == "draft"
    assert body["created_by_uuid"] == uid


@pytest.mark.asyncio
async def test_create_without_business_line_is_global(client: AsyncClient) -> None:
    """NULL business_line = cross-line/global content (spec §5.3)."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    payload = _payload()
    del payload["business_line"]
    res = await client.post(
        _URL, json=payload, headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 201, res.text
    assert res.json()["business_line"] is None


@pytest.mark.asyncio
async def test_create_without_body_is_allowed(client: AsyncClient) -> None:
    """A block can be drafted before its copy is written."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    body = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"}, body=None)
    assert body["body"] is None


@pytest.mark.asyncio
async def test_duplicate_slug_is_conflict(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    slug = _unique_slug()
    await _create(client, headers, slug=slug)

    res = await client.post(_URL, json=_payload(slug=slug), headers=headers)
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_duplicate_slug_across_lines_still_conflicts(client: AsyncClient) -> None:
    """Slug is globally unique — not namespaced per business_line."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    slug = _unique_slug()
    await _create(client, headers, slug=slug, business_line="loans")

    res = await client.post(
        _URL, json=_payload(slug=slug, business_line="real_estate"), headers=headers
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_invalid_slug_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        _URL,
        json=_payload(slug="Not A Slug!"),
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_empty_title_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        _URL,
        json=_payload(title=""),
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Role guards
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_client_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(_URL, json=_payload(), headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_create(client: AsyncClient) -> None:
    """Admin has read-only oversight — no authoring, no approval step."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        _URL, json=_payload(), headers={"Authorization": f"Bearer {_admin_token(uid)}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    assert created["id"] in [b["id"] for b in res.json()["content_blocks"]]


@pytest.mark.asyncio
async def test_telecaller_list_is_empty(client: AsyncClient) -> None:
    """RLS denial by absence — the route is reachable, the rows are not."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _create(client, {"Authorization": f"Bearer {_sub_admin_token(uid)}"})

    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.json()["content_blocks"] == []


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_publish_then_archive(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)

    res = await client.post(f"{_URL}/{block['id']}/publish", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "published"

    res = await client.post(f"{_URL}/{block['id']}/archive", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_draft_can_archive_without_publishing(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)

    res = await client.post(f"{_URL}/{block['id']}/archive", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_publish_without_body_is_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers, body=None)

    res = await client.post(f"{_URL}/{block['id']}/publish", headers=headers)
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_publish_with_whitespace_only_body_is_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers, body="   \n  ")

    res = await client.post(f"{_URL}/{block['id']}/publish", headers=headers)
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_archived_cannot_be_republished(client: AsyncClient) -> None:
    """Archived is terminal — forward-only, no un-archive."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)
    await client.post(f"{_URL}/{block['id']}/archive", headers=headers)

    res = await client.post(f"{_URL}/{block['id']}/publish", headers=headers)
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_publish_twice_is_conflict(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)
    await client.post(f"{_URL}/{block['id']}/publish", headers=headers)

    res = await client.post(f"{_URL}/{block['id']}/publish", headers=headers)
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_advance_by_non_owner_sub_admin_is_forbidden(client: AsyncClient) -> None:
    """Shared visibility, owner-scoped write — 403, not 404."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    block = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"})

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    res = await client.post(
        f"{_URL}/{block['id']}/publish",
        headers={"Authorization": f"Bearer {_sub_admin_token(other_uid)}"},
    )
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_advance_unknown_id_is_not_found(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        f"{_URL}/{uuid.uuid4()}/publish",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 404, res.text


# ---------------------------------------------------------------------------
# Edit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_edit_draft(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)

    res = await client.patch(f"{_URL}/{block['id']}", json={"title": "Rewritten"}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Rewritten"


@pytest.mark.asyncio
async def test_edit_published_in_place(client: AsyncClient) -> None:
    """No approval gate on this table, so live copy is editable without a round trip."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)
    await client.post(f"{_URL}/{block['id']}/publish", headers=headers)

    res = await client.patch(
        f"{_URL}/{block['id']}", json={"body": "Corrected copy."}, headers=headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["body"] == "Corrected copy."
    assert res.json()["status"] == "published"


@pytest.mark.asyncio
async def test_edit_cannot_blank_published_body(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)
    await client.post(f"{_URL}/{block['id']}/publish", headers=headers)

    res = await client.patch(f"{_URL}/{block['id']}", json={"body": "  "}, headers=headers)
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_edit_archived_is_conflict(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)
    await client.post(f"{_URL}/{block['id']}/archive", headers=headers)

    res = await client.patch(f"{_URL}/{block['id']}", json={"title": "Too late"}, headers=headers)
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_edit_by_non_owner_is_forbidden(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    block = await _create(client, {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"})

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)

    res = await client.patch(
        f"{_URL}/{block['id']}",
        json={"title": "Hijacked"},
        headers={"Authorization": f"Bearer {_sub_admin_token(other_uid)}"},
    )
    assert res.status_code == 403, res.text


@pytest.mark.asyncio
async def test_slug_is_not_editable(client: AsyncClient) -> None:
    """slug is create-only — a public lookup handle must stay stable."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)

    res = await client.patch(
        f"{_URL}/{block['id']}", json={"slug": _unique_slug()}, headers=headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["slug"] == block["slug"]


@pytest.mark.asyncio
async def test_business_line_is_not_editable(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers, business_line="loans")

    res = await client.patch(
        f"{_URL}/{block['id']}", json={"business_line": "real_estate"}, headers=headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["business_line"] == "loans"


# ---------------------------------------------------------------------------
# Detail / list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_detail(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    block = await _create(client, headers)

    res = await client.get(f"{_URL}/{block['id']}", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["slug"] == block["slug"]


@pytest.mark.asyncio
async def test_get_detail_unknown_id_is_not_found(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        f"{_URL}/{uuid.uuid4()}", headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_list_status_filter(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    draft = await _create(client, headers)
    published = await _create(client, headers)
    await client.post(f"{_URL}/{published['id']}/publish", headers=headers)

    res = await client.get(f"{_URL}?status_filter=published", headers=headers)
    assert res.status_code == 200, res.text
    ids = [b["id"] for b in res.json()["content_blocks"]]
    assert published["id"] in ids
    assert draft["id"] not in ids
