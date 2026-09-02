#!/usr/bin/env python3
"""Fail-closed gate for privacy-minimized production recovery-drill evidence.

The input contains aggregate counts, digests, timestamps, and opaque provider
record IDs only. It must never contain credentials, customer values, object
keys, database rows, or free-form operator notes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
MAX_INPUT_BYTES = 256 * 1024

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$")
_ALEMBIC_REVISION = re.compile(r"^[A-Za-z0-9_]{4,64}$")
_PLACEHOLDER_MARKERS = ("example", "placeholder", "replace", "todo", "tbd")

_SENSITIVE_FIELDS = frozenset(
    {
        "aadhaar",
        "access_key",
        "account_number",
        "address",
        "authorization",
        "cookie",
        "credential",
        "customer",
        "database_url",
        "email",
        "mobile",
        "name",
        "object_key",
        "otp",
        "pan",
        "password",
        "phone",
        "recipient",
        "secret",
        "session",
        "token",
    }
)

_TOP_LEVEL_FIELDS = {
    "schema_version",
    "drill_id",
    "candidate_sha",
    "environment",
    "targets",
    "timing",
    "database",
    "objects",
    "controls",
    "evidence",
}
_TARGET_FIELDS = {"rpo_minutes", "rto_minutes", "max_component_skew_minutes"}
_TIMING_FIELDS = {
    "drill_started_at",
    "database_recovery_point_at",
    "object_recovery_point_at",
    "verified_at",
}
_DATABASE_FIELDS = {
    "artifact_id",
    "artifact_sha256",
    "integrity_check_passed",
    "required_roles_recreated",
    "expected",
    "restored",
}
_DATABASE_SUMMARY_FIELDS = {
    "alembic_heads",
    "table_count",
    "total_row_count",
    "schema_manifest_sha256",
    "row_count_manifest_sha256",
    "critical_record_manifest_sha256",
    "grant_manifest_sha256",
    "rls_policy_manifest_sha256",
    "rls_policy_count",
    "rls_enabled_relation_count",
}
_OBJECT_FIELDS = {
    "artifact_id",
    "backup_manifest_sha256",
    "integrity_check_passed",
    "expected",
    "restored",
}
_OBJECT_SUMMARY_FIELDS = {
    "object_count",
    "total_bytes",
    "content_manifest_sha256",
    "content_type_manifest_sha256",
    "database_reference_count",
    "missing_database_reference_count",
}
_CONTROL_FIELDS = {
    "backup_identity_separate",
    "restore_identity_separate",
    "restore_isolated",
    "production_writes_blocked",
    "external_side_effects_blocked",
    "restored_objects_private",
    "database_encrypted",
    "objects_encrypted",
    "restore_access_audited",
    "retention_configured",
    "deletion_protection_enabled",
    "off_host_copy",
    "off_account_or_region_copy",
}
_EVIDENCE_FIELDS = {
    "recovery_policy",
    "database_backup_job",
    "object_backup_job",
    "restore_run",
    "access_audit",
    "protection_control_audit",
    "reconciliation_report",
}


class _Validator:
    def __init__(self) -> None:
        self.failures: set[str] = set()

    def mapping(self, value: Any, scope: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            self.failures.add(f"{scope}.must_be_object")
            return {}
        return value

    def exact_fields(self, value: dict[str, Any], expected: set[str], scope: str) -> None:
        actual = set(value)
        if actual - expected:
            self.failures.add(f"{scope}.unknown_fields")
        for field in expected - actual:
            self.failures.add(f"{scope}.missing_{field}")

    def integer(
        self,
        value: Any,
        code: str,
        *,
        minimum: int = 0,
        maximum: int = 2**63 - 1,
    ) -> int | None:
        if isinstance(value, bool) or not isinstance(value, int):
            self.failures.add(f"{code}.must_be_integer")
            return None
        if not minimum <= value <= maximum:
            self.failures.add(f"{code}.out_of_range")
            return None
        return value

    def required_true(self, value: Any, code: str) -> None:
        if value is not True:
            self.failures.add(f"{code}.must_be_true")

    def sha256(self, value: Any, code: str) -> None:
        if not isinstance(value, str) or not _SHA256.fullmatch(value):
            self.failures.add(f"{code}.invalid")
            return
        if len(set(value)) == 1:
            self.failures.add(f"{code}.placeholder")

    def safe_id(self, value: Any, code: str) -> bool:
        if not isinstance(value, str) or not _SAFE_ID.fullmatch(value):
            self.failures.add(f"{code}.invalid")
            return False
        if any(marker in value.casefold() for marker in _PLACEHOLDER_MARKERS):
            self.failures.add(f"{code}.placeholder")
            return False
        return True

    def timestamp(self, value: Any, code: str) -> datetime | None:
        if not isinstance(value, str) or value != value.strip():
            self.failures.add(f"{code}.invalid")
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            self.failures.add(f"{code}.invalid")
            return None
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            self.failures.add(f"{code}.timezone_required")
            return None
        if parsed.utcoffset().total_seconds() != 0 or not value.endswith("Z"):
            self.failures.add(f"{code}.must_be_utc")
            return None
        return parsed


def _normalized_field_name(value: Any) -> str:
    with_word_boundaries = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(value))
    return re.sub(r"[^a-z0-9]+", "_", with_word_boundaries.casefold()).strip("_")


def _is_sensitive_field(value: Any) -> bool:
    normalized = _normalized_field_name(value)
    return any(
        normalized == field
        or normalized.startswith(f"{field}_")
        or normalized.endswith(f"_{field}")
        or f"_{field}_" in normalized
        for field in _SENSITIVE_FIELDS
    )


def _contains_sensitive_field(value: Any) -> bool:
    pending = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, dict):
            for field, child in current.items():
                if _is_sensitive_field(field):
                    return True
                pending.append(child)
        elif isinstance(current, list):
            pending.extend(current)
    return False


def _record_sha256(value: Any) -> str | None:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError):
        return None
    return hashlib.sha256(encoded).hexdigest()


def _reject_duplicate_fields(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for field, child in pairs:
        if field in value:
            raise ValueError("duplicate JSON field")
        value[field] = child
    return value


def _validate_database_summary(
    validator: _Validator,
    raw: Any,
    scope: str,
) -> dict[str, Any]:
    summary = validator.mapping(raw, scope)
    validator.exact_fields(summary, _DATABASE_SUMMARY_FIELDS, scope)

    heads = summary.get("alembic_heads")
    if not isinstance(heads, list) or len(heads) != 1:
        validator.failures.add(f"{scope}.alembic_heads.must_have_exactly_one")
    elif not isinstance(heads[0], str) or not _ALEMBIC_REVISION.fullmatch(heads[0]):
        validator.failures.add(f"{scope}.alembic_heads.invalid")
    elif len(set(heads[0])) == 1 or any(
        marker in heads[0].casefold() for marker in _PLACEHOLDER_MARKERS
    ):
        validator.failures.add(f"{scope}.alembic_heads.placeholder")

    table_count = validator.integer(summary.get("table_count"), f"{scope}.table_count", minimum=1)
    validator.integer(summary.get("total_row_count"), f"{scope}.total_row_count", minimum=1)
    validator.integer(summary.get("rls_policy_count"), f"{scope}.rls_policy_count", minimum=1)
    rls_enabled_count = validator.integer(
        summary.get("rls_enabled_relation_count"),
        f"{scope}.rls_enabled_relation_count",
        minimum=1,
    )
    if (
        table_count is not None
        and rls_enabled_count is not None
        and rls_enabled_count > table_count
    ):
        validator.failures.add(f"{scope}.rls_enabled_relations_exceed_tables")
    validator.sha256(
        summary.get("schema_manifest_sha256"),
        f"{scope}.schema_manifest_sha256",
    )
    validator.sha256(
        summary.get("row_count_manifest_sha256"),
        f"{scope}.row_count_manifest_sha256",
    )
    validator.sha256(
        summary.get("critical_record_manifest_sha256"),
        f"{scope}.critical_record_manifest_sha256",
    )
    validator.sha256(
        summary.get("grant_manifest_sha256"),
        f"{scope}.grant_manifest_sha256",
    )
    validator.sha256(
        summary.get("rls_policy_manifest_sha256"),
        f"{scope}.rls_policy_manifest_sha256",
    )
    return summary


def _validate_object_summary(
    validator: _Validator,
    raw: Any,
    scope: str,
) -> dict[str, Any]:
    summary = validator.mapping(raw, scope)
    validator.exact_fields(summary, _OBJECT_SUMMARY_FIELDS, scope)

    object_count = validator.integer(summary.get("object_count"), f"{scope}.object_count")
    total_bytes = validator.integer(summary.get("total_bytes"), f"{scope}.total_bytes")
    reference_count = validator.integer(
        summary.get("database_reference_count"),
        f"{scope}.database_reference_count",
    )
    missing_count = validator.integer(
        summary.get("missing_database_reference_count"),
        f"{scope}.missing_database_reference_count",
    )
    validator.sha256(
        summary.get("content_manifest_sha256"),
        f"{scope}.content_manifest_sha256",
    )
    validator.sha256(
        summary.get("content_type_manifest_sha256"),
        f"{scope}.content_type_manifest_sha256",
    )

    if (
        object_count is not None
        and total_bytes is not None
        and object_count > 0
        and total_bytes == 0
    ):
        validator.failures.add(f"{scope}.nonempty_objects_require_bytes")
    if (
        object_count is not None
        and total_bytes is not None
        and object_count == 0
        and total_bytes != 0
    ):
        validator.failures.add(f"{scope}.empty_objects_require_zero_bytes")
    if object_count is not None and reference_count is not None and reference_count > object_count:
        validator.failures.add(f"{scope}.references_exceed_objects")
    if missing_count is not None and missing_count != 0:
        validator.failures.add(f"{scope}.missing_database_references")
    return summary


def assess_evidence(
    raw: Any,
    *,
    expected_candidate_sha: str,
    expected_alembic_head: str,
) -> dict[str, Any]:
    """Return a privacy-safe PASS/NO-GO assessment without echoing input values."""

    validator = _Validator()
    if _contains_sensitive_field(raw):
        validator.failures.add("privacy.sensitive_field_present")

    record = validator.mapping(raw, "record")
    validator.exact_fields(record, _TOP_LEVEL_FIELDS, "record")

    if record.get("schema_version") != SCHEMA_VERSION:
        validator.failures.add("record.schema_version.unsupported")

    drill_id = record.get("drill_id")
    drill_id_valid = validator.safe_id(drill_id, "record.drill_id")
    candidate_sha = record.get("candidate_sha")
    candidate_sha_valid = False
    expected_candidate_valid = (
        bool(_COMMIT_SHA.fullmatch(expected_candidate_sha)) and len(set(expected_candidate_sha)) > 1
    )
    if not expected_candidate_valid:
        validator.failures.add("gate.expected_candidate_sha.invalid")
    if not isinstance(candidate_sha, str) or not _COMMIT_SHA.fullmatch(candidate_sha):
        validator.failures.add("record.candidate_sha.invalid")
    elif len(set(candidate_sha)) == 1:
        validator.failures.add("record.candidate_sha.placeholder")
    else:
        candidate_sha_valid = True
        if expected_candidate_valid and candidate_sha != expected_candidate_sha:
            validator.failures.add("record.candidate_sha.mismatch")

    expected_head_valid = (
        bool(_ALEMBIC_REVISION.fullmatch(expected_alembic_head))
        and len(set(expected_alembic_head)) > 1
        and not any(marker in expected_alembic_head.casefold() for marker in _PLACEHOLDER_MARKERS)
    )
    if not expected_head_valid:
        validator.failures.add("gate.expected_alembic_head.invalid")

    if record.get("environment") != "production":
        validator.failures.add("record.environment.must_be_production")

    targets = validator.mapping(record.get("targets"), "targets")
    validator.exact_fields(targets, _TARGET_FIELDS, "targets")
    rpo_target = validator.integer(
        targets.get("rpo_minutes"), "targets.rpo_minutes", minimum=1, maximum=10080
    )
    rto_target = validator.integer(
        targets.get("rto_minutes"), "targets.rto_minutes", minimum=1, maximum=10080
    )
    skew_target = validator.integer(
        targets.get("max_component_skew_minutes"),
        "targets.max_component_skew_minutes",
        maximum=1440,
    )

    timing = validator.mapping(record.get("timing"), "timing")
    validator.exact_fields(timing, _TIMING_FIELDS, "timing")
    started = validator.timestamp(timing.get("drill_started_at"), "timing.drill_started_at")
    database_point = validator.timestamp(
        timing.get("database_recovery_point_at"),
        "timing.database_recovery_point_at",
    )
    object_point = validator.timestamp(
        timing.get("object_recovery_point_at"),
        "timing.object_recovery_point_at",
    )
    verified = validator.timestamp(timing.get("verified_at"), "timing.verified_at")

    achieved: dict[str, float] = {}
    if started and database_point and object_point and verified:
        if database_point > started or object_point > started or verified < started:
            validator.failures.add("timing.invalid_order")
        else:
            database_gap = (started - database_point).total_seconds()
            object_gap = (started - object_point).total_seconds()
            achieved_rpo = max(database_gap, object_gap) / 60
            achieved_rto = (verified - started).total_seconds() / 60
            achieved_skew = abs((database_point - object_point).total_seconds()) / 60
            achieved = {
                "rpo_minutes": round(achieved_rpo, 3),
                "rto_minutes": round(achieved_rto, 3),
                "component_skew_minutes": round(achieved_skew, 3),
            }
            if rpo_target is not None and achieved_rpo > rpo_target:
                validator.failures.add("targets.rpo_exceeded")
            if rto_target is not None and achieved_rto > rto_target:
                validator.failures.add("targets.rto_exceeded")
            if skew_target is not None and achieved_skew > skew_target:
                validator.failures.add("targets.component_skew_exceeded")

    database = validator.mapping(record.get("database"), "database")
    validator.exact_fields(database, _DATABASE_FIELDS, "database")
    validator.safe_id(database.get("artifact_id"), "database.artifact_id")
    validator.sha256(database.get("artifact_sha256"), "database.artifact_sha256")
    validator.required_true(
        database.get("integrity_check_passed"), "database.integrity_check_passed"
    )
    validator.required_true(
        database.get("required_roles_recreated"), "database.required_roles_recreated"
    )
    expected_database = _validate_database_summary(
        validator, database.get("expected"), "database.expected"
    )
    restored_database = _validate_database_summary(
        validator, database.get("restored"), "database.restored"
    )
    if expected_database != restored_database:
        validator.failures.add("database.reconciliation_mismatch")
    if expected_head_valid and (
        expected_database.get("alembic_heads") != [expected_alembic_head]
        or restored_database.get("alembic_heads") != [expected_alembic_head]
    ):
        validator.failures.add("database.alembic_head_mismatch")

    objects = validator.mapping(record.get("objects"), "objects")
    validator.exact_fields(objects, _OBJECT_FIELDS, "objects")
    validator.safe_id(objects.get("artifact_id"), "objects.artifact_id")
    validator.sha256(objects.get("backup_manifest_sha256"), "objects.backup_manifest_sha256")
    validator.required_true(objects.get("integrity_check_passed"), "objects.integrity_check_passed")
    expected_objects = _validate_object_summary(
        validator, objects.get("expected"), "objects.expected"
    )
    restored_objects = _validate_object_summary(
        validator, objects.get("restored"), "objects.restored"
    )
    if expected_objects != restored_objects:
        validator.failures.add("objects.reconciliation_mismatch")

    controls = validator.mapping(record.get("controls"), "controls")
    validator.exact_fields(controls, _CONTROL_FIELDS, "controls")
    for field in _CONTROL_FIELDS:
        validator.required_true(controls.get(field), f"controls.{field}")

    evidence = validator.mapping(record.get("evidence"), "evidence")
    validator.exact_fields(evidence, _EVIDENCE_FIELDS, "evidence")
    for field in _EVIDENCE_FIELDS:
        validator.safe_id(evidence.get(field), f"evidence.{field}")
    if database.get("artifact_id") != evidence.get("database_backup_job"):
        validator.failures.add("evidence.database_backup_job.mismatch")
    if objects.get("artifact_id") != evidence.get("object_backup_job"):
        validator.failures.add("evidence.object_backup_job.mismatch")

    record_sha256 = None
    if not validator.failures:
        record_sha256 = _record_sha256(raw)
        if record_sha256 is None:
            validator.failures.add("record.not_json_compatible")
    failures = sorted(validator.failures)
    return {
        "schema_version": SCHEMA_VERSION,
        "status": "PASS" if not failures else "NO-GO",
        "identity": {
            **({"drill_id": drill_id} if drill_id_valid else {}),
            **({"candidate_sha": candidate_sha} if candidate_sha_valid else {}),
        },
        "evidence_record_sha256": record_sha256,
        "achieved": achieved,
        "failures": failures,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--expected-candidate-sha",
        required=True,
        help="Independently obtained 40-character release candidate SHA.",
    )
    parser.add_argument(
        "--expected-alembic-head",
        required=True,
        help="Independently obtained Alembic head for the release candidate.",
    )
    parser.add_argument(
        "evidence_file",
        type=Path,
        help="Privacy-minimized JSON evidence file kept outside Git.",
    )
    parser.add_argument("--compact", action="store_true", help="Emit one-line JSON.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        with args.evidence_file.open("rb") as evidence_stream:
            payload = evidence_stream.read(MAX_INPUT_BYTES + 1)
        if len(payload) > MAX_INPUT_BYTES:
            raise ValueError("input too large")
        raw = json.loads(payload.decode("utf-8"), object_pairs_hook=_reject_duplicate_fields)
    except (OSError, RecursionError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        result = {
            "schema_version": SCHEMA_VERSION,
            "status": "NO-GO",
            "identity": {},
            "evidence_record_sha256": None,
            "achieved": {},
            "failures": ["input.unreadable_or_invalid_json"],
        }
        print(
            json.dumps(
                result,
                separators=(",", ":") if args.compact else None,
                indent=None if args.compact else 2,
            )
        )
        return 2

    result = assess_evidence(
        raw,
        expected_candidate_sha=args.expected_candidate_sha,
        expected_alembic_head=args.expected_alembic_head,
    )
    print(
        json.dumps(
            result,
            separators=(",", ":") if args.compact else None,
            indent=None if args.compact else 2,
            sort_keys=True,
        )
    )
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
