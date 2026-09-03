from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "check_production_environment_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "check_production_environment_evidence", MODULE_PATH
)
assert SPEC and SPEC.loader
ENVIRONMENT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ENVIRONMENT
SPEC.loader.exec_module(ENVIRONMENT)

CANDIDATE_SHA = "1234567890abcdef1234567890abcdef12345678"
ENVIRONMENT_SHA = "0123456789abcdef" * 4
HASH_A = "123456789abcdef0" * 4
HASH_B = "23456789abcdef01" * 4
HASH_C = "3456789abcdef012" * 4


def valid_record() -> dict:
    signals = {
        signal: {
            "dashboard_present": True,
            "target_defined": True,
            "alert_enabled": True,
            "runbook_id": f"ops:runbook/{signal}-v1",
        }
        for signal in ENVIRONMENT.REQUIRED_SIGNALS
    }
    service_coverage = {service: True for service in ENVIRONMENT.REQUIRED_SERVICES}
    return {
        "schema_version": 1,
        "run_id": "production-environment-20260903-001",
        "candidate_sha": CANDIDATE_SHA,
        "environment_manifest_sha256": ENVIRONMENT_SHA,
        "environment": "production",
        "operator_id": "ops:person/operator-001",
        "timing": {
            "started_at": "2026-09-03T00:00:00Z",
            "completed_at": "2026-09-03T00:30:00Z",
        },
        "edge": {
            "endpoint_coverage": {
                "apex": True,
                "www": True,
                "api": True,
                "assets": True,
                "other_intended": True,
            },
            "expected_endpoint_count": 4,
            "verified_endpoint_count": 4,
            "dns_answers_verified": True,
            "dns_manifest_sha256": HASH_A,
            "http_redirects_verified": True,
            "certificate_chain_verified": True,
            "certificate_names_verified": True,
            "minimum_tls_version": "TLSv1.2",
            "certificate_days_remaining": 60,
            "renewal_monitoring_enabled": True,
            "renewal_alert_exercise_passed": True,
            "hsts_max_age_seconds": 31_536_000,
            "hsts_include_subdomains": False,
            "hsts_preload": False,
            "header_surface_coverage": {
                "html": True,
                "authentication": True,
                "dashboard_redirect": True,
                "api_success": True,
                "api_error": True,
                "cached_asset": True,
            },
            "header_manifest_sha256": HASH_B,
            "security_header_policy_verified": True,
            "cors_allowed_preflight_passed": True,
            "cors_untrusted_origins_rejected": True,
            "proxy_client_ip_verified": True,
            "storage_listing_denied": True,
            "public_object_prefix_only_verified": True,
            "private_object_anonymous_access_denied": True,
            "request_limits_verified": True,
        },
        "runtime_configuration": {
            "service_coverage": service_coverage,
            "binding_count": 12,
            "unowned_binding_count": 0,
            "stale_binding_count": 0,
            "browser_exposed_private_value_count": 0,
            "default_or_development_value_count": 0,
            "approved_manager": True,
            "unique_values_verified": True,
            "entropy_policy_verified": True,
            "least_privilege_verified": True,
            "unrelated_service_access_denied": True,
            "access_logging_enabled": True,
            "rotation_exercise_passed": True,
            "rollback_exercise_passed": True,
            "expiry_alert_delivered": True,
            "earliest_rotation_due_at": "2026-12-01T00:00:00Z",
            "inventory_manifest_sha256": HASH_C,
        },
        "observability": {
            "signals": signals,
            "delivery_targets": {
                "max_primary_delivery_seconds": 60,
                "max_escalation_delivery_seconds": 300,
                "max_acknowledgement_seconds": 900,
                "max_recovery_seconds": 1800,
            },
            "expected_delivery_route_count": 2,
            "tested_delivery_route_count": 2,
            "failed_delivery_route_count": 0,
            "primary_route_test": {
                "route_id": "ops:route/primary-001",
                "synthetic_event_id": "ops:event/alert-001",
                "delivered_seconds": 20,
                "acknowledged_seconds": 120,
                "recovered_seconds": 600,
                "passed": True,
            },
            "escalation_route_test": {
                "route_id": "ops:route/escalation-001",
                "synthetic_event_id": "ops:event/alert-001",
                "delivered_seconds": 50,
                "acknowledged_seconds": 180,
                "recovered_seconds": 700,
                "passed": True,
            },
            "delivery_manifest_sha256": HASH_A,
            "log_review": {
                "sampled_event_count": 100,
                "authentication_material_findings": 0,
                "one_time_code_findings": 0,
                "full_pii_findings": 0,
                "kyc_locator_findings": 0,
                "payout_destination_findings": 0,
                "private_configuration_findings": 0,
                "excessive_cardinality_findings": 0,
                "report_sha256": HASH_B,
            },
            "alert_ownership_current": True,
            "quiet_hours_verified": True,
            "runbooks_current": True,
            "dashboard_access_restricted": True,
        },
        "controls": {
            "external_probes_from_independent_network": True,
            "environment_manifest_frozen": True,
            "configuration_drift_absent": True,
            "clocks_synchronized": True,
            "synthetic_alerts_only": True,
            "alerts_labeled_synthetic": True,
            "external_side_effects_bounded": True,
            "no_real_money_movement": True,
            "evidence_contains_no_sensitive_values": True,
            "raw_evidence_access_restricted": True,
            "runtime_values_not_exported": True,
            "production_records_not_exported": True,
        },
        "approvals": {
            "ENV-DNS-01": {
                "approver_id": "ops:person/dns-reviewer-002",
                "approver_role": "operations_independent_reviewer",
                "decision": "approved",
                "decided_at": "2026-09-03T00:40:00Z",
                "evidence_id": "ops:approval/env-dns-01-20260903",
            },
            "ENV-SEC-01": {
                "approver_id": "ops:person/config-owner-003",
                "approver_role": "security_or_operations_config_owner",
                "decision": "approved",
                "decided_at": "2026-09-03T00:41:00Z",
                "evidence_id": "ops:approval/env-sec-01-20260903",
            },
            "ENV-MON-01": {
                "approver_id": "ops:person/sre-owner-004",
                "approver_role": "operations_or_sre_owner",
                "decision": "approved",
                "decided_at": "2026-09-03T00:42:00Z",
                "evidence_id": "ops:approval/env-mon-01-20260903",
            },
        },
        "evidence": {
            "environment_manifest": "ops:environment/manifest-20260903",
            "external_dns_report": "ops:edge/dns-20260903",
            "tls_scan_report": "ops:edge/tls-20260903",
            "header_probe_report": "ops:edge/headers-20260903",
            "runtime_inventory_report": "ops:config/inventory-20260903",
            "access_audit_report": "ops:config/access-20260903",
            "rotation_exercise_report": "ops:config/rotation-20260903",
            "monitoring_inventory_report": "ops:monitoring/inventory-20260903",
            "alert_delivery_report": "ops:monitoring/delivery-20260903",
            "log_privacy_report": "ops:monitoring/log-review-20260903",
        },
    }


def assess(record: dict) -> dict:
    return ENVIRONMENT.assess_evidence(
        record,
        expected_candidate_sha=CANDIDATE_SHA,
        expected_environment_manifest_sha256=ENVIRONMENT_SHA,
    )


class ProductionEnvironmentEvidenceTests(unittest.TestCase):
    def test_complete_exact_environment_record_passes(self) -> None:
        result = assess(valid_record())

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["failures"], [])
        self.assertRegex(result["evidence_record_sha256"], r"^[0-9a-f]{64}$")

    def test_candidate_and_environment_manifest_are_external_bindings(self) -> None:
        candidate = ENVIRONMENT.assess_evidence(
            valid_record(),
            expected_candidate_sha="234567890abcdef1234567890abcdef123456789",
            expected_environment_manifest_sha256=ENVIRONMENT_SHA,
        )
        manifest = ENVIRONMENT.assess_evidence(
            valid_record(),
            expected_candidate_sha=CANDIDATE_SHA,
            expected_environment_manifest_sha256="123456789abcdef0" * 4,
        )
        invalid = ENVIRONMENT.assess_evidence(
            valid_record(),
            expected_candidate_sha="0" * 40,
            expected_environment_manifest_sha256="f" * 64,
        )

        self.assertIn("record.candidate_sha.mismatch", candidate["failures"])
        self.assertIn(
            "record.environment_manifest_sha256.mismatch", manifest["failures"]
        )
        self.assertIn("gate.expected_candidate_sha.invalid", invalid["failures"])
        self.assertIn(
            "gate.expected_environment_manifest_sha256.invalid", invalid["failures"]
        )

    def test_edge_inventory_tls_headers_and_hsts_fail_closed(self) -> None:
        record = valid_record()
        del record["edge"]["endpoint_coverage"]["assets"]
        record["edge"].update(
            {
                "verified_endpoint_count": 3,
                "dns_answers_verified": False,
                "certificate_days_remaining": 29,
                "minimum_tls_version": "TLSv1.1",
                "hsts_include_subdomains": True,
                "hsts_preload": True,
                "private_object_anonymous_access_denied": False,
            }
        )
        record["edge"]["header_surface_coverage"]["api_error"] = False

        failures = assess(record)["failures"]

        self.assertIn("edge.endpoint_coverage.missing_assets", failures)
        self.assertIn("edge.endpoint_count.mismatch", failures)
        self.assertIn("edge.dns_answers_verified.must_be_true", failures)
        self.assertIn("edge.certificate_days_remaining.below_30", failures)
        self.assertIn("edge.minimum_tls_version.unsupported", failures)
        self.assertIn("edge.hsts_include_subdomains.must_be_false", failures)
        self.assertIn("edge.hsts_preload.must_be_false", failures)
        self.assertIn(
            "edge.private_object_anonymous_access_denied.must_be_true", failures
        )
        self.assertIn("edge.header_surface_coverage.api_error.must_be_true", failures)

    def test_runtime_configuration_coverage_rotation_and_counts_fail_closed(
        self,
    ) -> None:
        record = valid_record()
        del record["runtime_configuration"]["service_coverage"]["scheduler"]
        record["runtime_configuration"].update(
            {
                "unowned_binding_count": 1,
                "browser_exposed_private_value_count": 1,
                "rotation_exercise_passed": False,
                "earliest_rotation_due_at": "2026-09-02T00:00:00Z",
            }
        )

        failures = assess(record)["failures"]

        self.assertIn(
            "runtime_configuration.service_coverage.missing_scheduler", failures
        )
        self.assertIn("runtime_configuration.unowned_binding_count.nonzero", failures)
        self.assertIn(
            "runtime_configuration.browser_exposed_private_value_count.nonzero",
            failures,
        )
        self.assertIn(
            "runtime_configuration.rotation_exercise_passed.must_be_true", failures
        )
        self.assertIn("runtime_configuration.rotation_due_not_after_run", failures)

    def test_observability_inventory_delivery_and_log_review_fail_closed(self) -> None:
        record = valid_record()
        del record["observability"]["signals"]["malware_scanner"]
        record["observability"].update(
            {
                "tested_delivery_route_count": 1,
                "failed_delivery_route_count": 1,
            }
        )
        record["observability"]["primary_route_test"]["delivered_seconds"] = 61
        record["observability"]["escalation_route_test"].update(
            {"passed": False, "synthetic_event_id": "ops:event/alert-002"}
        )
        record["observability"]["log_review"]["full_pii_findings"] = 1

        failures = assess(record)["failures"]

        self.assertIn("observability.signals.missing_malware_scanner", failures)
        self.assertIn("observability.delivery_route_count.mismatch", failures)
        self.assertIn("observability.failed_delivery_route_count.nonzero", failures)
        self.assertIn(
            "observability.primary_route_test.delivery_target_exceeded", failures
        )
        self.assertIn(
            "observability.escalation_route_test.passed.must_be_true", failures
        )
        self.assertIn(
            "observability.delivery_routes.synthetic_event_mismatch", failures
        )
        self.assertIn("observability.log_review.full_pii_findings.nonzero", failures)

    def test_gate_specific_approval_is_named_independent_and_after_run(self) -> None:
        record = valid_record()
        record["approvals"]["ENV-DNS-01"]["approver_id"] = record["operator_id"]
        record["approvals"]["ENV-SEC-01"].update(
            {"decision": "rejected", "decided_at": "2026-09-02T23:59:00Z"}
        )
        record["approvals"]["ENV-MON-01"]["approver_role"] = "developer"
        record["approvals"]["ENV-MON-01"]["approver_id"] = record["approvals"][
            "ENV-SEC-01"
        ]["approver_id"]

        failures = assess(record)["failures"]

        self.assertIn("approvals.ENV-DNS-01.independent_approver_required", failures)
        self.assertIn("approvals.ENV-SEC-01.decision.not_approved", failures)
        self.assertIn("approvals.ENV-SEC-01.decision_precedes_run_end", failures)
        self.assertIn("approvals.ENV-MON-01.approver_role.invalid", failures)
        self.assertIn("approvals.distinct_approvers_required", failures)

    def test_unknown_sensitive_fields_are_rejected_without_echo(self) -> None:
        record = valid_record()
        record["operator_notes"] = {"customerPassword": "must-not-be-echoed"}

        result = assess(record)
        encoded = json.dumps(result)

        self.assertEqual(result["status"], "NO-GO")
        self.assertIn("privacy.sensitive_field_present", result["failures"])
        self.assertIn("record.unknown_fields", result["failures"])
        self.assertNotIn("must-not-be-echoed", encoded)
        self.assertIsNone(result["evidence_record_sha256"])

    def test_placeholders_failed_controls_and_invalid_timing_fail(self) -> None:
        record = valid_record()
        record["run_id"] = "replace-with-run-id"
        record["edge"]["dns_manifest_sha256"] = "a" * 64
        record["controls"]["configuration_drift_absent"] = False
        record["timing"]["completed_at"] = "2026-09-02T23:59:00Z"

        failures = assess(record)["failures"]

        self.assertIn("record.run_id.placeholder", failures)
        self.assertIn("edge.dns_manifest_sha256.placeholder", failures)
        self.assertIn("controls.configuration_drift_absent.must_be_true", failures)
        self.assertIn("timing.invalid_order", failures)

    def test_example_is_intentionally_no_go(self) -> None:
        example = (
            MODULE_PATH.parents[1]
            / "infra"
            / "production-environment"
            / "environment-evidence.example.json"
        )
        record = json.loads(example.read_text(encoding="utf-8"))

        self.assertEqual(assess(record)["status"], "NO-GO")

    def test_cli_is_deterministic_and_rejects_invalid_or_duplicate_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "environment.json"
            evidence_path.write_text(json.dumps(valid_record()), encoding="utf-8")
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = ENVIRONMENT.main(
                    [
                        "--expected-candidate-sha",
                        CANDIDATE_SHA,
                        "--expected-environment-manifest-sha256",
                        ENVIRONMENT_SHA,
                        "--compact",
                        str(evidence_path),
                    ]
                )
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output.getvalue())["status"], "PASS")

            evidence_path.write_text(
                '{"schema_version":1,"schema_version":1}', encoding="utf-8"
            )
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = ENVIRONMENT.main(
                    [
                        "--expected-candidate-sha",
                        CANDIDATE_SHA,
                        "--expected-environment-manifest-sha256",
                        ENVIRONMENT_SHA,
                        str(evidence_path),
                    ]
                )
            self.assertEqual(exit_code, 2)
            self.assertEqual(json.loads(output.getvalue())["status"], "INPUT-ERROR")

    def test_oversized_input_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "environment.json"
            evidence_path.write_bytes(b" " * (ENVIRONMENT.MAX_INPUT_BYTES + 1))
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = ENVIRONMENT.main(
                    [
                        "--expected-candidate-sha",
                        CANDIDATE_SHA,
                        "--expected-environment-manifest-sha256",
                        ENVIRONMENT_SHA,
                        str(evidence_path),
                    ]
                )

        self.assertEqual(exit_code, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "INPUT-ERROR")


if __name__ == "__main__":
    unittest.main()
