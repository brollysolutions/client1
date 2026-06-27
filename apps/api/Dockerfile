# Multi-stage: base → dev | prod
# UV_SYSTEM_PYTHON=1 installs to system Python so volume-mounted source
# in dev doesn't hide a .venv created during build.

FROM python:3.12-slim AS base
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

ENV UV_SYSTEM_PYTHON=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ---------- dev ----------
FROM base AS dev
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
# Source is volume-mounted; CMD is set in docker-compose.yml

# ---------- prod ----------
FROM base AS prod
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN addgroup --system app \
    && adduser --system --ingroup app --no-create-home app \
    && chown -R app:app /app

USER app
