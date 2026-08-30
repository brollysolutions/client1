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
        self.assertEqual(len(final_images), 5)
        for image in final_images:
            self.assertRegex(
                image,
                r"^\$\{RUNTIME_IMAGE_REGISTRY\?[^}]+\}/[a-z]+:"
                r"[0-9][a-zA-Z0-9.-]+@sha256:\$\{[A-Z]+_IMAGE_SHA256\?[^}]+\}$",
            )

        expected_final_references = (
            "/postgres:18.6-alpine3.24-20260830@sha256:${POSTGRES_IMAGE_SHA256?",
            "/redis:8.10.1-alpine3.23-20260830@sha256:${REDIS_IMAGE_SHA256?",
            "/clamav:1.4.6-alpine3.24-20260830@sha256:${CLAMAV_IMAGE_SHA256?",
            "/pgbouncer:1.25.2-alpine3.23-20260830@sha256:${PGBOUNCER_IMAGE_SHA256?",
            "/nginx:1.30.4-alpine3.24-20260830@sha256:${NGINX_IMAGE_SHA256?",
        )
        for reference in expected_final_references:
            self.assertIn(reference, compose)

        self.assertNotIn("BASE_IMAGE:", compose)
        self.assertNotIn("@sha256:${", build_compose)

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
        pgbouncer_wrapper = (runtime_dir / "pgbouncer.Dockerfile").read_text(encoding="utf-8")
        postgres_wrapper = (runtime_dir / "postgres.Dockerfile").read_text(encoding="utf-8")

        for dockerfile in (alpine_wrapper, pgbouncer_wrapper, postgres_wrapper):
            self.assertIn("ARG BASE_IMAGE\nFROM ${BASE_IMAGE}", dockerfile)
            self.assertIn("RUN apk add --no-cache --upgrade", dockerfile)
            self.assertNotIn("RUN apk upgrade", dockerfile)
            self.assertIn('"libcrypto3=3.5.8-r0"', dockerfile)
            self.assertIn('"libssl3=3.5.8-r0"', dockerfile)

        self.assertTrue(pgbouncer_wrapper.rstrip().endswith("USER postgres"))
        self.assertIn('"libpq=18.6-r0"', pgbouncer_wrapper)
        self.assertIn('"postgresql18-client=18.6-r0"', pgbouncer_wrapper)
        self.assertIn("rm -f /usr/local/bin/gosu", postgres_wrapper)
        self.assertTrue(postgres_wrapper.rstrip().endswith("USER postgres"))

    def test_api_image_exposes_the_locked_virtualenv_to_the_non_root_user(self) -> None:
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")
        production_stage = dockerfile.split("FROM base AS prod", maxsplit=1)[1]

        self.assertIn('ENV PATH="/app/.venv/bin:${PATH}"', production_stage)
        self.assertNotIn("ENV UV_SYSTEM_PYTHON=1", production_stage)
        self.assertLess(production_stage.index("USER app"), production_stage.index("ENV PATH="))

    def test_production_services_do_not_invoke_uv_with_a_homeless_user(self) -> None:
        compose = (ROOT / "docker-compose.prod.example.yml").read_text(encoding="utf-8")

        self.assertNotIn("command: uv run --no-sync", compose)
        self.assertIn(
            "command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4",
            compose,
        )
        self.assertIn("command: python -m app.scheduler.main", compose)

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


if __name__ == "__main__":
    unittest.main()
