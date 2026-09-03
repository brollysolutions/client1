#!/usr/bin/env python3
"""Fail-closed gate for privacy-minimized 4-GB capacity evidence.

The record contains aggregate resource observations and opaque evidence IDs.
It must never contain credentials, request bodies, customer values, object
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
MAX_INPUT_BYTES = 128 * 1024
MIB = 1024 * 1024

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
WORKLOAD_MINIMUMS = {
    "steady_state": (30 * 60, 1),
    "auth_burst": (1, 20),
    "image_pdf_uploads": (1, 4),
    "malware_rejection": (1, 1),
    "video_transcode_1080p": (1, 1),
    "scheduler_cycle": (1, 1),
    "database_web_api_burst": (1, 100),
    "clamav_offline_update": (1, 1),
    "scanner_outage_fail_closed": (1, 1),
    "media_processor_outage_fail_closed": (1, 1),
}

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
    "compose_config_sha256",
    "environment",
    "timing",
    "host",
    "services",
    "workloads",
    "controls",
    "review",
    "evidence",
}
_TIMING_FIELDS = {"started_at", "ended_at"}
_HOST_FIELDS = {
    "profile",
    "os_id",
    "os_version",
    "architecture",
    "cpu_count",
    "memory_total_bytes",
    "observed_seconds",
    "min_memory_available_bytes",
    "max_swap_used_bytes",
    "kernel_oom_kills_delta",
}
_SERVICE_FIELDS = {
    "memory_limit_bytes",
    "peak_memory_bytes",
    "restart_count_before",
    "restart_count_after",
    "oom_killed",
    "final_state",
    "health",
}
_WORKLOAD_FIELDS = {"passed", "duration_seconds", "operation_count", "evidence_id"}
_CONTROL_FIELDS = {
    "synthetic_data_only",
    "production_data_absent",
    "external_side_effects_blocked",
    "malware_scanning_enabled",
    "clamav_test_databases_enabled",
    "clamav_update_serialized",
    "unready_media_private",
    "ffmpeg_internal_only",
    "redis_noeviction",
    "scheduler_single_replica",
    "api_single_worker",
    "logs_reviewed_no_sensitive_data",
}
_REVIEW_FIELDS = {"operator_id", "reviewer_id", "decision", "decided_at"}
_EVIDENCE_FIELDS = {
    "metrics_archive",
    "workload_report",
    "compose_render",
    "clamav_update_log",
    "security_review",
    "operator_approval",
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
        if set(value) - expected:
            self.failures.add(f"{scope}.unknown_fields")
        for field in expected - set(value):
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


def _validate_host(validator: _Validator, raw: Any) -> dict[str, Any]:
    host = validator.mapping(raw, "host")
    validator.exact_fields(host, _HOST_FIELDS, "host")
    expected_text = {
        "profile": "2vcpu-4gb-ubuntu-24.04-amd64",
        "os_id": "ubuntu",
        "os_version": "24.04",
        "architecture": "x86_64",
    }
    for field, expected in expected_text.items():
        if host.get(field) != expected:
            validator.failures.add(f"host.{field}.mismatch")
    if validator.integer(host.get("cpu_count"), "host.cpu_count") != 2:
        validator.failures.add("host.cpu_count.mismatch")

    total = validator.integer(host.get("memory_total_bytes"), "host.memory_total_bytes")
    if total is not None and not int(3.5 * 1024**3) <= total <= int(4.25 * 1024**3):
        validator.failures.add("host.memory_total_bytes.not_4gb")
    observed = validator.integer(
        host.get("observed_seconds"), "host.observed_seconds", minimum=30 * 60
    )
    available = validator.integer(
        host.get("min_memory_available_bytes"),
        "host.min_memory_available_bytes",
    )
    if available is not None and available < 512 * MIB:
        validator.failures.add("host.memory_headroom_below_512mib")
    swap = validator.integer(host.get("max_swap_used_bytes"), "host.max_swap_used_bytes")
    if swap is not None and swap > 128 * MIB:
        validator.failures.add("host.swap_use_exceeded_128mib")
    if (
        validator.integer(
            host.get("kernel_oom_kills_delta"), "host.kernel_oom_kills_delta"
        )
        != 0
    ):
        validator.failures.add("host.kernel_oom_kills_delta.nonzero")
    if observed is None:
        return host
    return host


def _validate_services(validator: _Validator, raw: Any) -> None:
    services = validator.mapping(raw, "services")
    validator.exact_fields(services, set(REQUIRED_SERVICES), "services")
    total_limits = 0
    for service_name in REQUIRED_SERVICES:
        scope = f"services.{service_name}"
        service = validator.mapping(services.get(service_name), scope)
        validator.exact_fields(service, _SERVICE_FIELDS, scope)
        limit = validator.integer(
            service.get("memory_limit_bytes"),
            f"{scope}.memory_limit_bytes",
            minimum=16 * MIB,
        )
        peak = validator.integer(
            service.get("peak_memory_bytes"),
            f"{scope}.peak_memory_bytes",
            minimum=1,
        )
        if limit is not None:
            total_limits += limit
        if limit is not None and peak is not None and peak >= limit:
            validator.failures.add(f"{scope}.memory_limit_reached")
        before = validator.integer(
            service.get("restart_count_before"), f"{scope}.restart_count_before"
        )
        after = validator.integer(
            service.get("restart_count_after"), f"{scope}.restart_count_after"
        )
        if before is not None and after is not None and before != after:
            validator.failures.add(f"{scope}.restarted")
        if service.get("oom_killed") is not False:
            validator.failures.add(f"{scope}.oom_killed")
        if service.get("final_state") != "running":
            validator.failures.add(f"{scope}.not_running")
        if service.get("health") != "healthy":
            validator.failures.add(f"{scope}.not_healthy")
    if total_limits > 3584 * MIB:
        validator.failures.add("services.memory_limits_exceed_3584mib")


def _validate_workloads(validator: _Validator, raw: Any) -> None:
    workloads = validator.mapping(raw, "workloads")
    validator.exact_fields(workloads, set(WORKLOAD_MINIMUMS), "workloads")
    for workload_name, (minimum_duration, minimum_operations) in WORKLOAD_MINIMUMS.items():
        scope = f"workloads.{workload_name}"
        workload = validator.mapping(workloads.get(workload_name), scope)
        validator.exact_fields(workload, _WORKLOAD_FIELDS, scope)
        validator.required_true(workload.get("passed"), f"{scope}.passed")
        validator.integer(
            workload.get("duration_seconds"),
            f"{scope}.duration_seconds",
            minimum=minimum_duration,
        )
        validator.integer(
            workload.get("operation_count"),
            f"{scope}.operation_count",
            minimum=minimum_operations,
        )
        validator.safe_id(workload.get("evidence_id"), f"{scope}.evidence_id")


def assess_evidence(
    record: Any,
    *,
    expected_candidate_sha: str,
    expected_compose_sha256: str,
) -> dict[str, Any]:
    validator = _Validator()
    expected_candidate_valid = _valid_expected_commit(expected_candidate_sha)
    expected_compose_valid = _valid_expected_sha256(expected_compose_sha256)
    if not expected_candidate_valid:
        validator.failures.add("gate.expected_candidate_sha.invalid")
    if not expected_compose_valid:
        validator.failures.add("gate.expected_compose_sha256.invalid")
    if _contains_sensitive_field(record):
        validator.failures.add("privacy.sensitive_field_present")
    top = validator.mapping(record, "record")
    validator.exact_fields(top, _TOP_LEVEL_FIELDS, "record")

    if top.get("schema_version") != SCHEMA_VERSION:
        validator.failures.add("record.schema_version.unsupported")
    validator.safe_id(top.get("run_id"), "record.run_id")
    if top.get("environment") != "capacity-rehearsal":
        validator.failures.add("record.environment.invalid")

    candidate = top.get("candidate_sha")
    if not isinstance(candidate, str) or not _COMMIT_SHA.fullmatch(candidate):
        validator.failures.add("record.candidate_sha.invalid")
    elif len(set(candidate)) == 1:
        validator.failures.add("record.candidate_sha.placeholder")
    elif expected_candidate_valid and candidate != expected_candidate_sha:
        validator.failures.add("record.candidate_sha.mismatch")
    compose_sha = top.get("compose_config_sha256")
    if validator.sha256(compose_sha, "record.compose_config_sha256"):
        if expected_compose_valid and compose_sha != expected_compose_sha256:
            validator.failures.add("record.compose_config_sha256.mismatch")

    timing = validator.mapping(top.get("timing"), "timing")
    validator.exact_fields(timing, _TIMING_FIELDS, "timing")
    started = validator.timestamp(timing.get("started_at"), "timing.started_at")
    ended = validator.timestamp(timing.get("ended_at"), "timing.ended_at")
    host = _validate_host(validator, top.get("host"))
    if started is not None and ended is not None:
        elapsed = (ended - started).total_seconds()
        if elapsed <= 0:
            validator.failures.add("timing.invalid_order")
        observed = host.get("observed_seconds")
        if isinstance(observed, int) and not isinstance(observed, bool) and observed > elapsed:
            validator.failures.add("timing.observation_exceeds_elapsed")

    _validate_services(validator, top.get("services"))
    _validate_workloads(validator, top.get("workloads"))

    controls = validator.mapping(top.get("controls"), "controls")
    validator.exact_fields(controls, _CONTROL_FIELDS, "controls")
    for field in _CONTROL_FIELDS:
        validator.required_true(controls.get(field), f"controls.{field}")

    review = validator.mapping(top.get("review"), "review")
    validator.exact_fields(review, _REVIEW_FIELDS, "review")
    operator_valid = validator.safe_id(review.get("operator_id"), "review.operator_id")
    reviewer_valid = validator.safe_id(review.get("reviewer_id"), "review.reviewer_id")
    if operator_valid and reviewer_valid and review["operator_id"] == review["reviewer_id"]:
        validator.failures.add("review.independent_reviewer_required")
    if review.get("decision") != "approved":
        validator.failures.add("review.decision.not_approved")
    decided_at = validator.timestamp(review.get("decided_at"), "review.decided_at")
    if decided_at is not None and ended is not None and decided_at < ended:
        validator.failures.add("review.decision_precedes_run_end")

    evidence = validator.mapping(top.get("evidence"), "evidence")
    validator.exact_fields(evidence, _EVIDENCE_FIELDS, "evidence")
    for field in _EVIDENCE_FIELDS:
        validator.safe_id(evidence.get(field), f"evidence.{field}")

    failures = sorted(validator.failures)
    passed = not failures
    identity = {
        "run_id": top.get("run_id") if isinstance(top.get("run_id"), str) else None,
        "candidate_sha": candidate if isinstance(candidate, str) else None,
    }
    return {
        "status": "PASS" if passed else "NO-GO",
        "identity": identity,
        "failures": failures,
        "evidence_record_sha256": _record_sha256(record) if passed else None,
    }


def _read_record(path: Path) -> Any:
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("evidence file exceeds size limit")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicate_fields)


def _valid_expected_commit(value: str) -> bool:
    return bool(_COMMIT_SHA.fullmatch(value)) and len(set(value)) > 1


def _valid_expected_sha256(value: str) -> bool:
    return bool(_SHA256.fullmatch(value)) and len(set(value)) > 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-candidate-sha", required=True)
    parser.add_argument("--expected-compose-sha256", required=True)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args(argv)

    if not _valid_expected_commit(args.expected_candidate_sha) or not _valid_expected_sha256(
        args.expected_compose_sha256
    ):
        result = {
            "status": "INPUT-ERROR",
            "identity": {"run_id": None, "candidate_sha": None},
            "failures": ["gate.expected_identity.invalid"],
            "evidence_record_sha256": None,
        }
        print(json.dumps(result, indent=None if args.compact else 2, sort_keys=True))
        return 2
    try:
        record = _read_record(args.evidence)
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
        result = {
            "status": "INPUT-ERROR",
            "identity": {"run_id": None, "candidate_sha": None},
            "failures": ["record.unreadable_or_invalid"],
            "evidence_record_sha256": None,
        }
        print(json.dumps(result, indent=None if args.compact else 2, sort_keys=True))
        return 2

    result = assess_evidence(
        record,
        expected_candidate_sha=args.expected_candidate_sha,
        expected_compose_sha256=args.expected_compose_sha256,
    )
    print(json.dumps(result, indent=None if args.compact else 2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
