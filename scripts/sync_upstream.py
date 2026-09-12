"""Open one sync PR from a disposable Actions checkout; never merge or force-push."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

SOURCE = "brollysolutions/client1"
TARGET = "vamshisaideep9/client1"
PREFIX = "chore/sync-upstream-main-"


def run(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=root, text=True, capture_output=True, check=False)
    if check and result.returncode:
        # Do not repeat credentials, arbitrary remote responses or source content.
        raise RuntimeError(f"{args[0]} {args[1]} failed (exit {result.returncode})")
    return result


def git(root: Path, *args: str) -> str:
    return run(root, "git", *args).stdout.strip()


def contains(root: Path, ancestor: str, descendant: str) -> bool:
    result = run(
        root, "git", "merge-base", "--is-ancestor", ancestor, descendant, check=False
    )
    if result.returncode not in (0, 1):
        raise RuntimeError("Could not compare Git histories")
    return result.returncode == 0


def prepare(root: Path, target: str, source: str, branch: str) -> None:
    """Merge on a new disposable branch, retaining both histories or failing closed."""
    if not branch.startswith(PREFIX):
        raise ValueError("Only a dedicated sync branch may be written")
    if git(root, "status", "--porcelain"):
        raise RuntimeError("Refusing to change a dirty checkout")
    git(root, "switch", "--create", branch, target)
    result = run(root, "git", "merge", "--no-edit", source, check=False)
    if result.returncode:
        run(root, "git", "merge", "--abort", check=False)
        raise RuntimeError("Upstream merge failed; resolve the histories manually")
    if not contains(root, target, "HEAD") or not contains(root, source, "HEAD"):
        raise RuntimeError("Sync candidate does not retain both histories")


def synchronize(root: Path) -> str:
    if (
        os.environ.get("GITHUB_REPOSITORY") != TARGET
        or os.environ.get("GITHUB_REF") != "refs/heads/main"
    ):
        raise RuntimeError("Sync is restricted to the destination main workflow")
    if os.environ.get("GITHUB_ACTIONS") != "true" or not os.environ.get("GH_TOKEN"):
        raise RuntimeError("A disposable Actions checkout with SYNC_PAT is required")
    # Fetch only fixed, approved repositories. Never execute the fetched source.
    git(
        root,
        "fetch",
        "--no-tags",
        f"https://github.com/{TARGET}.git",
        "main:refs/remotes/sync-target/main",
    )
    git(
        root,
        "fetch",
        "--no-tags",
        f"https://github.com/{SOURCE}.git",
        "main:refs/remotes/sync-source/main",
    )
    target = git(root, "rev-parse", "refs/remotes/sync-target/main")
    source = git(root, "rev-parse", "refs/remotes/sync-source/main")
    if contains(root, source, target):
        return "Destination main already contains upstream main."

    prs = json.loads(
        run(
            root,
            "gh",
            "pr",
            "list",
            "--repo",
            TARGET,
            "--base",
            "main",
            "--state",
            "open",
            "--limit",
            "1000",
            "--json",
            "headRefName,headRepositoryOwner,url",
        ).stdout
    )
    for pr in prs:
        if (
            pr["headRefName"].startswith(PREFIX)
            and pr["headRepositoryOwner"]["login"] == TARGET.split("/")[0]
        ):
            return f"Existing sync PR awaits review: {pr['url']}"
    # Do not turn a deliberately closed PR into an endless sequence of retries.
    branch = f"{PREFIX}{source[:12]}-{target[:12]}"
    previous = json.loads(
        run(
            root,
            "gh",
            "pr",
            "list",
            "--repo",
            TARGET,
            "--head",
            branch,
            "--base",
            "main",
            "--state",
            "all",
            "--json",
            "url",
        ).stdout
    )
    if previous:
        return f"This snapshot already has a PR: {previous[0]['url']}"

    # Recover a push-success / PR-create-failure without replacing any remote ref.
    remote = git(
        root, "ls-remote", f"https://github.com/{TARGET}.git", f"refs/heads/{branch}"
    )
    if remote:
        git(
            root,
            "fetch",
            "--no-tags",
            f"https://github.com/{TARGET}.git",
            f"refs/heads/{branch}",
        )
        candidate = git(root, "rev-parse", "FETCH_HEAD")
        if not contains(root, target, candidate) or not contains(
            root, source, candidate
        ):
            raise RuntimeError("Existing sync branch does not retain both snapshots")
    else:
        prepare(root, target, source, branch)
        git(
            root,
            "push",
            f"https://github.com/{TARGET}.git",
            f"HEAD:refs/heads/{branch}",
        )

    body = (
        f"Bring {SOURCE} main at `{source}` into {TARGET} main at `{target}`.\n\n"
        "Both Git histories are retained, including destination-only commits. "
        "No force push or protected-branch write was performed.\n\n"
        "Review the diff and require the normal CI/security checks before merging. "
        "Use a merge commit to preserve upstream ancestry. This workflow does not "
        "merge PRs or deploy. Existing main-to-prod automation may run after a human merge."
    )
    return run(
        root,
        "gh",
        "pr",
        "create",
        "--repo",
        TARGET,
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        f"chore: sync upstream main at {source[:12]}",
        "--body",
        body,
    ).stdout.strip()


if __name__ == "__main__":
    print(synchronize(Path.cwd()))
