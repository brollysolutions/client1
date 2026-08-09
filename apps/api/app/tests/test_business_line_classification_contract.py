"""Database-independent coverage for the business-line classification ledger."""

from app.core.business_line_classification import (
    MANAGED_MEDIA_CLASSIFICATION,
    OPERATIONAL_BUSINESS_LINES,
    TABLE_CLASSIFICATION,
    ClassificationMode,
)
from app.db.base import Base

_DIRECT_LINE_MODES = {
    ClassificationMode.OPERATIONAL,
    ClassificationMode.FIXED_LOANS,
    ClassificationMode.FIXED_REAL_ESTATE,
    ClassificationMode.GLOBAL_CONTENT,
    ClassificationMode.OPTIONAL_AUDIT,
    ClassificationMode.PROFILE_SCOPE,
    ClassificationMode.STAGED_REFERRAL,
}


def test_every_mapped_table_has_a_classification_contract() -> None:
    assert set(TABLE_CLASSIFICATION) == set(Base.metadata.tables)


def test_direct_classifications_match_model_columns_and_nullability() -> None:
    for table_name, mode in TABLE_CLASSIFICATION.items():
        table = Base.metadata.tables[table_name]
        line = table.columns.get("business_line")
        if mode in _DIRECT_LINE_MODES:
            assert line is not None, f"{table_name} must carry business_line"
        else:
            assert line is None, f"{table_name} must derive or omit business_line"

        if mode in {
            ClassificationMode.OPERATIONAL,
            ClassificationMode.FIXED_LOANS,
            ClassificationMode.FIXED_REAL_ESTATE,
        }:
            assert line is not None and not line.nullable, (
                f"{table_name}.business_line must be required at creation"
            )


def test_operational_values_exclude_identity_only_both_claim() -> None:
    assert {"loans", "real_estate"} == OPERATIONAL_BUSINESS_LINES
    assert "both" not in OPERATIONAL_BUSINESS_LINES


def test_every_managed_media_table_has_an_owner_classification() -> None:
    assert set(MANAGED_MEDIA_CLASSIFICATION) == {
        "loan_documents",
        "property_submission_media",
        "property_media",
        "task_feedback_media",
    }
    for table_name, (line, owner_table) in MANAGED_MEDIA_CLASSIFICATION.items():
        assert table_name in TABLE_CLASSIFICATION
        assert owner_table in TABLE_CLASSIFICATION
        assert line in OPERATIONAL_BUSINESS_LINES or line == "derived"
