from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "agent_workflow.py"
SPEC = importlib.util.spec_from_file_location("agent_workflow", MODULE_PATH)
assert SPEC and SPEC.loader
WORKFLOW = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = WORKFLOW
SPEC.loader.exec_module(WORKFLOW)


class AgentWorkflowUnitTests(unittest.TestCase):
    def test_slugify_removes_agent_invocations_and_limits_words(self) -> None:
        self.assertEqual(
            WORKFLOW.slugify("$work-feature Add secure payout retry behavior please"),
            "add-secure-payout-retry-behavior-please",
        )

    def test_sensitive_paths_allow_examples_only(self) -> None:
        self.assertTrue(WORKFLOW.is_sensitive_path(".env"))
        self.assertTrue(WORKFLOW.is_sensitive_path("./.env"))
        self.assertTrue(WORKFLOW.is_sensitive_path("apps/api/.env.local"))
        self.assertTrue(WORKFLOW.is_sensitive_path("secrets/prod.pem"))
        self.assertTrue(WORKFLOW.is_sensitive_path("backup/app.dump"))
        self.assertTrue(WORKFLOW.is_sensitive_path("credentials.json"))
        self.assertTrue(WORKFLOW.is_sensitive_path("signing.keystore"))
        self.assertFalse(WORKFLOW.is_sensitive_path("apps/api/.env.local.example"))
        self.assertFalse(WORKFLOW.is_sensitive_path("apps/api/.env.example"))

    def test_extracts_sensitive_paths_from_patch_input(self) -> None:
        paths = WORKFLOW.tool_paths(
            {"command": "*** Begin Patch\n*** Update File: apps/api/.env.local\n*** End Patch"}
        )
        self.assertEqual(paths, ("apps/api/.env.local",))
        self.assertEqual(
            WORKFLOW.tool_paths({"paths": ["fixtures/avatar.png", "apps/api/.env"]}),
            ("fixtures/avatar.png", "apps/api/.env"),
        )

    def test_parse_github_remote_formats(self) -> None:
        expected = ("brollysolutions", "client1")
        self.assertEqual(
            WORKFLOW.parse_github_repo("https://github.com/brollysolutions/client1.git"), expected
        )
        self.assertEqual(
            WORKFLOW.parse_github_repo("git@github.com:brollysolutions/client1.git"), expected
        )
        self.assertEqual(
            WORKFLOW.parse_github_repo("ssh://git@github.com/brollysolutions/client1.git"), expected
        )

    def test_blocks_protected_push_and_destructive_git(self) -> None:
        self.assertIsNotNone(WORKFLOW.command_is_blocked("git push origin main", "feat/x"))
        self.assertIsNotNone(WORKFLOW.command_is_blocked("git push", "main"))
        self.assertIsNotNone(WORKFLOW.command_is_blocked("git reset --hard HEAD~1", "feat/x"))
        self.assertIsNotNone(WORKFLOW.command_is_blocked("git add apps/api/.env.local", "feat/x"))
        self.assertIsNone(WORKFLOW.command_is_blocked("git push origin feat/x", "feat/x"))
        self.assertIsNone(WORKFLOW.command_is_blocked("git add apps/api/.env.example", "feat/x"))

    def test_conventional_title_policy(self) -> None:
        self.assertIsNotNone(WORKFLOW.CONVENTIONAL_TITLE.fullmatch("feat(auth): add warning"))
        self.assertIsNotNone(WORKFLOW.CONVENTIONAL_TITLE.fullmatch("security: tighten RLS"))
        self.assertIsNone(WORKFLOW.CONVENTIONAL_TITLE.fullmatch("Add warning"))


class AgentWorkflowIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp_dir.name)
        self.run_git("init", "--initial-branch=main")
        self.run_git("config", "user.name", "Workflow Test")
        self.run_git("config", "user.email", "workflow@example.test")
        (self.repo / "README.md").write_text("test\n", encoding="utf-8")
        self.run_git("add", "README.md")
        self.run_git("commit", "-m", "chore: initialize fixture")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def run_git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ("git", *args),
            cwd=self.repo,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )

    def run_hook(self, event: dict[str, object]) -> dict[str, object]:
        event.setdefault("cwd", str(self.repo))
        result = subprocess.run(
            (sys.executable, str(MODULE_PATH), "hook", "--agent", "codex"),
            cwd=self.repo,
            input=json.dumps(event),
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_prompt_creates_task_branch_before_changes(self) -> None:
        output = self.run_hook(
            {"hook_event_name": "UserPromptSubmit", "prompt": "Add payout receipt"}
        )
        branch = self.run_git("branch", "--show-current").stdout.strip()
        self.assertRegex(branch, r"^codex/\d{8}-\d{6}-add-payout-receipt$")
        self.assertIn(branch, output["hookSpecificOutput"]["additionalContext"])

    def test_prompt_blocks_dirty_protected_branch(self) -> None:
        (self.repo / "README.md").write_text("changed\n", encoding="utf-8")
        output = self.run_hook(
            {"hook_event_name": "UserPromptSubmit", "prompt": "Add payout receipt"}
        )
        self.assertEqual(output["decision"], "block")
        self.assertEqual(self.run_git("branch", "--show-current").stdout.strip(), "main")


if __name__ == "__main__":
    unittest.main()
