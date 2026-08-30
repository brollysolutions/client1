# Multi-stage: base → dev | prod
# dev: uv creates /app/.venv (no UV_SYSTEM_PYTHON) so the named volume seeds correctly.
# prod: UV_SYSTEM_PYTHON=1 installs to system Python; no venv needed in the final image.

FROM python:3.12-slim AS base
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Managed video is decoded and re-encoded before any playback URL exists.
# Install the distribution-patched binaries in both dev and prod stages.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

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
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN addgroup --system app \
    && adduser --system --ingroup app --no-create-home app \
    && chown -R app:app /app

USER app

# `uv sync` creates /app/.venv. Run that environment directly in production:
# the locked-down app user deliberately has no home directory, so invoking
# `uv run` at runtime would try to create `/nonexistent/.cache/uv` and abort
# before Uvicorn or the scheduler starts.
ENV PATH="/app/.venv/bin:${PATH}"
