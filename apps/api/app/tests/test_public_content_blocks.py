"""/api/v1/public/content-blocks — the unauthenticated published-block read.

There is no anonymous Postgres role in this system, so this endpoint runs as
the `app` superuser and RLS never engages (see services/public_catalog.py's
docstring). The `status == PUBLISHED` predicate in that service is the ONLY
access control on this path -- test_non_published_statuses_hidden_from_anonymous
and test_published_row_is_visible_to_a_raw_superuser_session together prove
that the filtering is coming from the app predicate, not from RLS.

Unlike banners/offers, content_blocks has no starts_at/ends_at columns, so
there is no scheduler-lag defence-in-depth window to test here -- status is
genuinely the entire filter.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text

from app.services.public_catalog import PUBLIC_CONTENT_BLOCKS_LIMIT
from conftest import full_registration, unique_mobile


async def _author_uuid(client: AsyncClient) -> str:
    """A real auth_users row is required (created_by_uuid FK) -- registers a
    throwaway account through the real endpoint, same as
    test_public_offers.py's helper."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_block(
    *,
    author: str,
    status: str,
    slug: str | None = None,
    section: str = "homepage-closing",
    title: str = "Test Block",
    body: str | None = "Test body copy.",
    business_line: str | None = None,
) -> str:
    import app.db.session as _session_mod
    from app.models.content_block import ContentBlock

    async with _session_mod.AsyncSessionLocal() as db:
        block = ContentBlock(
            slug=slug or f"test-block-{uuid.uuid4().hex}",
            section=section,
            title=title,
            body=body,
            business_line=business_line,
            status=status,
            created_by_uuid=uuid.UUID(author),
        )
        db.add(block)
        await db.commit()
        return str(block.id)


async def _delete_blocks(*block_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.content_block import ContentBlock

    ids = [uuid.UUID(bid) for bid in block_ids]
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(ContentBlock).where(ContentBlock.id.in_(ids)))
        await db.commit()


async def _superuser_sees(block_id: str) -> bool:
    import app.db.session as _session_mod
    from app.models.content_block import ContentBlock

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            select(ContentBlock).where(ContentBlock.id == uuid.UUID(block_id))
        )
        return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_no_auth_required(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/public/content-blocks")
    assert resp.status_code == 200

    # Contrast with the authenticated twin, to pin the distinction this
    # endpoint exists to make.
    auth_resp = await client.get("/api/v1/content-blocks")
    assert auth_resp.status_code == 401


@pytest.mark.asyncio
async def test_published_block_is_returned(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    slug = f"published-block-{uuid.uuid4().hex}"
    block_id = await _seed_block(
        author=author,
        status="published",
        slug=slug,
        section="homepage-closing",
        title="Public Published Block",
        body="Real published copy.",
        business_line="loans",
    )
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        assert resp.status_code == 200
        rows = {b["slug"]: b for b in resp.json()["content_blocks"]}
        assert slug in rows
        row = rows[slug]
        assert row["section"] == "homepage-closing"
        assert row["title"] == "Public Published Block"
        assert row["body"] == "Real published copy."
        assert row["business_line"] == "loans"
    finally:
        await _delete_blocks(block_id)


@pytest.mark.asyncio
async def test_non_published_statuses_hidden_from_anonymous(client: AsyncClient) -> None:
    """The access-control guard: nothing but `published` may ever reach a visitor."""
    author = await _author_uuid(client)
    slugs_by_status = {
        status: f"hidden-{status}-{uuid.uuid4().hex}" for status in ("draft", "archived")
    }
    ids = {
        status: await _seed_block(author=author, status=status, slug=slug)
        for status, slug in slugs_by_status.items()
    }
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        assert resp.status_code == 200
        returned_slugs = {b["slug"] for b in resp.json()["content_blocks"]}
        for status, slug in slugs_by_status.items():
            assert slug not in returned_slugs, f"{status} block leaked to public response"
    finally:
        await _delete_blocks(*ids.values())


@pytest.mark.asyncio
async def test_published_row_is_visible_to_a_raw_superuser_session(client: AsyncClient) -> None:
    """Proves the previous test's exclusion came from the app predicate, not
    RLS. A superuser session bypasses RLS entirely, so if this row is present
    here but absent over HTTP, the HTTP exclusion can only be the explicit
    `status == PUBLISHED` filter in services.public_catalog. Delete this test
    and the reason for that WHERE clause is lost."""
    author = await _author_uuid(client)
    slug = f"draft-superuser-visible-{uuid.uuid4().hex}"
    block_id = await _seed_block(author=author, status="draft", slug=slug)
    try:
        assert await _superuser_sees(block_id) is True

        resp = await client.get("/api/v1/public/content-blocks")
        returned_slugs = {b["slug"] for b in resp.json()["content_blocks"]}
        assert slug not in returned_slugs
    finally:
        await _delete_blocks(block_id)


@pytest.mark.asyncio
async def test_response_omits_internal_fields(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    slug = f"field-leak-check-{uuid.uuid4().hex}"
    block_id = await _seed_block(author=author, status="published", slug=slug)
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        row = next(b for b in resp.json()["content_blocks"] if b["slug"] == slug)
        assert set(row.keys()) == {"slug", "section", "title", "body", "business_line"}
        internal_fields = {"id", "status", "created_by_uuid", "created_at", "updated_at"}
        for field in internal_fields:
            assert field not in row, f"internal field {field!r} leaked to public response"
    finally:
        await _delete_blocks(block_id)


@pytest.mark.asyncio
async def test_business_line_is_exposed(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    global_slug = f"global-block-{uuid.uuid4().hex}"
    loans_slug = f"loans-block-{uuid.uuid4().hex}"
    global_id = await _seed_block(
        author=author, status="published", slug=global_slug, business_line=None
    )
    loans_id = await _seed_block(
        author=author, status="published", slug=loans_slug, business_line="loans"
    )
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        rows = {b["slug"]: b for b in resp.json()["content_blocks"]}
        assert rows[global_slug]["business_line"] is None
        assert rows[loans_slug]["business_line"] == "loans"
    finally:
        await _delete_blocks(global_id, loans_id)


@pytest.mark.asyncio
async def test_ordering_is_newest_first(client: AsyncClient) -> None:
    """Relative order of the seeded slugs only -- never absolute positions,
    the DB is shared. Newest (highest created_at) must sort first: a block is
    looked up by slug, not position, so this alone has no product meaning,
    but it's what keeps a freshly published block inside the flat cap
    regardless of how large the historical corpus is (see test_response_cap
    and docs/specs/public-content-block-serving.md)."""
    author = await _author_uuid(client)
    older_slug = f"older-block-{uuid.uuid4().hex}"
    newer_slug = f"newer-block-{uuid.uuid4().hex}"
    older_id = await _seed_block(author=author, status="published", slug=older_slug)
    newer_id = await _seed_block(author=author, status="published", slug=newer_slug)
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        slugs_in_order = [b["slug"] for b in resp.json()["content_blocks"]]
        assert slugs_in_order.index(newer_slug) < slugs_in_order.index(older_slug)
    finally:
        await _delete_blocks(older_id, newer_id)


@pytest.mark.asyncio
async def test_response_cap(client: AsyncClient) -> None:
    """The regression test for the flat-cap starvation bug this endpoint
    already hit once during development: the shared dev/test Postgres
    already carries dozens of published rows from unrelated tests' fixtures,
    so an oldest-first order combined with any cap can silently exclude
    every row this test seeds. Seeding PUBLIC_CONTENT_BLOCKS_LIMIT + 3 rows,
    all newer than anything already in the table, and asserting the response
    is capped at exactly the limit proves both that the cap is enforced AND
    that newest-first ordering keeps this test's own freshly-seeded rows
    inside it -- if ordering ever regresses to oldest-first, this assertion
    fails because older, unrelated rows would crowd these out instead."""
    author = await _author_uuid(client)
    ids = [
        await _seed_block(author=author, status="published", slug=f"cap-test-{uuid.uuid4().hex}")
        for _ in range(PUBLIC_CONTENT_BLOCKS_LIMIT + 3)
    ]
    try:
        resp = await client.get("/api/v1/public/content-blocks")
        assert len(resp.json()["content_blocks"]) == PUBLIC_CONTENT_BLOCKS_LIMIT
    finally:
        await _delete_blocks(*ids)


@pytest.mark.asyncio
async def test_get_by_slug_returns_published_block(client: AsyncClient) -> None:
    """feature-status §2-1: the direct lookup that removes the >50-block
    starvation cliff list_public_content_blocks's own docstring documents."""
    author = await _author_uuid(client)
    slug = f"by-slug-{uuid.uuid4().hex}"
    block_id = await _seed_block(
        author=author,
        status="published",
        slug=slug,
        section="homepage-closing",
        title="By-Slug Block",
        body="Direct lookup copy.",
        business_line="loans",
    )
    try:
        resp = await client.get(f"/api/v1/public/content-blocks/{slug}")
        assert resp.status_code == 200
        row = resp.json()
        assert row["slug"] == slug
        assert row["title"] == "By-Slug Block"
        assert row["body"] == "Direct lookup copy."
        assert row["business_line"] == "loans"
        assert set(row.keys()) == {"slug", "section", "title", "body", "business_line"}
    finally:
        await _delete_blocks(block_id)


@pytest.mark.asyncio
async def test_get_by_slug_404s_for_unknown_slug(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/public/content-blocks/no-such-slug-{uuid.uuid4().hex}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_by_slug_404s_for_non_published_status(client: AsyncClient) -> None:
    """Same access-control posture as the list route: status == PUBLISHED is
    the entire filter, so a draft/archived block at a known slug must not
    leak through the by-slug lookup either."""
    author = await _author_uuid(client)
    slug = f"by-slug-draft-{uuid.uuid4().hex}"
    block_id = await _seed_block(author=author, status="draft", slug=slug)
    try:
        resp = await client.get(f"/api/v1/public/content-blocks/{slug}")
        assert resp.status_code == 404
    finally:
        await _delete_blocks(block_id)
