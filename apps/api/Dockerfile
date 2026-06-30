# Multi-stage: base → dev | prod
# dev: uv creates /app/.venv (no UV_SYSTEM_PYTHON) so the named volume seeds correctly.
# prod: UV_SYSTEM_PYTHON=1 installs to system Python; no venv needed in the final image.

FROM python:3.12-slim AS base
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ---------- dev ----------
# No UV_SYSTEM_PYTHON here: uv creates /app/.venv so the api_venv named volume
# in docker-compose.dev.yml is seeded from the image on first use, preventing
# the host Windows .venv from leaking in through the source mount.
FROM base AS dev
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
# Source is volume-mounted; CMD is set in docker-compose.yml

# ---------- prod ----------
FROM base AS prod
ENV UV_SYSTEM_PYTHON=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN addgroup --system app \
    && adduser --system --ingroup app --no-create-home app \
    && chown -R app:app /app

USER app
