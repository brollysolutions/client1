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
