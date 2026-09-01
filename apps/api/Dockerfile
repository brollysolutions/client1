# Multi-stage: fixed Alpine base -> dev | deps -> prod.
# The production image receives only the frozen virtualenv, never the uv binary
# or a package-manager invocation at runtime.

FROM python:3.12-alpine3.23@sha256:31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3 AS base
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Refresh the vulnerable libraries reported in the reviewed base manifest while
# keeping native media parsers out of the API and scheduler image.
RUN apk add --no-cache --upgrade \
    "libcrypto3=3.5.8-r0" \
    "libssl3=3.5.8-r0" \
    "sqlite-libs=3.53.4-r0"

FROM ghcr.io/astral-sh/uv:0.5@sha256:7bff3c3776ec467fc1437960f2c469d8beb30f536a6465a3350c647ccd260ec2 AS uv-bin

# ---------- dev ----------
# No UV_SYSTEM_PYTHON here: uv creates /app/.venv so the api_venv named volume
# in docker-compose.dev.yml is seeded from the image on first use, preventing
# the host Windows .venv from leaking in through the source mount.
FROM base AS dev
COPY --from=uv-bin /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
# Source is volume-mounted; CMD is set in docker-compose.yml.

# ---------- production dependencies ----------
FROM base AS deps
COPY --from=uv-bin /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---------- production runtime ----------
FROM base AS prod
RUN addgroup -S -g 101 app \
    && adduser -S -D -H -u 100 -G app app

COPY --from=deps --chown=app:app /app/.venv /app/.venv
COPY --chown=app:app . .

USER app
ENV PATH="/app/.venv/bin:${PATH}"
