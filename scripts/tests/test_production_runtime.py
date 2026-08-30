from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ProductionRuntimeContractTests(unittest.TestCase):
    def test_api_image_exposes_the_locked_virtualenv_to_the_non_root_user(self) -> None:
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")
        production_stage = dockerfile.split("FROM base AS prod", maxsplit=1)[1]

        self.assertIn('ENV PATH="/app/.venv/bin:${PATH}"', production_stage)
        self.assertNotIn("ENV UV_SYSTEM_PYTHON=1", production_stage)
        self.assertLess(production_stage.index("USER app"), production_stage.index("ENV PATH="))

    def test_api_and_scheduler_image_contains_no_native_media_parser(self) -> None:
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text(encoding="utf-8")

        self.assertNotIn("install -y --no-install-recommends ffmpeg", dockerfile)
        self.assertNotIn("MEDIA_FFMPEG_BINARY", dockerfile)

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
            "context: ./apps/media-runtime",
            'user: "10001:10001"',
            "read_only: true",
            "/tmp:size=64m,mode=1770,uid=10001,gid=10001,noexec,nosuid,nodev",
            "- ALL",
            "no-new-privileges:true",
            "cpus: 1.0",
            "mem_limit: 768m",
            "pids_limit: 64",
            "- media-control",
        ):
            self.assertIn(required, runtime_block)
        self.assertNotIn("env_file", runtime_block)
        self.assertNotIn("ports:", runtime_block)
        self.assertNotIn("volumes:", runtime_block)
        self.assertIn("- media-control", scheduler_block)
        self.assertNotIn("- media-control", api_block)
        self.assertIn("media-control:\n    internal: true", compose)

    def test_media_runtime_image_has_only_bounded_native_worker(self) -> None:
        dockerfile = (ROOT / "apps/media-runtime/Dockerfile").read_text(encoding="utf-8")

        self.assertIn(
            "FROM python:3.12-slim@sha256:"
            "09f7da3bc104798d0afb40bc08d23ab2da20a76130cec1f2ef170848f5d85217",
            dockerfile,
        )
        self.assertIn("apt-get install -y --no-install-recommends ffmpeg", dockerfile)
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
