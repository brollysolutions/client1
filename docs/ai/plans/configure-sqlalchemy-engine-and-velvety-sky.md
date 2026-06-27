# Plan — Configure SQLAlchemy Engine & Session

## Context

The FastAPI backend (`apps/api`) is a greenfield scaffold. `app/db/` holds only a
`.gitkeep` — there is **no engine, session factory, declarative Base, or `get_db`
dependency**. Nothing can talk to Postgres yet, and models have no `Base` to inherit.

This task builds the async DB foundation so models, services, migrations, and routes
have a connection layer to build on. The layer must respect two hard product constraints:

1. **pgBouncer transaction pooling.** The api connects *through* pgBouncer
   (`pgbouncer:5432`, `POOL_MODE: transaction`), never directly to Postgres. asyncpg's
   prepared-statement behaviour breaks under transaction pooling unless disabled — the
   classic `prepared statement "__asyncpg_stmt_x__" does not exist` error. `config.py:18`
   already flags that `statement_cache_size=0` must be wired here.
2. **RLS context per request.** Auth later injects
   `SET LOCAL app.user_uuid / app.role / app.business_line` inside the request
   transaction (`Auth_System_Design.md` §13). This task does **not** implement RLS
   injection (no auth yet), but `get_db` must be shaped so an RLS-aware dependency drops
   in cleanly on top of it.

Outcome: importable `engine`, `AsyncSessionLocal`, `get_db`, and `Base` — pgBouncer-safe,
env-tunable, ready for models and the auth RLS layer.

## Approach

Async SQLAlchemy 2.0. QueuePool (default async pool) for tunable app-side pooling, plus
the asyncpg connect_args that make it correct behind pgBouncer transaction mode.

### 1. `apps/api/app/core/config.py` — extend `Settings`

- **Fix default** `DATABASE_URL` to match docker-compose + `.env.example`:
  `postgresql+asyncpg://app:app@pgbouncer:5432/app` (real value still from `.env.local`).
- Add env-tunable pool knobs (placed near the Database block):
  - `DB_ECHO: bool = False`
  - `DB_POOL_SIZE: int = 5`
  - `DB_MAX_OVERFLOW: int = 10`
  - `DB_POOL_RECYCLE: int = 1800`  # seconds; recycle below pgBouncer/Postgres idle timeouts

### 2. `apps/api/app/db/base.py` — declarative Base (new)

```python
from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Stable constraint names → clean Alembic autogenerate diffs.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
```

### 3. `apps/api/app/db/session.py` — engine + sessionmaker + dependency (new)

Engine — QueuePool + asyncpg pgBouncer-safety args (root-cause fix, per SQLAlchemy 2.0
asyncpg/pgBouncer docs):

```python
from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,          # detect pgBouncer/server restarts before use
    connect_args={
        # pgBouncer transaction mode: a pooled client conn may hit different
        # Postgres backends across transactions. Disable asyncpg's prepared-
        # statement cache and give each statement a unique name so no name is
        # ever reused against a backend that doesn't hold it.
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,      # access ORM attrs after commit (async-friendly)
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a session, rolls back on error, always closes.

    Commit is the caller's responsibility (service layer / explicit commit).
    The future RLS-aware dependency wraps this to issue
    `SET LOCAL app.user_uuid/role/business_line` as the transaction's first
    statement before any business query.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
```

### 4. `apps/api/app/db/__init__.py` — re-exports (new)

Export `Base`, `engine`, `AsyncSessionLocal`, `get_db` with `__all__` so callers use
`from app.db import get_db, Base`.

### 5. `apps/api/.env.example` — document new knobs

Under the Database block add:
```
DB_ECHO=false
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
DB_POOL_RECYCLE=1800
```
(Optional, not in this task: `docker-compose.dev.yml` may set `DB_ECHO=true` for SQL logging.)

## Design notes / decisions

- **QueuePool vs NullPool.** The textbook pgBouncer recipe is `NullPool` (let pgBouncer
  own all pooling). We use QueuePool instead because you opted for tunable app-side pool
  settings, and it cuts client→pgBouncer connect latency. Correctness behind transaction
  mode is preserved by the unique `prepared_statement_name_func` + disabled caches — the
  *actual* root cause of the asyncpg/pgBouncer prepared-statement bug. **Fallback:** if
  prepared-statement errors or connection-count pressure (pgBouncer `MAX_CLIENT_CONN: 100`
  vs workers × pool_size) ever appear, switch `session.py` to `poolclass=NullPool` and
  drop the pool_size/overflow args — a one-line change isolated to the engine.
- **No RLS here.** `SET LOCAL` injection needs JWT claims (auth not built). `get_db` is
  the plain provider; RLS layers on top later. Out of scope by design.
- **No Alembic here.** Migration infra (`alembic.ini`, `env.py`) is a separate task; it
  will import this `Base.metadata` as its target.
- **expire_on_commit=False** is required for async — avoids implicit lazy-load (I/O) on
  attribute access after commit.

## Files

| File | Change |
|------|--------|
| `apps/api/app/core/config.py` | Fix `DATABASE_URL` default; add `DB_ECHO`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_RECYCLE` |
| `apps/api/app/db/base.py` | New — `Base(DeclarativeBase)` + naming convention |
| `apps/api/app/db/session.py` | New — engine, `AsyncSessionLocal`, `get_db` |
| `apps/api/app/db/__init__.py` | New — re-exports |
| `apps/api/.env.example` | Document new DB_* vars |

## Verification

1. **Import/syntax** (no DB needed):
   `cd apps/api && uv run python -c "from app.db import engine, AsyncSessionLocal, get_db, Base; print('ok')"`
2. **Live connectivity** (stack up via docker-compose):
   ```bash
   cd apps/api && uv run python -c "
   import asyncio
   from sqlalchemy import text
   from app.db import AsyncSessionLocal
   async def main():
       async with AsyncSessionLocal() as s:
           print((await s.execute(text('select 1'))).scalar_one())
   asyncio.run(main())
   "
   ```
   Expect `1`. Confirms asyncpg → pgBouncer → Postgres works with the connect_args.
3. **pgBouncer transaction-mode smoke** — run the select-1 check a few times in a loop;
   no `prepared statement ... does not exist` errors = name_func/cache settings correct.
4. `./scripts/verify-api.sh` (or `./scripts/verify.sh --changed`) for lint/type once wired.
