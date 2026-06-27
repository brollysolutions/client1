# Plan: Add PgBouncer to Docker Compose (dev + prod)

## Context

Current compose files have postgres, redis, api, scheduler, web. PgBouncer is missing.
FastAPI uses asyncpg (async), which opens many connections under load. PgBouncer in
**transaction mode** pools those connections, reducing PostgreSQL load — critical for production.
Without it, each API worker holds a long-lived asyncpg connection directly to Postgres.

## Approach

Add a `pgbouncer` service to all three compose files. API and scheduler connect to
`pgbouncer:5432` instead of `postgres:5432`. PgBouncer sits between app and database:

```
api / scheduler → pgbouncer:5432 → postgres:5432
```

Image: `edoburu/pgbouncer:1.23.1` — env-var-configured, no config file needed, widely used.
Pool mode: `transaction` — required for asyncpg compatibility.

> **asyncpg prepared-statement caveat**: transaction mode breaks asyncpg's default prepared
> statement cache. When wiring the `DATABASE_URL` in `.env.local`, set
> `statement_cache_size=0` in the asyncpg connect args (SQLAlchemy:
> `create_async_engine(url, connect_args={"statement_cache_size": 0})`).

## Files to Change

### 1. `docker-compose.yml` (base)

Add `pgbouncer` service after `redis`:

```yaml
pgbouncer:
  image: edoburu/pgbouncer:1.23.1
  environment:
    DB_HOST: postgres
    DB_PORT: "5432"
    DB_USER: app
    DB_PASSWORD: app
    DB_NAME: app
    POOL_MODE: transaction
    MAX_CLIENT_CONN: "100"
    DEFAULT_POOL_SIZE: "20"
  ports:
    - "5433:5432"   # host 5433 → pgbouncer; postgres stays at 5432 for migrations/psql
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 5432 -U app"]
    interval: 5s
    timeout: 5s
    retries: 10
```

Change `api` and `scheduler` `depends_on` — replace `postgres` condition with `pgbouncer`:

```yaml
depends_on:
  pgbouncer:
    condition: service_healthy
  redis:
    condition: service_healthy
```

(PgBouncer already waits for postgres healthy — no need to duplicate.)

### 2. `docker-compose.dev.yml` (dev overrides)

Add pgbouncer dev override block:

```yaml
pgbouncer:
  environment:
    MAX_CLIENT_CONN: "50"
    DEFAULT_POOL_SIZE: "10"
  restart: unless-stopped
```

### 3. `docker-compose.prod.example.yml` (prod template)

Add `pgbouncer` service after `redis`:

```yaml
pgbouncer:
  image: edoburu/pgbouncer:1.23.1
  environment:
    DB_HOST: postgres
    DB_PORT: "5432"
    DB_USER: ${POSTGRES_USER}
    DB_PASSWORD: ${POSTGRES_PASSWORD}
    DB_NAME: ${POSTGRES_DB}
    POOL_MODE: transaction
    MAX_CLIENT_CONN: "200"
    DEFAULT_POOL_SIZE: "40"
    SERVER_RESET_QUERY: "DISCARD ALL"
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 5432 -U ${POSTGRES_USER}"]
    interval: 10s
    timeout: 5s
    retries: 5
  restart: always
```

Change `api` and `scheduler` `depends_on` — replace `postgres` with `pgbouncer`:

```yaml
depends_on:
  pgbouncer:
    condition: service_healthy
  redis:
    condition: service_healthy
```

No host port exposed in prod (nginx is the external entry point).

## Not Changed

- Dockerfiles (don't exist yet — greenfield scaffold)
- `.env.local` / `.env.prod` (gitignored; note for developer: `DATABASE_URL` must point to
  `postgresql+asyncpg://app:app@pgbouncer:5432/app` not postgres directly)
- Redis config, nginx, web service — untouched

## Verification

```bash
# Bring up datastores only (Dockerfiles not yet written):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres redis pgbouncer

# Confirm pgbouncer healthy:
docker compose ps pgbouncer

# Connect through pgbouncer from host (port 5433):
psql -h localhost -p 5433 -U app -d app

# Confirm api/scheduler would start in correct order (dry-run):
docker compose -f docker-compose.yml -f docker-compose.dev.yml config --services
```
