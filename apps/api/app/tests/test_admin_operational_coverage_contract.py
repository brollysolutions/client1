"""Static contract for exhaustive, least-privilege Admin operational coverage."""

from app.core.admin_operational_coverage import (
    ADMIN_OPERATIONAL_COVERAGE,
    FR_2_2_DOMAIN_TABLES,
    AdminUpdateMode,
    AdminViewMode,
    CoverageState,
    DataSensitivity,
)
from app.db.base import Base


def test_every_mapped_table_has_an_admin_coverage_decision() -> None:
    assert set(ADMIN_OPERATIONAL_COVERAGE) == set(Base.metadata.tables)


def test_every_fr_2_2_domain_maps_to_current_tables() -> None:
    assert set(FR_2_2_DOMAIN_TABLES) == {
        "record",
        "user",
        "workflow",
        "product",
        "listing",
        "bank",
        "banner",
        "offer",
        "referral",
        "notification",
        "report",
    }
    for tables in FR_2_2_DOMAIN_TABLES.values():
        assert tables
        assert set(tables) <= set(ADMIN_OPERATIONAL_COVERAGE)


def test_gaps_are_explicit_and_actionable() -> None:
    for entry in ADMIN_OPERATIONAL_COVERAGE.values():
        states = {entry.view_coverage, entry.update_coverage, entry.audit_coverage}
        if CoverageState.GAP in states:
            assert entry.gap is not None and entry.gap.startswith("Gap:")
        else:
            assert entry.gap is None


def test_observed_account_tombstone_failure_remains_a_declared_gap() -> None:
    account = ADMIN_OPERATIONAL_COVERAGE["auth_users"]
    assert account.view_coverage is CoverageState.GAP
    assert account.gap is not None and "tombstone email" in account.gap


def test_protected_secrets_and_location_are_not_full_admin_views() -> None:
    protected = {
        DataSensitivity.KYC,
        DataSensitivity.PRIVATE_MEDIA,
        DataSensitivity.SESSION_SECRET,
        DataSensitivity.PUSH_SECRET,
        DataSensitivity.PRECISE_LOCATION,
        DataSensitivity.STORAGE_KEY,
    }
    for entry in ADMIN_OPERATIONAL_COVERAGE.values():
        if entry.sensitivity & protected:
            assert entry.view_mode is not AdminViewMode.FULL


def test_reusable_secret_tables_have_no_admin_projection() -> None:
    reusable_secrets = {DataSensitivity.SESSION_SECRET, DataSensitivity.PUSH_SECRET}
    for entry in ADMIN_OPERATIONAL_COVERAGE.values():
        if entry.sensitivity & reusable_secrets:
            assert entry.view_mode is AdminViewMode.PROHIBITED
            assert entry.view_coverage is CoverageState.PROTECTED
            assert entry.api_surfaces == ()
            assert entry.ui_surfaces == ()


def test_mutation_claims_are_command_bound_and_audited_or_gap_marked() -> None:
    mutating = {
        AdminUpdateMode.CONFIGURATION_COMMAND,
        AdminUpdateMode.STATUS_COMMAND,
        AdminUpdateMode.WORKFLOW_COMMAND,
    }
    for entry in ADMIN_OPERATIONAL_COVERAGE.values():
        if entry.update_mode not in mutating:
            continue
        assert entry.api_surfaces
        assert entry.update_coverage in {CoverageState.COVERED, CoverageState.GAP}
        assert entry.audit_coverage in {CoverageState.COVERED, CoverageState.GAP}


def test_declared_surfaces_are_canonical_local_paths() -> None:
    for entry in ADMIN_OPERATIONAL_COVERAGE.values():
        assert entry.domain.strip()
        assert entry.rationale.strip()
        assert entry.rls_expectation.strip()
        assert entry.audit_expectation.strip()
        assert all(path.startswith("/api/v1/") for path in entry.api_surfaces)
        assert all(path.startswith("/dashboard") for path in entry.ui_surfaces)
        if entry.view_mode is AdminViewMode.PROHIBITED:
            assert entry.view_coverage is CoverageState.PROTECTED
            assert entry.ui_surfaces == ()
