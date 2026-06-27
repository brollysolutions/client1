import pytest

from app.main import root


@pytest.mark.asyncio
async def test_root_returns_service_status() -> None:
    assert await root() == {"service": "loans-realestate-api", "status": "ok"}
