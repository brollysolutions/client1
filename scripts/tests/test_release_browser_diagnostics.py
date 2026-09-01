from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"


class ReleaseBrowserDiagnosticsTests(unittest.TestCase):
    def test_failed_release_gate_uploads_bounded_playwright_evidence(self) -> None:
        workflow = CI_WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("id: release-browser", workflow)
        self.assertIn(
            "if: failure() && steps.release-browser.outcome == 'failure'",
            workflow,
        )
        self.assertIn(
            "uses: actions/upload-artifact@"
            "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1",
            workflow,
        )
        self.assertIn("path: apps/web/test-results", workflow)
        self.assertIn("if-no-files-found: error", workflow)
        self.assertIn("retention-days: 7", workflow)


if __name__ == "__main__":
    unittest.main()
