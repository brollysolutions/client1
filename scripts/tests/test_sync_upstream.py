from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "sync_upstream", ROOT / "scripts/sync_upstream.py"
)
assert SPEC and SPEC.loader
SYNC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SYNC)


class SyncHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "--initial-branch=fixture")
        self.git("config", "user.name", "Synthetic test")
        self.git("config", "user.email", "synthetic@example.invalid")
        self.base = self.commit("shared.txt", "base")

    def git(self, *args):
        return SYNC.git(self.root, *args)

    def commit(self, name, content):
        (self.root / name).write_text(content, encoding="utf-8")
        self.git("add", name)
        self.git("commit", "-m", "Synthetic fixture")
        return self.git("rev-parse", "HEAD")

    def test_fast_forward_preserves_exact_upstream_commit(self):
        source = self.commit("source.txt", "upstream")
        SYNC.prepare(self.root, self.base, source, SYNC.PREFIX + "fixture")
        self.assertEqual(self.git("rev-parse", "HEAD"), source)

    def test_diverged_histories_preserve_destination_only_content(self):
        source = self.commit("source.txt", "upstream")
        self.git("switch", "--detach", self.base)
        target = self.commit("target.txt", "destination")
        SYNC.prepare(self.root, target, source, SYNC.PREFIX + "fixture")
        self.assertEqual((self.root / "target.txt").read_text(), "destination")
        self.assertEqual((self.root / "source.txt").read_text(), "upstream")
        self.assertTrue(SYNC.contains(self.root, target, "HEAD"))
        self.assertTrue(SYNC.contains(self.root, source, "HEAD"))

    def test_conflict_aborts_without_losing_destination(self):
        source = self.commit("shared.txt", "upstream")
        self.git("switch", "--detach", self.base)
        target = self.commit("shared.txt", "destination")
        with self.assertRaisesRegex(RuntimeError, "merge failed"):
            SYNC.prepare(self.root, target, source, SYNC.PREFIX + "fixture")
        self.assertEqual(self.git("rev-parse", "HEAD"), target)
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_dirty_checkout_is_untouched(self):
        (self.root / "user.txt").write_text("preserve", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "dirty"):
            SYNC.prepare(self.root, self.base, self.base, SYNC.PREFIX + "fixture")
        self.assertEqual(self.git("branch", "--show-current"), "fixture")
        self.assertEqual((self.root / "user.txt").read_text(), "preserve")

    def test_protected_branch_is_rejected(self):
        with self.assertRaises(ValueError):
            SYNC.prepare(self.root, self.base, self.base, "main")
        self.assertEqual(self.git("branch", "--show-current"), "fixture")


class SyncOrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.open_prs = []
        self.previous = []
        self.remote = ""
        self.ancestors = False
        self.api_failure = False
        self.root = Path(".")
        self.enterContext(
            patch.dict(
                os.environ,
                {
                    "GITHUB_REPOSITORY": SYNC.TARGET,
                    "GITHUB_REF": "refs/heads/main",
                    "GITHUB_ACTIONS": "true",
                    "GH_TOKEN": "synthetic-test-only",
                },
            )
        )
        self.enterContext(patch.object(SYNC, "run", side_effect=self.command))
        self.prepare = self.enterContext(patch.object(SYNC, "prepare"))
        self.contains = self.enterContext(
            patch.object(SYNC, "contains", side_effect=lambda *args: self.ancestors)
        )

    def command(self, root, *args, **kwargs):
        self.calls.append(args)
        output = ""
        if args[:2] == ("git", "rev-parse"):
            output = "a" * 40 if args[-1].endswith("sync-source/main") else "b" * 40
        elif args[:2] == ("git", "ls-remote"):
            output = self.remote
        elif args[:3] == ("gh", "pr", "list"):
            if self.api_failure:
                raise RuntimeError("API unavailable")
            output = json.dumps(self.previous if "all" in args else self.open_prs)
        elif args[:3] == ("gh", "pr", "create"):
            output = "https://github.com/vamshisaideep9/client1/pull/999"
        return subprocess.CompletedProcess(args, 0, stdout=output, stderr="")

    def test_wrong_repository_and_branch_and_missing_token_fail_before_commands(self):
        for key, value in (
            ("GITHUB_REPOSITORY", SYNC.SOURCE),
            ("GITHUB_REF", "refs/heads/topic"),
            ("GH_TOKEN", ""),
            ("GITHUB_ACTIONS", "false"),
        ):
            with self.subTest(key=key), patch.dict(os.environ, {key: value}):
                with self.assertRaises(RuntimeError):
                    SYNC.synchronize(self.root)
        self.assertEqual(self.calls, [])

    def test_up_to_date_does_not_create_branch_or_pr(self):
        self.ancestors = True
        self.assertIn("already contains", SYNC.synchronize(self.root))
        self.prepare.assert_not_called()
        self.assertFalse(any(c[0] == "gh" for c in self.calls))

    def test_existing_sync_pr_blocks_duplicates(self):
        self.open_prs = [
            {
                "headRefName": SYNC.PREFIX + "f509382",
                "headRepositoryOwner": {"login": "vamshisaideep9"},
                "url": "existing",
            }
        ]
        self.assertIn("awaits review", SYNC.synchronize(self.root))
        self.prepare.assert_not_called()

    def test_closed_snapshot_is_not_reopened(self):
        self.previous = [{"url": "closed"}]
        self.assertIn("already has a PR", SYNC.synchronize(self.root))
        self.prepare.assert_not_called()

    def test_api_failure_cannot_be_treated_as_no_open_prs(self):
        self.api_failure = True
        with self.assertRaisesRegex(RuntimeError, "API unavailable"):
            SYNC.synchronize(self.root)
        self.prepare.assert_not_called()
        self.assertFalse(any(c[:2] == ("git", "push") for c in self.calls))

    def test_only_new_branch_is_pushed_and_pr_is_never_merged(self):
        self.assertIn("/pull/999", SYNC.synchronize(self.root))
        pushes = [c for c in self.calls if c[:2] == ("git", "push")]
        self.assertEqual(len(pushes), 1)
        self.assertEqual(
            pushes[0][-1],
            "HEAD:refs/heads/" + SYNC.PREFIX + "aaaaaaaaaaaa-bbbbbbbbbbbb",
        )
        self.assertNotIn("--force", pushes[0])
        self.assertFalse(any(c[:3] == ("gh", "pr", "merge") for c in self.calls))

    def test_existing_remote_branch_resumes_only_after_ancestry_validation(self):
        self.remote = "c" * 40
        self.contains.side_effect = [False, True, True]
        self.assertIn("/pull/999", SYNC.synchronize(self.root))
        self.prepare.assert_not_called()
        self.assertFalse(any(c[:2] == ("git", "push") for c in self.calls))

    def test_unexpected_remote_branch_fails_without_overwrite_or_pr(self):
        self.remote = "c" * 40
        with self.assertRaisesRegex(RuntimeError, "does not retain"):
            SYNC.synchronize(self.root)
        self.assertFalse(
            any(
                c[:2] == ("git", "push") or c[:3] == ("gh", "pr", "create")
                for c in self.calls
            )
        )

    def test_merge_failure_prevents_push_and_pr(self):
        self.prepare.side_effect = RuntimeError("merge failed")
        with self.assertRaisesRegex(RuntimeError, "merge failed"):
            SYNC.synchronize(self.root)
        self.assertFalse(
            any(
                c[:2] == ("git", "push") or c[:3] == ("gh", "pr", "create")
                for c in self.calls
            )
        )


if __name__ == "__main__":
    unittest.main()
