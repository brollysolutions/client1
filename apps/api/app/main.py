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
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.bookmarks import router as bookmarks_router
from app.api.v1.employee import router as employee_router
from app.api.v1.enquiries import router as enquiries_router
from app.api.v1.leads import router as leads_router
from app.api.v1.loans import router as loans_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.payments import router as payments_router
from app.api.v1.properties import router as properties_router
from app.api.v1.property_submissions import router as property_submissions_router
from app.api.v1.site_visits import router as site_visits_router
from app.api.v1.support_tickets import router as support_tickets_router
from app.api.v1.telecaller import router as telecaller_router
from app.api.v1.transactions import router as transactions_router
from app.core.config import settings
from app.db.session import engine, get_db

logger = logging.getLogger("app")
logging.basicConfig(level=settings.LOG_LEVEL.upper())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Open shared clients on startup, dispose them on shutdown."""
    # Fail fast on a silently-broken production topology: behind the documented
    # nginx proxy with TRUST_PROXY_HEADERS off, every request resolves to the
    # proxy's IP and the per-IP OTP/login limits collapse into one global
    # bucket (any abuser then exhausts them for every user at once).
    if settings.ENV == "production" and not settings.TRUST_PROXY_HEADERS:
        raise RuntimeError(
            "TRUST_PROXY_HEADERS must be enabled in production: the API runs "
            "behind a reverse proxy there, and per-IP rate limits are keyed on "
            "the forwarded client IP."
        )
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    logger.info("api.startup env=%s", settings.ENV)
    try:
        yield
    finally:
        await app.state.redis.aclose()
        await engine.dispose()
        logger.info("api.shutdown")


app = FastAPI(title="Loans & Real Estate API", version="0.1.0", lifespan=lifespan)

# Browser calls come from the web app on a different origin (localhost:3000 ->
# localhost:8000). Credentials are on: the httponly refresh cookie and the Bearer
# header must be allowed, so the origin list must be explicit (never "*").
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(leads_router, prefix="/api/v1/leads", tags=["leads"])
app.include_router(loans_router, prefix="/api/v1/loans", tags=["loans"])
app.include_router(
    support_tickets_router, prefix="/api/v1/support-tickets", tags=["support-tickets"]
)
app.include_router(site_visits_router, prefix="/api/v1/site-visits", tags=["site-visits"])
app.include_router(enquiries_router, prefix="/api/v1/enquiries", tags=["enquiries"])
app.include_router(properties_router, prefix="/api/v1/properties", tags=["properties"])
app.include_router(
    property_submissions_router,
    prefix="/api/v1/property-submissions",
    tags=["property-submissions"],
)
app.include_router(bookmarks_router, prefix="/api/v1/bookmarks", tags=["bookmarks"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(transactions_router, prefix="/api/v1/transactions", tags=["transactions"])
app.include_router(payments_router, prefix="/api/v1/payouts", tags=["payouts"])
app.include_router(telecaller_router, prefix="/api/v1/telecaller", tags=["telecaller"])
app.include_router(employee_router, prefix="/api/v1/employee", tags=["employee"])


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
