"""Offers are authenticated dashboard placements, never an anonymous catalog."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_public_offers_route_does_not_exist(client: AsyncClient) -> None:
    response = await client.get("/api/v1/public/offers")
    assert response.status_code == 404
