"""FastAPI application entrypoint.

Minimal bootstrap for the Loans & Real Estate platform: app factory, CORS, and a
readiness probe that confirms the request path to Postgres (via pgBouncer) and Redis.
Business routers are mounted under app/api/v1 as features land.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import router as auth_router
from app.core.config import settings
from app.db.session import engine, get_db

logger = logging.getLogger("app")
logging.basicConfig(level=settings.LOG_LEVEL.upper())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Open shared clients on startup, dispose them on shutdown."""
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    logger.info("api.startup env=%s", settings.ENV)
    try:
        yield
    finally:
        await app.state.redis.aclose()
        await engine.dispose()
        logger.info("api.shutdown")


app = FastAPI(title="Loans & Real Estate API", version="0.1.0", lifespan=lifespan)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "loans-realestate-api", "status": "ok"}


@app.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Readiness probe: ping Postgres (through pgBouncer) and Redis."""
    checks: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:  # surface dependency failure, not a stack trace
        logger.warning("health.database_failed error=%s", exc)
        checks["database"] = "down"

    try:
        await app.state.redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        logger.warning("health.redis_failed error=%s", exc)
        checks["redis"] = "down"

    healthy = all(v == "ok" for v in checks.values())
    return {"status": "ok" if healthy else "degraded", "checks": checks}
