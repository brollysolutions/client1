"""leads: backfill JSON-null requirement rows back to true SQL NULL

Revision ID: 362b7d859686
Revises: a9b8c7d6e5f4
Create Date: 2026-07-24 17:55:58.144735

Data-only backfill, not a schema change. Companion to the same-commit fix in
app/models/lead.py (Lead.requirement now declares JSONB(none_as_null=True)).

Root cause: SQLAlchemy's JSONB defaults to none_as_null=False, so every prior
Python `requirement=None` write (the normal case at register/login/forgot,
none of which pass a requirement) was bound as the JSON literal `null`, not
SQL NULL. That broke capture_lead's ON CONFLICT DO UPDATE merge
(services/leads.py): `stmt.excluded.requirement.is_(None)` only matches SQL
NULL, so a stored JSON-null row always fell through to the merge branch, and
`'null'::jsonb || 'null'::jsonb` produces the malformed array `[null, null]`
instead of leaving the row untouched.

The model fix (this same commit) stops any NEW Python None from being bound
as JSON null, but it cannot rewrite bytes already sitting in Postgres — any
row whose very first capture never passed a requirement already holds JSON
`null` today and would still corrupt on its next merge. This migration
normalizes those rows back to true SQL NULL.

The WHERE clause targets ONLY the scalar JSON-null case (`requirement =
'null'::jsonb`). It intentionally does not touch arrays or objects, so it
cannot destroy a real stored requirement dict — including a row already
corrupted into something like `[null, {"real": "dict"}]` by this same bug;
repairing that shape would mean guessing which array elements were genuine
data, which isn't safe to automate and is left as a separate follow-up.

downgrade() is a documented no-op: a JSON-null scalar and SQL NULL both mean
"no requirement was ever set," so converting one to the other loses no
information, and after the fact there is no way to tell which rows were
"originally true NULL" versus "originally JSON-null due to the bug" — so
there is nothing meaningful to reverse.

Scale note (explicit judgment call, not silent): this runs as a SINGLE
unbatched UPDATE rather than chunked/id-range batches. Deliberate for now:
this is a one-time backfill (not a recurring job), the dev DB currently has
~6.5k matching rows (SELECT count(*) FROM leads WHERE requirement =
'null'::jsonb), and the product is pre-launch — no production-scale `leads`
table exists yet to worry about lock duration or replication lag from a
single-statement UPDATE. Revisit if `leads` grows past ~100k rows in any
environment before this migration has run there: at that point, chunk into
id-range batches with separate commits (e.g. `WHERE id BETWEEN :lo AND :hi`
in a loop) instead of running this as-is, to bound lock hold time and avoid
a single long-running transaction.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "362b7d859686"
down_revision: str | Sequence[str] | None = "a9b8c7d6e5f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Single unbatched statement — see "Scale note" in the module docstring.
    # Acceptable at current (~6.5k row) / pre-launch scale; revisit with
    # id-range batching if `leads` exceeds ~100k rows before this has run.
    op.execute("UPDATE leads SET requirement = NULL WHERE requirement = 'null'::jsonb")


def downgrade() -> None:
    # No-op by design — see module docstring. A JSON-null scalar and SQL NULL
    # are semantically identical ("no requirement set"); there is no reverse
    # transformation that recovers information, and none is needed.
    pass
