from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ProductionRuntimeContractTests(unittest.TestCase):
    def test_reviewed_production_service_bases_are_versioned_and_digest_pinned(
        self,
    ) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")
        build_compose = (ROOT / "docker-compose.runtime-images.yml").read_text(encoding="utf-8")
        base_images = re.findall(r"^\s+BASE_IMAGE:\s+(\S+)$", build_compose, re.MULTILINE)

        expected_bases = {
            "postgres:18.6-alpine3.24@sha256:"
            "d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2",
            "redis:8.10.1-alpine3.23@sha256:"
            "becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576",
            "clamav/clamav:1.4.6@sha256:"
            "761f6c99b8d9134b39431f8c200189cda749b17310091561bfa8b732f32bfada",
            "edoburu/pgbouncer:v1.25.2-p0@sha256:"
            "7d7a27d9e90985cab5cf42256f5c13a3120baa4b055b69df37beb272b89b2340",
            "nginx:1.30.4-alpine3.24@sha256:"
            "97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46",
        }
        self.assertEqual(set(base_images), expected_bases)
        for image in base_images:
            self.assertRegex(
                image,
                r"^[a-z0-9./_-]+:[a-zA-Z0-9._-]+@sha256:[0-9a-f]{64}$",
            )

        final_images = re.findall(r'^\s+image:\s+"([^"]+)"$', compose, re.MULTILINE)
        self.assertEqual(len(final_images), 6)
        for image in final_images:
            self.assertRegex(
                image,
                r"^\$\{RUNTIME_IMAGE_REGISTRY\?[^}]+\}/[a-z-]+:"
                r"[a-zA-Z0-9][a-zA-Z0-9.-]+@sha256:"
                r"\$\{[A-Z_]+_IMAGE_SHA256\?[^}]+\}$",
            )

        expected_final_references = (
            "/postgres:18.6-alpine3.24-20260830@sha256:${POSTGRES_IMAGE_SHA256?",
            "/redis:8.10.1-alpine3.23-20260830@sha256:${REDIS_IMAGE_SHA256?",
            "/clamav:1.4.6-alpine3.24-20260830@sha256:${CLAMAV_IMAGE_SHA256?",
            "/pgbouncer:1.25.2-alpine3.23-20260830@sha256:${PGBOUNCER_IMAGE_SHA256?",
            "/nginx:1.30.4-alpine3.24-20260830@sha256:${NGINX_IMAGE_SHA256?",
            "/media-runtime:python3.12-alpine3.23-ffmpeg8-20260831@sha256:"
            "${MEDIA_RUNTIME_IMAGE_SHA256?",
        )
        for reference in expected_final_references:
            self.assertIn(reference, compose)

        self.assertNotIn("BASE_IMAGE:", compose)
        self.assertNotIn("@sha256:${", build_compose)
        self.assertIn(
            "/media-runtime:python3.12-alpine3.23-ffmpeg8-20260831",
            build_compose,
        )
        self.assertIn("context: ./apps/media-runtime", build_compose)

        obsolete_images = (
            "postgres:18\n",
            "redis:8-alpine",
            "clamav/clamav:1.4\n",
            "edoburu/pgbouncer:v1.23.1-p3",
            "nginx:1.27-alpine",
        )
        for image in obsolete_images:
            self.assertNotIn(image, compose)

    def test_security_wrappers_refresh_packages_without_changing_runtime_users(
        self,
    ) -> None:
        runtime_dir = ROOT / "infra/docker/runtime"
        alpine_wrapper = (runtime_dir / "alpine-security-updates.Dockerfile").read_text(
            encoding="utf-8"
        )
        nginx_wrapper = (runtime_dir / "nginx.Dockerfile").read_text(encoding="utf-8")
        pgbouncer_wrapper = (runtime_dir / "pgbouncer.Dockerfile").read_text(encoding="utf-8")
        postgres_wrapper = (runtime_dir / "postgres.Dockerfile").read_text(encoding="utf-8")

        for dockerfile in (
            alpine_wrapper,
            nginx_wrapper,
            pgbouncer_wrapper,
            postgres_wrapper,
        ):
            self.assertIn("ARG BASE_IMAGE\nFROM ${BASE_IMAGE}", dockerfile)
            self.assertIn("RUN apk add --no-cache --upgrade", dockerfile)
            self.assertNotIn("RUN apk upgrade", dockerfile)
            self.assertIn('"libcrypto3=3.5.8-r0"', dockerfile)
            self.assertIn('"libssl3=3.5.8-r0"', dockerfile)

        self.assertIn('"libexpat=2.8.4-r0"', nginx_wrapper)
        self.assertNotIn('"libexpat=', alpine_wrapper)
        self.assertTrue(pgbouncer_wrapper.rstrip().endswith("USER postgres"))
        self.assertIn('"libpq=18.6-r0"', pgbouncer_wrapper)
        self.assertIn('"postgresql18-client=18.6-r0"', pgbouncer_wrapper)
        self.assertIn("rm -f /usr/local/bin/gosu", postgres_wrapper)
        self.assertTrue(postgres_wrapper.rstrip().endswith("USER postgres"))

    def test_api_image_exposes_the_locked_virtualenv_to_the_non_root_user(self) -> None:
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")
        production_stage = dockerfile.split("FROM base AS prod", maxsplit=1)[1]

        self.assertIn(
            "FROM python:3.12-alpine3.23@sha256:"
            "31a768b01976652c222e318fe5bd6e7c252f056cbf489c88fa256f1bf0af58e3 AS base",
            dockerfile,
        )
        self.assertIn(
            "FROM ghcr.io/astral-sh/uv:0.5@sha256:"
            "7bff3c3776ec467fc1437960f2c469d8beb30f536a6465a3350c647ccd260ec2 AS uv-bin",
            dockerfile,
        )
        self.assertIn('"libcrypto3=3.5.8-r0"', dockerfile)
        self.assertIn('"libssl3=3.5.8-r0"', dockerfile)
        self.assertIn('"sqlite-libs=3.53.4-r0"', dockerfile)
        self.assertNotIn("apt-get", dockerfile)
        self.assertIn('ENV PATH="/app/.venv/bin:${PATH}"', production_stage)
        self.assertNotIn("ENV UV_SYSTEM_PYTHON=1", production_stage)
        self.assertLess(production_stage.index("USER app"), production_stage.index("ENV PATH="))
        self.assertNotIn("COPY --from=uv-bin", production_stage)

    def test_api_jwt_dependency_avoids_the_unused_ecdsa_implementation(self) -> None:
        pyproject = (ROOT / "apps/api/pyproject.toml").read_text(encoding="utf-8")
        security_source = (ROOT / "apps/api/app/core/security.py").read_text(
            encoding="utf-8"
        )

        self.assertIn('"PyJWT[crypto]>=2.10.1,<3"', pyproject)
        self.assertNotIn("python-jose", pyproject)
        self.assertNotIn("from jose", security_source)
        self.assertIn("from jwt import PyJWTError as JWTError", security_source)

    def test_api_and_scheduler_image_contains_no_native_media_parser(self) -> None:
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")

        self.assertNotIn("install -y --no-install-recommends ffmpeg", dockerfile)
        self.assertNotIn("MEDIA_FFMPEG_BINARY", dockerfile)

    def test_production_services_do_not_invoke_uv_with_a_homeless_user(self) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")

        self.assertNotIn("command: uv run --no-sync", compose)
        self.assertIn(
            'command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", '
            '"--port", "8000", "--workers", "${API_WORKERS:-1}", '
            '"--limit-concurrency", "${API_LIMIT_CONCURRENCY:-64}", '
            '"--backlog", "${API_BACKLOG:-64}"]',
            compose,
        )
        self.assertIn("command: python -m app.scheduler.main", compose)

    def test_compact_profile_bounds_memory_and_expensive_concurrency(self) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")
        profile = (ROOT / "infra/capacity/4gb.env.example").read_text(encoding="utf-8")

        memory_defaults = dict(
            re.findall(
                r"^\s+mem_limit:\s+\$\{([A-Z_]+):-([0-9]+)m\}$",
                compose,
                re.MULTILINE,
            )
        )
        expected_memory_mib = {
            "POSTGRES_MEMORY_LIMIT": "352",
            "REDIS_MEMORY_LIMIT": "64",
            "CLAMAV_MEMORY_LIMIT": "1408",
            "PGBOUNCER_MEMORY_LIMIT": "32",
            "MEDIA_RUNTIME_MEMORY_LIMIT": "768",
            "API_MEMORY_LIMIT": "384",
            "SCHEDULER_MEMORY_LIMIT": "224",
            "WEB_MEMORY_LIMIT": "224",
            "NGINX_MEMORY_LIMIT": "32",
        }
        self.assertEqual(memory_defaults, expected_memory_mib)
        self.assertLessEqual(sum(map(int, memory_defaults.values())), 3584)
        for variable, value in expected_memory_mib.items():
            self.assertIn(f"memory: ${{{variable}:-{value}m}}", compose)
            self.assertIn(f"{variable}={value}m", profile)

        for required in (
            '"shared_buffers=${POSTGRES_SHARED_BUFFERS:-128MB}"',
            '"max_connections=${POSTGRES_MAX_CONNECTIONS:-40}"',
            '"--maxmemory", "${REDIS_MAXMEMORY:-32mb}"',
            '"--maxmemory-policy", "noeviction"',
            'MAX_CLIENT_CONN: "${PGBOUNCER_MAX_CLIENT_CONN:-100}"',
            'DEFAULT_POOL_SIZE: "${PGBOUNCER_DEFAULT_POOL_SIZE:-10}"',
            'ARGON2_CONCURRENCY: "${ARGON2_CONCURRENCY:-2}"',
            '"--limit-concurrency", "${API_LIMIT_CONCURRENCY:-64}"',
            '"--backlog", "${API_BACKLOG:-64}"',
            'SCHEDULER_JOB_CONCURRENCY: "${SCHEDULER_JOB_CONCURRENCY:-1}"',
            'MEDIA_PROCESS_CONCURRENCY: "${MEDIA_PROCESS_CONCURRENCY:-1}"',
            'MEDIA_PROCESS_BATCH_SIZE: "${MEDIA_PROCESS_BATCH_SIZE:-1}"',
            'DB_POOL_SIZE: "${DB_POOL_SIZE:-3}"',
            'DB_MAX_OVERFLOW: "${DB_MAX_OVERFLOW:-2}"',
        ):
            self.assertIn(required, compose)

        for required in (
            'CLAMAV_NO_FRESHCLAMD: "${CLAMAV_NO_FRESHCLAMD:-true}"',
            'CLAMD_CONF_ConcurrentDatabaseReload: "${CLAMAV_CONCURRENT_DATABASE_RELOAD:-no}"',
            'CLAMD_CONF_MaxThreads: "${CLAMAV_MAX_THREADS:-1}"',
            'CLAMD_CONF_MaxQueue: "${CLAMAV_MAX_QUEUE:-2}"',
            'CLAMD_CONF_StreamMaxLength: "${CLAMAV_STREAM_MAX_LENGTH:-21M}"',
            'CLAMD_CONF_MaxFileSize: "${CLAMAV_MAX_FILE_SIZE:-21M}"',
            'CLAMD_CONF_MaxScanSize: "${CLAMAV_MAX_SCAN_SIZE:-64M}"',
            'CLAMD_CONF_AlertExceedsMax: "yes"',
        ):
            self.assertIn(required, compose)
        self.assertNotIn("FRESHCLAM_CONF_TestDatabases", compose)
        self.assertNotIn("FRESHCLAM_CONF_TestDatabases", profile)

    def test_compact_clamav_database_update_is_serialized_and_fail_closed(self) -> None:
        updater = (ROOT / "scripts/update-clamav-db.sh").read_text(encoding="utf-8")

        for required in (
            "set -Eeuo pipefail",
            "flock -n 9",
            '"${compose[@]}" stop -t 30 clamav',
            "-e CLAMAV_NO_CLAMD=true",
            "-e CLAMAV_NO_FRESHCLAMD=true",
            "clamav freshclam --stdout --user=clamav",
            '"${compose[@]}" up -d clamav',
            "clamdscan --ping 10",
            "trap restart_scanner_on_exit EXIT",
        ):
            self.assertIn(required, updater)
        self.assertNotIn("TestDatabases no", updater)
        self.assertNotIn("docker system prune", updater)
        self.assertLess(
            updater.index("scanner_stopped=true"),
            updater.index('"${compose[@]}" stop -t 30 clamav'),
        )

    def test_web_runtime_removes_package_managers_and_applies_security_updates(self) -> None:
        dockerfile = (ROOT / "apps/web/Dockerfile").read_text(encoding="utf-8")
        production_stage = dockerfile.split("FROM base AS prod", maxsplit=1)[1]

        self.assertIn("apk upgrade --no-cache", production_stage)
        self.assertIn("rm -rf /usr/local/lib/node_modules/npm", production_stage)
        self.assertIn("/usr/local/bin/corepack", production_stage)
        self.assertEqual(production_stage.count('CMD ["node", "server.js"]'), 1)

    def test_python_security_audit_uses_the_frozen_lock_and_pinned_tools(self) -> None:
        workflow = (ROOT / ".github/workflows/security.yml").read_text(encoding="utf-8")

        self.assertIn("pip install uv==0.12.1", workflow)
        self.assertIn("uv export --frozen --no-dev --no-emit-project", workflow)
        self.assertIn("uv tool run --from pip-audit==2.10.1 pip-audit", workflow)
        self.assertNotIn("uv pip compile pyproject.toml", workflow)
        self.assertNotIn("--ignore-vuln", workflow)
        self.assertNotIn("PYSEC-2026-1325", workflow)
        self.assertNotIn("python-jose", workflow)

    def test_api_scheduler_and_web_runtime_is_read_only_and_least_privilege(
        self,
    ) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")
        next_config = (ROOT / "apps/web/next.config.ts").read_text(encoding="utf-8")
        api_dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")
        web_dockerfile = (ROOT / "apps/web/Dockerfile").read_text(encoding="utf-8")
        api_block = compose.split("  api:", maxsplit=1)[1].split(
            "\n  scheduler:", maxsplit=1
        )[0]
        scheduler_block = compose.split("  scheduler:", maxsplit=1)[1].split(
            "\n  web:", maxsplit=1
        )[0]
        web_block = compose.split("  web:", maxsplit=1)[1].split(
            "\n  nginx:", maxsplit=1
        )[0]

        for block in (api_block, scheduler_block, web_block):
            for required in (
                "init: true",
                "read_only: true",
                "cap_drop:\n      - ALL",
                "security_opt:\n      - no-new-privileges:true",
            ):
                self.assertIn(required, block)
            self.assertNotIn("volumes:", block)

        api_tmpfs = "/tmp:size=64m,mode=1770,uid=100,gid=101,noexec,nosuid,nodev"
        self.assertIn(api_tmpfs, api_block)
        self.assertIn(api_tmpfs, scheduler_block)
        self.assertIn("pids_limit: 256", api_block)
        self.assertIn("pids: 256", api_block)
        self.assertIn("pids_limit: 128", scheduler_block)
        self.assertIn("pids: 128", scheduler_block)

        self.assertIn(api_tmpfs, web_block)
        self.assertNotIn("/app/.next/cache", web_block)
        self.assertIn("pids_limit: 128", web_block)
        self.assertIn("pids: 128", web_block)
        self.assertIn("isrFlushToDisk: false", next_config)
        self.assertIn("addgroup -S -g 101 app", api_dockerfile)
        self.assertIn("adduser -S -D -H -u 100 -G app app", api_dockerfile)
        self.assertIn("addgroup --system --gid 101 nodejs", web_dockerfile)
        self.assertIn(
            "adduser --system --uid 100 --ingroup nodejs --no-create-home nextjs",
            web_dockerfile,
        )

    def test_media_runtime_is_secretless_internal_and_least_privilege(self) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")
        runtime_block = compose.split("  media-runtime:", maxsplit=1)[1].split(
            "\n  api:", maxsplit=1
        )[0]
        scheduler_block = compose.split("  scheduler:", maxsplit=1)[1].split(
            "\n  web:", maxsplit=1
        )[0]
        api_block = compose.split("  api:", maxsplit=1)[1].split("\n  scheduler:", maxsplit=1)[0]

        for required in (
            "/media-runtime:python3.12-alpine3.23-ffmpeg8-20260831@sha256:"
            "${MEDIA_RUNTIME_IMAGE_SHA256?",
            'user: "10001:10001"',
            "read_only: true",
            "/tmp:size=64m,mode=1770,uid=10001,gid=10001,noexec,nosuid,nodev",
            "- ALL",
            "no-new-privileges:true",
            "cpus: ${MEDIA_RUNTIME_CPUS:-1.0}",
            "mem_limit: ${MEDIA_RUNTIME_MEMORY_LIMIT:-768m}",
            "pids_limit: 64",
            "- media-control",
        ):
            self.assertIn(required, runtime_block)
        self.assertNotIn("env_file", runtime_block)
        self.assertNotIn("build:", runtime_block)
        self.assertNotIn("ports:", runtime_block)
        self.assertNotIn("volumes:", runtime_block)
        self.assertIn("- media-control", scheduler_block)
        self.assertNotIn("- media-control", api_block)
        self.assertIn("media-control:\n    internal: true", compose)

    def test_media_runtime_image_has_only_bounded_native_worker(self) -> None:
        dockerfile = (ROOT / "apps/media-runtime/Dockerfile").read_text(encoding="utf-8")

        self.assertIn(
            "FROM alpine:3.23@sha256:"
            "fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40",
            dockerfile,
        )
        self.assertIn('"python3=3.12.14-r0"', dockerfile)
        self.assertIn('"ffmpeg=8.0.1-r1"', dockerfile)
        self.assertIn('"libcrypto3=3.5.8-r0"', dockerfile)
        self.assertIn('"libssl3=3.5.8-r0"', dockerfile)
        self.assertIn('"sqlite-libs=3.53.4-r0"', dockerfile)
        self.assertNotIn("apt-get", dockerfile)
        self.assertIn("MEDIA_TRANSCODE_TIMEOUT_SECONDS=180", dockerfile)
        self.assertIn("MEDIA_PROCESS_ADDRESS_SPACE_BYTES=1342177280", dockerfile)
        self.assertIn("MEDIA_PROCESS_FILE_SIZE_BYTES=20971520", dockerfile)
        self.assertIn("MEDIA_PROCESS_OPEN_FILES=64", dockerfile)
        self.assertIn("MEDIA_PROCESS_COUNT=32", dockerfile)
        self.assertIn("USER 10001:10001", dockerfile)
        self.assertNotIn("COPY ../api", dockerfile)
        self.assertIn("--timeout=10s", dockerfile)
        self.assertIn("timeout=8", dockerfile)


if __name__ == "__main__":
    unittest.main()
