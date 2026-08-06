from __future__ import annotations

import importlib.util
import re
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_feature_tracking.py"
SPEC = importlib.util.spec_from_file_location("check_feature_tracking", MODULE_PATH)
assert SPEC and SPEC.loader
TRACKING = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = TRACKING
SPEC.loader.exec_module(TRACKING)


class FeatureTrackingTests(unittest.TestCase):
    def test_docs_only_change_needs_no_living_file_update(self) -> None:
        self.assertEqual(TRACKING.missing_tracking_files(["README.md"]), [])

    def test_product_change_requires_both_living_files(self) -> None:
        self.assertEqual(
            TRACKING.missing_tracking_files(["apps/api/app/main.py"]),
            [
                "docs/agent-context/feature-status.md",
                "docs/agent-context/implementation-plan.md",
            ],
        )

    def test_one_living_file_is_not_enough(self) -> None:
        self.assertEqual(
            TRACKING.missing_tracking_files(
                [
                    "apps/web/app/page.tsx",
                    "docs/agent-context/feature-status.md",
                ]
            ),
            ["docs/agent-context/implementation-plan.md"],
        )

    def test_product_change_with_both_living_files_passes(self) -> None:
        self.assertEqual(
            TRACKING.missing_tracking_files(
                [
                    "packages/contracts/openapi/openapi.json",
                    "docs/agent-context/feature-status.md",
                    "docs/agent-context/implementation-plan.md",
                ]
            ),
            [],
        )

    def test_root_compose_and_windows_paths_are_product_changes(self) -> None:
        self.assertTrue(TRACKING.is_product_path("docker-compose.yml"))
        missing = TRACKING.missing_tracking_files([r"apps\api\app\main.py"])
        self.assertEqual(len(missing), 2)

    @patch("check_feature_tracking.subprocess.run")
    def test_git_diff_includes_deleted_product_files(self, run_mock) -> None:
        run_mock.return_value = SimpleNamespace(returncode=0, stdout="", stderr="")

        TRACKING.git_changed_files(("--cached",))

        command = run_mock.call_args.args[0]
        self.assertIn("--diff-filter=ACMRD", command)

    def test_feature_status_totals_match_requirement_rows(self) -> None:
        status_path = (
            MODULE_PATH.parents[1] / "docs" / "agent-context" / "feature-status.md"
        )
        text = status_path.read_text(encoding="utf-8")
        summary = {
            label: int(value)
            for label, value in re.findall(
                r"\| (Complete requirements|Partial requirements|Not-started requirements) "
                r"\| (\d+) / 80",
                text,
            )
        }
        rows = re.findall(
            r"^\| FR-[0-9.]+ \| (Partial|Not started) \|", text, re.MULTILINE
        )
        partial = rows.count("Partial")
        not_started = rows.count("Not started")
        complete = 80 - len(rows)

        self.assertEqual(summary["Complete requirements"], complete)
        self.assertEqual(summary["Partial requirements"], partial)
        self.assertEqual(summary["Not-started requirements"], not_started)
        self.assertIn(f"**{(complete + partial * 0.5) / 80:.1%}", text)


if __name__ == "__main__":
    unittest.main()
