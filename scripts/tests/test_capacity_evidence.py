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

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_capacity_evidence.py"
SPEC = importlib.util.spec_from_file_location("check_capacity_evidence", MODULE_PATH)
assert SPEC and SPEC.loader
CAPACITY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CAPACITY
SPEC.loader.exec_module(CAPACITY)

MIB = 1024 * 1024
CANDIDATE_SHA = "1234567890abcdef1234567890abcdef12345678"
COMPOSE_SHA = "0123456789abcdef" * 4


def valid_record() -> dict:
    limits_mib = {
        "postgres": 352,
        "redis": 64,
        "clamav": 1408,
        "pgbouncer": 32,
        "media-runtime": 768,
        "api": 384,
        "scheduler": 224,
        "web": 224,
        "nginx": 32,
    }
    services = {
        service: {
            "memory_limit_bytes": limit * MIB,
            "peak_memory_bytes": max(1, (limit - 16) * MIB),
            "restart_count_before": 0,
            "restart_count_after": 0,
            "oom_killed": False,
            "final_state": "running",
            "health": "healthy",
        }
        for service, limit in limits_mib.items()
    }
    workloads = {
        name: {
            "passed": True,
            "duration_seconds": minimum_duration,
            "operation_count": minimum_operations,
            "evidence_id": f"ops:capacity/{name}-20260903",
        }
        for name, (minimum_duration, minimum_operations) in CAPACITY.WORKLOAD_MINIMUMS.items()
    }
    return {
        "schema_version": 1,
        "run_id": "capacity-20260903-001",
        "candidate_sha": CANDIDATE_SHA,
        "compose_config_sha256": COMPOSE_SHA,
        "environment": "capacity-rehearsal",
        "timing": {
            "started_at": "2026-09-03T00:00:00Z",
            "ended_at": "2026-09-03T00:35:00Z",
        },
        "host": {
            "profile": "2vcpu-4gb-ubuntu-24.04-amd64",
            "os_id": "ubuntu",
            "os_version": "24.04",
            "architecture": "x86_64",
            "cpu_count": 2,
            "memory_total_bytes": 4 * 1024**3,
            "observed_seconds": 30 * 60,
            "min_memory_available_bytes": 512 * MIB,
            "max_swap_used_bytes": 128 * MIB,
            "kernel_oom_kills_delta": 0,
        },
        "services": services,
        "workloads": workloads,
        "controls": {field: True for field in CAPACITY._CONTROL_FIELDS},
        "review": {
            "operator_id": "ops:person/operator-001",
            "reviewer_id": "ops:person/reviewer-002",
            "decision": "approved",
            "decided_at": "2026-09-03T00:45:00Z",
        },
        "evidence": {
            field: f"ops:capacity/{field}-20260903" for field in CAPACITY._EVIDENCE_FIELDS
        },
    }


def assess(record: dict) -> dict:
    return CAPACITY.assess_evidence(
        record,
        expected_candidate_sha=CANDIDATE_SHA,
        expected_compose_sha256=COMPOSE_SHA,
    )


class CapacityEvidenceTests(unittest.TestCase):
    def test_complete_exact_host_record_passes(self) -> None:
        result = assess(valid_record())

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["failures"], [])
        self.assertRegex(result["evidence_record_sha256"], r"^[0-9a-f]{64}$")

    def test_host_shape_headroom_swap_and_oom_fail_closed(self) -> None:
        record = valid_record()
        record["host"].update(
            {
                "cpu_count": 4,
                "memory_total_bytes": 8 * 1024**3,
                "observed_seconds": 120,
                "min_memory_available_bytes": 511 * MIB,
                "max_swap_used_bytes": 129 * MIB,
                "kernel_oom_kills_delta": 1,
            }
        )

        failures = assess(record)["failures"]

        self.assertIn("host.cpu_count.mismatch", failures)
        self.assertIn("host.memory_total_bytes.not_4gb", failures)
        self.assertIn("host.observed_seconds.out_of_range", failures)
        self.assertIn("host.memory_headroom_below_512mib", failures)
        self.assertIn("host.swap_use_exceeded_128mib", failures)
        self.assertIn("host.kernel_oom_kills_delta.nonzero", failures)

    def test_missing_unhealthy_restarted_or_oom_service_fails(self) -> None:
        record = valid_record()
        del record["services"]["nginx"]
        record["services"]["api"].update(
            {
                "restart_count_after": 1,
                "oom_killed": True,
                "final_state": "exited",
                "health": "unhealthy",
            }
        )

        failures = assess(record)["failures"]

        self.assertIn("services.missing_nginx", failures)
        self.assertIn("services.api.restarted", failures)
        self.assertIn("services.api.oom_killed", failures)
        self.assertIn("services.api.not_running", failures)
        self.assertIn("services.api.not_healthy", failures)

    def test_memory_limit_sum_and_peak_are_bounded(self) -> None:
        record = valid_record()
        record["services"]["api"]["memory_limit_bytes"] += 128 * MIB
        record["services"]["clamav"]["peak_memory_bytes"] = record["services"]["clamav"][
            "memory_limit_bytes"
        ]

        failures = assess(record)["failures"]

        self.assertIn("services.memory_limits_exceed_3584mib", failures)
        self.assertIn("services.clamav.memory_limit_reached", failures)

    def test_missing_failed_or_undersized_workload_fails(self) -> None:
        record = valid_record()
        del record["workloads"]["malware_rejection"]
        record["workloads"]["auth_burst"]["passed"] = False
        record["workloads"]["steady_state"]["duration_seconds"] = 60

        failures = assess(record)["failures"]

        self.assertIn("workloads.missing_malware_rejection", failures)
        self.assertIn("workloads.auth_burst.passed.must_be_true", failures)
        self.assertIn("workloads.steady_state.duration_seconds.out_of_range", failures)

    def test_controls_and_independent_approval_are_required(self) -> None:
        record = valid_record()
        record["controls"]["malware_scanning_enabled"] = False
        record["review"]["reviewer_id"] = record["review"]["operator_id"]
        record["review"]["decision"] = "rejected"
        record["review"]["decided_at"] = "2026-09-02T23:59:00Z"

        failures = assess(record)["failures"]

        self.assertIn("controls.malware_scanning_enabled.must_be_true", failures)
        self.assertIn("review.independent_reviewer_required", failures)
        self.assertIn("review.decision.not_approved", failures)
        self.assertIn("review.decision_precedes_run_end", failures)

    def test_candidate_and_compose_hash_are_external_bindings(self) -> None:
        record = valid_record()

        candidate = CAPACITY.assess_evidence(
            record,
            expected_candidate_sha="234567890abcdef1234567890abcdef123456789",
            expected_compose_sha256=COMPOSE_SHA,
        )
        compose = CAPACITY.assess_evidence(
            record,
            expected_candidate_sha=CANDIDATE_SHA,
            expected_compose_sha256="123456789abcdef0" * 4,
        )

        self.assertIn("record.candidate_sha.mismatch", candidate["failures"])
        self.assertIn("record.compose_config_sha256.mismatch", compose["failures"])

        invalid = CAPACITY.assess_evidence(
            record,
            expected_candidate_sha="0" * 40,
            expected_compose_sha256="f" * 64,
        )
        self.assertIn("gate.expected_candidate_sha.invalid", invalid["failures"])
        self.assertIn("gate.expected_compose_sha256.invalid", invalid["failures"])

    def test_sensitive_and_unknown_fields_are_rejected_without_echo(self) -> None:
        record = valid_record()
        record["operator_notes"] = {"customerPassword": "must-not-be-echoed"}

        result = assess(record)
        encoded = json.dumps(result)

        self.assertEqual(result["status"], "NO-GO")
        self.assertIn("privacy.sensitive_field_present", result["failures"])
        self.assertIn("record.unknown_fields", result["failures"])
        self.assertNotIn("must-not-be-echoed", encoded)
        self.assertIsNone(result["evidence_record_sha256"])

    def test_example_is_intentionally_no_go(self) -> None:
        example = MODULE_PATH.parents[1] / "infra" / "capacity" / "capacity-evidence.example.json"
        record = json.loads(example.read_text(encoding="utf-8"))

        self.assertEqual(assess(record)["status"], "NO-GO")

    def test_cli_is_deterministic_and_duplicate_fields_are_input_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "capacity.json"
            evidence_path.write_text(json.dumps(valid_record()), encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = CAPACITY.main(
                    [
                        "--expected-candidate-sha",
                        CANDIDATE_SHA,
                        "--expected-compose-sha256",
                        COMPOSE_SHA,
                        "--compact",
                        str(evidence_path),
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output.getvalue())["status"], "PASS")

            evidence_path.write_text('{"schema_version":1,"schema_version":1}', encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = CAPACITY.main(
                    [
                        "--expected-candidate-sha",
                        CANDIDATE_SHA,
                        "--expected-compose-sha256",
                        COMPOSE_SHA,
                        str(evidence_path),
                    ]
                )
            self.assertEqual(exit_code, 2)
            self.assertEqual(json.loads(output.getvalue())["status"], "INPUT-ERROR")


if __name__ == "__main__":
    unittest.main()
