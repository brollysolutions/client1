from __future__ import annotations

import copy
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_recovery_evidence.py"
SPEC = importlib.util.spec_from_file_location("check_recovery_evidence", MODULE_PATH)
assert SPEC and SPEC.loader
RECOVERY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = RECOVERY
SPEC.loader.exec_module(RECOVERY)

SHA_A = "0123456789abcdef" * 4
SHA_B = "123456789abcdef0" * 4
SHA_C = "23456789abcdef01" * 4
SHA_D = "3456789abcdef012" * 4
SHA_E = "456789abcdef0123" * 4
SHA_F = "56789abcdef01234" * 4
SHA_G = "6789abcdef012345" * 4
SHA_H = "789abcdef0123456" * 4
SHA_I = "89abcdef01234567" * 4
CANDIDATE_SHA = "742449afa71453953617c86b9d7f9d2c3e1a39ce"
ALEMBIC_HEAD = "d9f1a3b5c7e0"


def valid_record() -> dict:
    database_summary = {
        "alembic_heads": [ALEMBIC_HEAD],
        "table_count": 56,
        "total_row_count": 1280,
        "schema_manifest_sha256": SHA_G,
        "row_count_manifest_sha256": SHA_B,
        "critical_record_manifest_sha256": SHA_C,
        "grant_manifest_sha256": SHA_H,
        "rls_policy_manifest_sha256": SHA_I,
        "rls_policy_count": 111,
        "rls_enabled_relation_count": 54,
    }
    object_summary = {
        "object_count": 240,
        "total_bytes": 987654,
        "content_manifest_sha256": SHA_E,
        "content_type_manifest_sha256": SHA_F,
        "database_reference_count": 220,
        "missing_database_reference_count": 0,
    }
    return {
        "schema_version": 1,
        "drill_id": "recovery-2026-09-02-001",
        "candidate_sha": CANDIDATE_SHA,
        "environment": "production",
        "targets": {
            "rpo_minutes": 15,
            "rto_minutes": 60,
            "max_component_skew_minutes": 5,
        },
        "timing": {
            "drill_started_at": "2026-09-02T12:15:00Z",
            "database_recovery_point_at": "2026-09-02T12:05:00Z",
            "object_recovery_point_at": "2026-09-02T12:07:00Z",
            "verified_at": "2026-09-02T12:40:00Z",
        },
        "database": {
            "artifact_id": "provider:db/job-20260902-001",
            "artifact_sha256": SHA_A,
            "integrity_check_passed": True,
            "required_roles_recreated": True,
            "expected": database_summary,
            "restored": copy.deepcopy(database_summary),
        },
        "objects": {
            "artifact_id": "provider:objects/job-20260902-001",
            "backup_manifest_sha256": SHA_D,
            "integrity_check_passed": True,
            "expected": object_summary,
            "restored": copy.deepcopy(object_summary),
        },
        "controls": {
            "backup_identity_separate": True,
            "restore_identity_separate": True,
            "restore_isolated": True,
            "production_writes_blocked": True,
            "external_side_effects_blocked": True,
            "restored_objects_private": True,
            "database_encrypted": True,
            "objects_encrypted": True,
            "restore_access_audited": True,
            "retention_configured": True,
            "deletion_protection_enabled": True,
            "off_host_copy": True,
            "off_account_or_region_copy": True,
        },
        "evidence": {
            "recovery_policy": "ops:recovery/policy-20260902-001",
            "database_backup_job": "provider:db/job-20260902-001",
            "object_backup_job": "provider:objects/job-20260902-001",
            "restore_run": "ops:restore/run-20260902-001",
            "access_audit": "audit:restore/event-20260902-001",
            "protection_control_audit": "audit:protection/event-20260902-001",
            "reconciliation_report": "ops:reconciliation/report-20260902-001",
        },
    }


def assess(record: dict) -> dict:
    return RECOVERY.assess_evidence(
        record,
        expected_candidate_sha=CANDIDATE_SHA,
        expected_alembic_head=ALEMBIC_HEAD,
    )


def cli_args(evidence_path: Path, *extra: str) -> list[str]:
    return [
        "--expected-candidate-sha",
        CANDIDATE_SHA,
        "--expected-alembic-head",
        ALEMBIC_HEAD,
        str(evidence_path),
        *extra,
    ]


class RecoveryEvidenceTests(unittest.TestCase):
    def test_complete_matching_record_passes_with_calculated_targets(self) -> None:
        result = assess(valid_record())

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["failures"], [])
        self.assertEqual(
            result["identity"],
            {
                "drill_id": "recovery-2026-09-02-001",
                "candidate_sha": CANDIDATE_SHA,
            },
        )
        self.assertRegex(result["evidence_record_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(
            result["achieved"],
            {
                "rpo_minutes": 10.0,
                "rto_minutes": 25.0,
                "component_skew_minutes": 2.0,
            },
        )

    def test_rpo_rto_and_component_skew_fail_closed(self) -> None:
        record = valid_record()
        record["targets"] = {
            "rpo_minutes": 5,
            "rto_minutes": 20,
            "max_component_skew_minutes": 1,
        }

        failures = assess(record)["failures"]

        self.assertIn("targets.rpo_exceeded", failures)
        self.assertIn("targets.rto_exceeded", failures)
        self.assertIn("targets.component_skew_exceeded", failures)

    def test_database_mismatch_fails(self) -> None:
        record = valid_record()
        record["database"]["restored"]["total_row_count"] += 1

        failures = assess(record)["failures"]

        self.assertIn("database.reconciliation_mismatch", failures)

    def test_impossible_database_and_object_summaries_fail(self) -> None:
        record = valid_record()
        record["database"]["expected"]["table_count"] = 50
        record["database"]["restored"]["table_count"] = 50
        for summary in (record["objects"]["expected"], record["objects"]["restored"]):
            summary["object_count"] = 0
            summary["total_bytes"] = 1
            summary["database_reference_count"] = 0

        failures = assess(record)["failures"]

        self.assertIn("database.expected.rls_enabled_relations_exceed_tables", failures)
        self.assertIn("database.restored.rls_enabled_relations_exceed_tables", failures)
        self.assertIn("objects.expected.empty_objects_require_zero_bytes", failures)
        self.assertIn("objects.restored.empty_objects_require_zero_bytes", failures)

    def test_object_mismatch_and_missing_reference_fail(self) -> None:
        record = valid_record()
        record["objects"]["restored"]["object_count"] -= 1
        record["objects"]["restored"]["missing_database_reference_count"] = 1

        failures = assess(record)["failures"]

        self.assertIn("objects.reconciliation_mismatch", failures)
        self.assertIn("objects.restored.missing_database_references", failures)

    def test_any_unproved_control_fails(self) -> None:
        record = valid_record()
        record["controls"]["off_host_copy"] = False

        failures = assess(record)["failures"]

        self.assertIn("controls.off_host_copy.must_be_true", failures)

    def test_sensitive_or_unknown_fields_are_rejected_without_echoing_them(self) -> None:
        record = valid_record()
        record["operator_notes"] = {"customerPassword": "must-not-be-echoed"}

        result = assess(record)
        encoded = json.dumps(result)

        self.assertEqual(result["status"], "NO-GO")
        self.assertIn("privacy.sensitive_field_present", result["failures"])
        self.assertIn("record.unknown_fields", result["failures"])
        self.assertNotIn("must-not-be-echoed", encoded)
        self.assertNotIn("operator_notes", encoded)
        self.assertIsNone(result["evidence_record_sha256"])

    def test_placeholders_and_multiple_alembic_heads_fail(self) -> None:
        record = valid_record()
        record["candidate_sha"] = "0" * 40
        record["database"]["artifact_sha256"] = "a" * 64
        record["database"]["expected"]["alembic_heads"].append("second_head")

        failures = assess(record)["failures"]

        self.assertIn("record.candidate_sha.placeholder", failures)
        self.assertIn("database.artifact_sha256.placeholder", failures)
        self.assertIn("database.expected.alembic_heads.must_have_exactly_one", failures)

    def test_naive_or_out_of_order_timestamps_fail(self) -> None:
        record = valid_record()
        record["timing"]["database_recovery_point_at"] = "2026-09-02T12:05:00"
        record["timing"]["object_recovery_point_at"] = "2026-09-02T12:20:00Z"

        failures = assess(record)["failures"]

        self.assertIn("timing.database_recovery_point_at.timezone_required", failures)

        record["timing"]["database_recovery_point_at"] = "2026-09-02T12:05:00Z"
        failures = assess(record)["failures"]
        self.assertIn("timing.invalid_order", failures)

    def test_non_utc_timestamp_fails(self) -> None:
        record = valid_record()
        record["timing"]["verified_at"] = "2026-09-02T18:10:00+05:30"

        failures = assess(record)["failures"]

        self.assertIn("timing.verified_at.must_be_utc", failures)

    def test_example_template_is_intentionally_no_go(self) -> None:
        example = MODULE_PATH.parents[1] / "infra" / "recovery" / "recovery-evidence.example.json"
        raw = json.loads(example.read_text(encoding="utf-8"))

        self.assertEqual(assess(raw)["status"], "NO-GO")

    def test_external_candidate_and_migration_head_are_binding(self) -> None:
        candidate_result = RECOVERY.assess_evidence(
            valid_record(),
            expected_candidate_sha="1234567890abcdef1234567890abcdef12345678",
            expected_alembic_head=ALEMBIC_HEAD,
        )
        head_result = RECOVERY.assess_evidence(
            valid_record(),
            expected_candidate_sha=CANDIDATE_SHA,
            expected_alembic_head="e4b5c6d7e8f9",
        )

        self.assertIn("record.candidate_sha.mismatch", candidate_result["failures"])
        self.assertIn("database.alembic_head_mismatch", head_result["failures"])

    def test_placeholder_expected_and_recorded_migration_heads_fail(self) -> None:
        record = valid_record()
        record["database"]["expected"]["alembic_heads"] = ["replace_head"]
        record["database"]["restored"]["alembic_heads"] = ["replace_head"]

        result = RECOVERY.assess_evidence(
            record,
            expected_candidate_sha=CANDIDATE_SHA,
            expected_alembic_head="replace_head",
        )

        self.assertIn("gate.expected_alembic_head.invalid", result["failures"])
        self.assertIn("database.expected.alembic_heads.placeholder", result["failures"])
        self.assertIn("database.restored.alembic_heads.placeholder", result["failures"])

    def test_artifacts_must_match_provider_job_evidence(self) -> None:
        record = valid_record()
        record["evidence"]["database_backup_job"] = "provider:db/job-other"
        record["evidence"]["object_backup_job"] = "provider:objects/job-other"

        failures = assess(record)["failures"]

        self.assertIn("evidence.database_backup_job.mismatch", failures)
        self.assertIn("evidence.object_backup_job.mismatch", failures)

    def test_cli_exit_codes_and_output_are_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "recovery.json"
            evidence_path.write_text(json.dumps(valid_record()), encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = RECOVERY.main(cli_args(evidence_path, "--compact"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(output.getvalue())["status"], "PASS")

    def test_invalid_json_returns_input_error_without_exception_detail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "recovery.json"
            evidence_path.write_text("not json", encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = RECOVERY.main(cli_args(evidence_path))

        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["failures"], ["input.unreadable_or_invalid_json"])

    def test_oversized_input_is_bounded_and_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "recovery.json"
            evidence_path.write_bytes(b" " * (RECOVERY.MAX_INPUT_BYTES + 1))
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = RECOVERY.main(cli_args(evidence_path))

        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["failures"], ["input.unreadable_or_invalid_json"])

    def test_duplicate_json_fields_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "recovery.json"
            evidence_path.write_text('{"schema_version":1,"schema_version":1}', encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = RECOVERY.main(cli_args(evidence_path))

        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["failures"], ["input.unreadable_or_invalid_json"])


if __name__ == "__main__":
    unittest.main()
