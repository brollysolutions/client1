"""staff_profiles: couple platform scope to admin roles

Revision ID: c7d8e9f0a1b2
Revises: 8b2d3c4e5f6a
Create Date: 2026-07-07 00:00:00.000000

Security guard for the RLS platform-scope bypass. `_build_access_claims` maps
StaffProfile.scope == 'platform' to the JWT claim app.platform_scope == 'true',
which every RLS policy treats as a full bypass (read/write across both lines,
including staff_profiles itself). Nothing else enforced that only admin-tier
staff may hold platform scope, so a single mis-scoped row (e.g. a telecaller with
scope='platform') would have become a full-access, self-escalating token.

This adds a table CHECK so scope='platform' is only permitted for role IN
('admin','sub_admin'); line staff (telecaller, employee) are pinned to
scope='line'. A plain ALTER TABLE ADD CONSTRAINT — no enum DDL / RLS / GRANT, so
it runs fine through pgBouncer.

Rollback: drop the constraint (downgrade). Pre-existing rows that violate the
predicate would block the upgrade; staff_profiles is expected empty at rollout.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: str | Sequence[str] | None = "8b2d3c4e5f6a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CK = "ck_staff_profiles_platform_scope_admin_only"


def upgrade() -> None:
    # Raw SQL (not op.create_check_constraint) so the metadata naming convention
    # does not prepend a second "ck_staff_profiles_" to the name.
    op.execute(
        f"ALTER TABLE staff_profiles ADD CONSTRAINT {_CK} "
        "CHECK (scope::text <> 'platform' OR role::text IN ('admin', 'sub_admin'))"
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE staff_profiles DROP CONSTRAINT {_CK}")
