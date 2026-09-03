#!/usr/bin/env python3
"""Fail-closed gate for privacy-minimized production-environment evidence.

The record contains aggregate observations, digests, timings, and opaque
evidence identifiers only. It must never contain runtime values, credentials,
customer data, alert destinations, raw logs, or free-form operator notes.
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
MAX_INPUT_BYTES = 192 * 1024

REQUIRED_SERVICES = (
    "postgres",
    "redis",
    "clamav",
    "pgbouncer",
    "media-runtime",
    "api",
    "scheduler",
    "web",
    "nginx",
)
REQUIRED_SIGNALS = (
    "availability",
    "latency",
    "http_5xx",
    "scheduler_queue_liveness",
    "database_saturation",
    "redis_saturation_or_failures",
    "storage",
    "malware_scanner",
    "certificate_expiry",
    "managed_value_expiry",
    "authentication_abuse",
    "webhook_lag",
    "payout_failures",
)

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$")
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
        "private_key",
        "request_body",
        "secret",
        "session",
        "token",
    }
)

_TOP_LEVEL_FIELDS = {
    "schema_version",
    "run_id",
    "candidate_sha",
    "environment_manifest_sha256",
    "environment",
    "operator_id",
    "timing",
    "edge",
    "runtime_configuration",
    "observability",
    "controls",
    "approvals",
    "evidence",
}
_TIMING_FIELDS = {"started_at", "completed_at"}
_EDGE_FIELDS = {
    "endpoint_coverage",
    "expected_endpoint_count",
    "verified_endpoint_count",
    "dns_answers_verified",
    "dns_manifest_sha256",
    "http_redirects_verified",
    "certificate_chain_verified",
    "certificate_names_verified",
    "minimum_tls_version",
    "certificate_days_remaining",
    "renewal_monitoring_enabled",
    "renewal_alert_exercise_passed",
    "hsts_max_age_seconds",
    "hsts_include_subdomains",
    "hsts_preload",
    "header_surface_coverage",
    "header_manifest_sha256",
    "security_header_policy_verified",
    "cors_allowed_preflight_passed",
    "cors_untrusted_origins_rejected",
    "proxy_client_ip_verified",
    "storage_listing_denied",
    "public_object_prefix_only_verified",
    "private_object_anonymous_access_denied",
    "request_limits_verified",
}
_ENDPOINT_COVERAGE_FIELDS = {"apex", "www", "api", "assets", "other_intended"}
_HEADER_COVERAGE_FIELDS = {
    "html",
    "authentication",
    "dashboard_redirect",
    "api_success",
    "api_error",
    "cached_asset",
}
_RUNTIME_FIELDS = {
    "service_coverage",
    "binding_count",
    "unowned_binding_count",
    "stale_binding_count",
    "browser_exposed_private_value_count",
    "default_or_development_value_count",
    "approved_manager",
    "unique_values_verified",
    "entropy_policy_verified",
    "least_privilege_verified",
    "unrelated_service_access_denied",
    "access_logging_enabled",
    "rotation_exercise_passed",
    "rollback_exercise_passed",
    "expiry_alert_delivered",
    "earliest_rotation_due_at",
    "inventory_manifest_sha256",
}
_OBSERVABILITY_FIELDS = {
    "signals",
    "delivery_targets",
    "expected_delivery_route_count",
    "tested_delivery_route_count",
    "failed_delivery_route_count",
    "primary_route_test",
    "escalation_route_test",
    "delivery_manifest_sha256",
    "log_review",
    "alert_ownership_current",
    "quiet_hours_verified",
    "runbooks_current",
    "dashboard_access_restricted",
}
_SIGNAL_FIELDS = {"dashboard_present", "target_defined", "alert_enabled", "runbook_id"}
_DELIVERY_TARGET_FIELDS = {
    "max_primary_delivery_seconds",
    "max_escalation_delivery_seconds",
    "max_acknowledgement_seconds",
    "max_recovery_seconds",
}
_ROUTE_TEST_FIELDS = {
    "route_id",
    "synthetic_event_id",
    "delivered_seconds",
    "acknowledged_seconds",
    "recovered_seconds",
    "passed",
}
_LOG_REVIEW_FIELDS = {
    "sampled_event_count",
    "authentication_material_findings",
    "one_time_code_findings",
    "full_pii_findings",
    "kyc_locator_findings",
    "payout_destination_findings",
    "private_configuration_findings",
    "excessive_cardinality_findings",
    "report_sha256",
}
_CONTROL_FIELDS = {
    "external_probes_from_independent_network",
    "environment_manifest_frozen",
    "configuration_drift_absent",
    "clocks_synchronized",
    "synthetic_alerts_only",
    "alerts_labeled_synthetic",
    "external_side_effects_bounded",
    "no_real_money_movement",
    "evidence_contains_no_sensitive_values",
    "raw_evidence_access_restricted",
    "runtime_values_not_exported",
    "production_records_not_exported",
}
_APPROVAL_FIELDS = {
    "approver_id",
    "approver_role",
    "decision",
    "decided_at",
    "evidence_id",
}
_APPROVAL_ROLES = {
    "ENV-DNS-01": "operations_independent_reviewer",
    "ENV-SEC-01": "security_or_operations_config_owner",
    "ENV-MON-01": "operations_or_sre_owner",
}
_EVIDENCE_FIELDS = {
    "environment_manifest",
    "external_dns_report",
    "tls_scan_report",
    "header_probe_report",
    "runtime_inventory_report",
    "access_audit_report",
    "rotation_exercise_report",
    "monitoring_inventory_report",
    "alert_delivery_report",
    "log_privacy_report",
}


class _Validator:
    def __init__(self) -> None:
        self.failures: set[str] = set()

    def mapping(self, value: Any, scope: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            self.failures.add(f"{scope}.must_be_object")
            return {}
        return value

    def exact_fields(
        self, value: dict[str, Any], expected: set[str], scope: str
    ) -> None:
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

    def required_false(self, value: Any, code: str) -> None:
        if value is not False:
            self.failures.add(f"{code}.must_be_false")

    def sha256(self, value: Any, code: str) -> bool:
        if not isinstance(value, str) or not _SHA256.fullmatch(value):
            self.failures.add(f"{code}.invalid")
            return False
        if len(set(value)) == 1:
            self.failures.add(f"{code}.placeholder")
            return False
        return True

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
    with_boundaries = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", str(value))
    return re.sub(r"[^a-z0-9]+", "_", with_boundaries.casefold()).strip("_")


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
    result: dict[str, Any] = {}
    for field, child in pairs:
        if field in result:
            raise ValueError("duplicate JSON field")
        result[field] = child
    return result


def _valid_expected_commit(value: str) -> bool:
    return bool(_COMMIT_SHA.fullmatch(value)) and len(set(value)) > 1


def _valid_expected_sha256(value: str) -> bool:
    return bool(_SHA256.fullmatch(value)) and len(set(value)) > 1


def _validate_true_map(
    validator: _Validator,
    raw: Any,
    expected: set[str],
    scope: str,
) -> dict[str, Any]:
    values = validator.mapping(raw, scope)
    validator.exact_fields(values, expected, scope)
    for field in expected:
        validator.required_true(values.get(field), f"{scope}.{field}")
    return values


def _validate_edge(validator: _Validator, raw: Any) -> None:
    edge = validator.mapping(raw, "edge")
    validator.exact_fields(edge, _EDGE_FIELDS, "edge")
    _validate_true_map(
        validator,
        edge.get("endpoint_coverage"),
        _ENDPOINT_COVERAGE_FIELDS,
        "edge.endpoint_coverage",
    )
    expected_count = validator.integer(
        edge.get("expected_endpoint_count"),
        "edge.expected_endpoint_count",
        minimum=4,
        maximum=100,
    )
    verified_count = validator.integer(
        edge.get("verified_endpoint_count"),
        "edge.verified_endpoint_count",
        minimum=0,
        maximum=100,
    )
    if (
        expected_count is not None
        and verified_count is not None
        and expected_count != verified_count
    ):
        validator.failures.add("edge.endpoint_count.mismatch")

    for field in (
        "dns_answers_verified",
        "http_redirects_verified",
        "certificate_chain_verified",
        "certificate_names_verified",
        "renewal_monitoring_enabled",
        "renewal_alert_exercise_passed",
        "security_header_policy_verified",
        "cors_allowed_preflight_passed",
        "cors_untrusted_origins_rejected",
        "proxy_client_ip_verified",
        "storage_listing_denied",
        "public_object_prefix_only_verified",
        "private_object_anonymous_access_denied",
        "request_limits_verified",
    ):
        validator.required_true(edge.get(field), f"edge.{field}")
    validator.sha256(edge.get("dns_manifest_sha256"), "edge.dns_manifest_sha256")
    validator.sha256(edge.get("header_manifest_sha256"), "edge.header_manifest_sha256")

    if edge.get("minimum_tls_version") not in {"TLSv1.2", "TLSv1.3"}:
        validator.failures.add("edge.minimum_tls_version.unsupported")
    remaining = validator.integer(
        edge.get("certificate_days_remaining"),
        "edge.certificate_days_remaining",
    )
    if remaining is not None and remaining < 30:
        validator.failures.add("edge.certificate_days_remaining.below_30")
    hsts_max_age = validator.integer(
        edge.get("hsts_max_age_seconds"),
        "edge.hsts_max_age_seconds",
    )
    if hsts_max_age is not None and hsts_max_age < 31_536_000:
        validator.failures.add("edge.hsts_max_age_seconds.below_policy")
    validator.required_false(
        edge.get("hsts_include_subdomains"), "edge.hsts_include_subdomains"
    )
    validator.required_false(edge.get("hsts_preload"), "edge.hsts_preload")
    _validate_true_map(
        validator,
        edge.get("header_surface_coverage"),
        _HEADER_COVERAGE_FIELDS,
        "edge.header_surface_coverage",
    )


def _validate_runtime_configuration(
    validator: _Validator,
    raw: Any,
    completed_at: datetime | None,
) -> None:
    runtime = validator.mapping(raw, "runtime_configuration")
    validator.exact_fields(runtime, _RUNTIME_FIELDS, "runtime_configuration")
    _validate_true_map(
        validator,
        runtime.get("service_coverage"),
        set(REQUIRED_SERVICES),
        "runtime_configuration.service_coverage",
    )
    validator.integer(
        runtime.get("binding_count"),
        "runtime_configuration.binding_count",
        minimum=1,
        maximum=10_000,
    )
    for field in (
        "unowned_binding_count",
        "stale_binding_count",
        "browser_exposed_private_value_count",
        "default_or_development_value_count",
    ):
        value = validator.integer(
            runtime.get(field),
            f"runtime_configuration.{field}",
            maximum=10_000,
        )
        if value is not None and value != 0:
            validator.failures.add(f"runtime_configuration.{field}.nonzero")
    for field in (
        "approved_manager",
        "unique_values_verified",
        "entropy_policy_verified",
        "least_privilege_verified",
        "unrelated_service_access_denied",
        "access_logging_enabled",
        "rotation_exercise_passed",
        "rollback_exercise_passed",
        "expiry_alert_delivered",
    ):
        validator.required_true(runtime.get(field), f"runtime_configuration.{field}")
    due_at = validator.timestamp(
        runtime.get("earliest_rotation_due_at"),
        "runtime_configuration.earliest_rotation_due_at",
    )
    if due_at is not None and completed_at is not None and due_at <= completed_at:
        validator.failures.add("runtime_configuration.rotation_due_not_after_run")
    validator.sha256(
        runtime.get("inventory_manifest_sha256"),
        "runtime_configuration.inventory_manifest_sha256",
    )


def _validate_route_test(
    validator: _Validator,
    raw: Any,
    scope: str,
    *,
    delivery_target: int | None,
    acknowledgement_target: int | None,
    recovery_target: int | None,
) -> dict[str, Any]:
    route = validator.mapping(raw, scope)
    validator.exact_fields(route, _ROUTE_TEST_FIELDS, scope)
    validator.safe_id(route.get("route_id"), f"{scope}.route_id")
    validator.safe_id(route.get("synthetic_event_id"), f"{scope}.synthetic_event_id")
    delivered = validator.integer(
        route.get("delivered_seconds"), f"{scope}.delivered_seconds"
    )
    acknowledged = validator.integer(
        route.get("acknowledged_seconds"), f"{scope}.acknowledged_seconds"
    )
    recovered = validator.integer(
        route.get("recovered_seconds"), f"{scope}.recovered_seconds"
    )
    validator.required_true(route.get("passed"), f"{scope}.passed")

    if (
        delivered is not None
        and delivery_target is not None
        and delivered > delivery_target
    ):
        validator.failures.add(f"{scope}.delivery_target_exceeded")
    if (
        acknowledged is not None
        and acknowledgement_target is not None
        and acknowledged > acknowledgement_target
    ):
        validator.failures.add(f"{scope}.acknowledgement_target_exceeded")
    if (
        recovered is not None
        and recovery_target is not None
        and recovered > recovery_target
    ):
        validator.failures.add(f"{scope}.recovery_target_exceeded")
    if (
        delivered is not None
        and acknowledged is not None
        and recovered is not None
        and not delivered <= acknowledged <= recovered
    ):
        validator.failures.add(f"{scope}.timing_order_invalid")
    return route


def _validate_observability(validator: _Validator, raw: Any) -> None:
    observability = validator.mapping(raw, "observability")
    validator.exact_fields(observability, _OBSERVABILITY_FIELDS, "observability")

    signals = validator.mapping(observability.get("signals"), "observability.signals")
    validator.exact_fields(signals, set(REQUIRED_SIGNALS), "observability.signals")
    for signal_name in REQUIRED_SIGNALS:
        scope = f"observability.signals.{signal_name}"
        signal = validator.mapping(signals.get(signal_name), scope)
        validator.exact_fields(signal, _SIGNAL_FIELDS, scope)
        for field in ("dashboard_present", "target_defined", "alert_enabled"):
            validator.required_true(signal.get(field), f"{scope}.{field}")
        validator.safe_id(signal.get("runbook_id"), f"{scope}.runbook_id")

    targets = validator.mapping(
        observability.get("delivery_targets"), "observability.delivery_targets"
    )
    validator.exact_fields(
        targets, _DELIVERY_TARGET_FIELDS, "observability.delivery_targets"
    )
    target_values = {
        field: validator.integer(
            targets.get(field),
            f"observability.delivery_targets.{field}",
            minimum=1,
            maximum=86_400,
        )
        for field in _DELIVERY_TARGET_FIELDS
    }

    expected_routes = validator.integer(
        observability.get("expected_delivery_route_count"),
        "observability.expected_delivery_route_count",
        minimum=2,
        maximum=100,
    )
    tested_routes = validator.integer(
        observability.get("tested_delivery_route_count"),
        "observability.tested_delivery_route_count",
        maximum=100,
    )
    failed_routes = validator.integer(
        observability.get("failed_delivery_route_count"),
        "observability.failed_delivery_route_count",
        maximum=100,
    )
    if (
        expected_routes is not None
        and tested_routes is not None
        and expected_routes != tested_routes
    ):
        validator.failures.add("observability.delivery_route_count.mismatch")
    if failed_routes is not None and failed_routes != 0:
        validator.failures.add("observability.failed_delivery_route_count.nonzero")

    primary = _validate_route_test(
        validator,
        observability.get("primary_route_test"),
        "observability.primary_route_test",
        delivery_target=target_values["max_primary_delivery_seconds"],
        acknowledgement_target=target_values["max_acknowledgement_seconds"],
        recovery_target=target_values["max_recovery_seconds"],
    )
    escalation = _validate_route_test(
        validator,
        observability.get("escalation_route_test"),
        "observability.escalation_route_test",
        delivery_target=target_values["max_escalation_delivery_seconds"],
        acknowledgement_target=target_values["max_acknowledgement_seconds"],
        recovery_target=target_values["max_recovery_seconds"],
    )
    if (
        isinstance(primary.get("route_id"), str)
        and isinstance(escalation.get("route_id"), str)
        and primary["route_id"] == escalation["route_id"]
    ):
        validator.failures.add("observability.delivery_routes.must_be_distinct")
    if (
        isinstance(primary.get("synthetic_event_id"), str)
        and isinstance(escalation.get("synthetic_event_id"), str)
        and primary["synthetic_event_id"] != escalation["synthetic_event_id"]
    ):
        validator.failures.add("observability.delivery_routes.synthetic_event_mismatch")
    validator.sha256(
        observability.get("delivery_manifest_sha256"),
        "observability.delivery_manifest_sha256",
    )

    log_review = validator.mapping(
        observability.get("log_review"), "observability.log_review"
    )
    validator.exact_fields(log_review, _LOG_REVIEW_FIELDS, "observability.log_review")
    validator.integer(
        log_review.get("sampled_event_count"),
        "observability.log_review.sampled_event_count",
        minimum=1,
    )
    for field in _LOG_REVIEW_FIELDS - {"sampled_event_count", "report_sha256"}:
        value = validator.integer(
            log_review.get(field),
            f"observability.log_review.{field}",
            maximum=1_000_000,
        )
        if value is not None and value != 0:
            validator.failures.add(f"observability.log_review.{field}.nonzero")
    validator.sha256(
        log_review.get("report_sha256"), "observability.log_review.report_sha256"
    )
    for field in (
        "alert_ownership_current",
        "quiet_hours_verified",
        "runbooks_current",
        "dashboard_access_restricted",
    ):
        validator.required_true(observability.get(field), f"observability.{field}")


def _validate_approvals(
    validator: _Validator,
    raw: Any,
    *,
    operator_id: Any,
    completed_at: datetime | None,
) -> None:
    approvals = validator.mapping(raw, "approvals")
    validator.exact_fields(approvals, set(_APPROVAL_ROLES), "approvals")
    approver_ids: list[str] = []
    for gate_id, expected_role in _APPROVAL_ROLES.items():
        scope = f"approvals.{gate_id}"
        approval = validator.mapping(approvals.get(gate_id), scope)
        validator.exact_fields(approval, _APPROVAL_FIELDS, scope)
        approver_id = approval.get("approver_id")
        approver_valid = validator.safe_id(approver_id, f"{scope}.approver_id")
        if approver_valid:
            approver_ids.append(approver_id)
        if approver_valid and approver_id == operator_id:
            validator.failures.add(f"{scope}.independent_approver_required")
        if approval.get("approver_role") != expected_role:
            validator.failures.add(f"{scope}.approver_role.invalid")
        if approval.get("decision") != "approved":
            validator.failures.add(f"{scope}.decision.not_approved")
        decided_at = validator.timestamp(
            approval.get("decided_at"), f"{scope}.decided_at"
        )
        if (
            decided_at is not None
            and completed_at is not None
            and decided_at < completed_at
        ):
            validator.failures.add(f"{scope}.decision_precedes_run_end")
        validator.safe_id(approval.get("evidence_id"), f"{scope}.evidence_id")
    if len(approver_ids) != len(set(approver_ids)):
        validator.failures.add("approvals.distinct_approvers_required")


def assess_evidence(
    raw: Any,
    *,
    expected_candidate_sha: str,
    expected_environment_manifest_sha256: str,
) -> dict[str, Any]:
    """Return a privacy-safe assessment without echoing operational evidence."""

    validator = _Validator()
    expected_candidate_valid = _valid_expected_commit(expected_candidate_sha)
    expected_manifest_valid = _valid_expected_sha256(
        expected_environment_manifest_sha256
    )
    if not expected_candidate_valid:
        validator.failures.add("gate.expected_candidate_sha.invalid")
    if not expected_manifest_valid:
        validator.failures.add("gate.expected_environment_manifest_sha256.invalid")
    if _contains_sensitive_field(raw):
        validator.failures.add("privacy.sensitive_field_present")

    record = validator.mapping(raw, "record")
    validator.exact_fields(record, _TOP_LEVEL_FIELDS, "record")
    if record.get("schema_version") != SCHEMA_VERSION:
        validator.failures.add("record.schema_version.unsupported")
    run_id = record.get("run_id")
    run_id_valid = validator.safe_id(run_id, "record.run_id")
    operator_id = record.get("operator_id")
    validator.safe_id(operator_id, "record.operator_id")
    if record.get("environment") != "production":
        validator.failures.add("record.environment.must_be_production")

    candidate_sha = record.get("candidate_sha")
    candidate_valid = False
    if not isinstance(candidate_sha, str) or not _COMMIT_SHA.fullmatch(candidate_sha):
        validator.failures.add("record.candidate_sha.invalid")
    elif len(set(candidate_sha)) == 1:
        validator.failures.add("record.candidate_sha.placeholder")
    else:
        candidate_valid = True
        if expected_candidate_valid and candidate_sha != expected_candidate_sha:
            validator.failures.add("record.candidate_sha.mismatch")

    manifest_sha = record.get("environment_manifest_sha256")
    if validator.sha256(manifest_sha, "record.environment_manifest_sha256"):
        if (
            expected_manifest_valid
            and manifest_sha != expected_environment_manifest_sha256
        ):
            validator.failures.add("record.environment_manifest_sha256.mismatch")

    timing = validator.mapping(record.get("timing"), "timing")
    validator.exact_fields(timing, _TIMING_FIELDS, "timing")
    started_at = validator.timestamp(timing.get("started_at"), "timing.started_at")
    completed_at = validator.timestamp(
        timing.get("completed_at"), "timing.completed_at"
    )
    if (
        started_at is not None
        and completed_at is not None
        and completed_at <= started_at
    ):
        validator.failures.add("timing.invalid_order")

    _validate_edge(validator, record.get("edge"))
    _validate_runtime_configuration(
        validator, record.get("runtime_configuration"), completed_at
    )
    _validate_observability(validator, record.get("observability"))

    controls = validator.mapping(record.get("controls"), "controls")
    validator.exact_fields(controls, _CONTROL_FIELDS, "controls")
    for field in _CONTROL_FIELDS:
        validator.required_true(controls.get(field), f"controls.{field}")

    _validate_approvals(
        validator,
        record.get("approvals"),
        operator_id=operator_id,
        completed_at=completed_at,
    )

    evidence = validator.mapping(record.get("evidence"), "evidence")
    validator.exact_fields(evidence, _EVIDENCE_FIELDS, "evidence")
    for field in _EVIDENCE_FIELDS:
        validator.safe_id(evidence.get(field), f"evidence.{field}")

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
            **({"run_id": run_id} if run_id_valid else {}),
            **({"candidate_sha": candidate_sha} if candidate_valid else {}),
        },
        "evidence_record_sha256": record_sha256,
        "failures": failures,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-candidate-sha", required=True)
    parser.add_argument("--expected-environment-manifest-sha256", required=True)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("evidence_file", type=Path)
    return parser


def _input_error(*, compact: bool) -> int:
    result = {
        "schema_version": SCHEMA_VERSION,
        "status": "INPUT-ERROR",
        "identity": {},
        "evidence_record_sha256": None,
        "failures": ["input.unreadable_or_invalid_json"],
    }
    print(json.dumps(result, indent=None if compact else 2, sort_keys=True))
    return 2


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not _valid_expected_commit(
        args.expected_candidate_sha
    ) or not _valid_expected_sha256(args.expected_environment_manifest_sha256):
        return _input_error(compact=args.compact)
    try:
        with args.evidence_file.open("rb") as evidence_stream:
            payload = evidence_stream.read(MAX_INPUT_BYTES + 1)
        if len(payload) > MAX_INPUT_BYTES:
            raise ValueError("input too large")
        raw = json.loads(
            payload.decode("utf-8"), object_pairs_hook=_reject_duplicate_fields
        )
    except (
        OSError,
        RecursionError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        ValueError,
    ):
        return _input_error(compact=args.compact)

    result = assess_evidence(
        raw,
        expected_candidate_sha=args.expected_candidate_sha,
        expected_environment_manifest_sha256=args.expected_environment_manifest_sha256,
    )
    print(json.dumps(result, indent=None if args.compact else 2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
