#!/usr/bin/env python3
"""Shared Codex/Claude branch, safety, and pull-request workflow."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlparse

PROTECTED_BRANCHES = {"main", "master", "prod"}
MUTATING_TOOLS = {"apply_patch", "Edit", "Write", "MultiEdit", "NotebookEdit"}
CONVENTIONAL_TITLE = re.compile(
    r"^(?:feat|fix|security|docs|refactor|test|chore|perf|build|ci)"
    r"(?:\([a-z0-9._/-]+\))?!?: .+"
)


class WorkflowError(RuntimeError):
    """A safe, user-actionable workflow failure."""


@dataclass(frozen=True)
class GitState:
    root: str
    branch: str
    dirty: bool
    changed_files: tuple[str, ...]
    base_ref: str | None
    commits_ahead_of_base: int
    upstream: str | None
    commits_ahead_of_upstream: int | None
    pr_url: str | None


def run(
    args: Sequence[str],
    *,
    cwd: Path,
    check: bool = True,
    input_text: str | None = None,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.run(
        list(args),
        cwd=cwd,
        input=input_text,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if check and process.returncode != 0:
        command = " ".join(args)
        detail = (process.stderr or process.stdout).strip()
        raise WorkflowError(f"Command failed ({command}): {detail}")
    return process


def git(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run(("git", *args), cwd=root, check=check)


def find_root(cwd: str | Path) -> Path:
    start = Path(cwd).resolve()
    result = run(("git", "rev-parse", "--show-toplevel"), cwd=start, check=False)
    if result.returncode != 0:
        raise WorkflowError(f"Not inside a Git repository: {start}")
    return Path(result.stdout.strip()).resolve()


def current_branch(root: Path) -> str:
    return git(root, "branch", "--show-current").stdout.strip()


def changed_files(root: Path) -> tuple[str, ...]:
    commands = (
        ("diff", "--name-only", "-z"),
        ("diff", "--cached", "--name-only", "-z"),
        ("ls-files", "--others", "--exclude-standard", "-z"),
    )
    names: set[str] = set()
    for args in commands:
        output = git(root, *args).stdout
        names.update(item for item in output.split("\0") if item)
    return tuple(sorted(names))


def ref_exists(root: Path, ref: str) -> bool:
    return git(root, "show-ref", "--verify", "--quiet", ref, check=False).returncode == 0


def choose_base_ref(root: Path) -> str | None:
    candidates = (
        "refs/remotes/upstream/main",
        "refs/heads/main",
        "refs/remotes/origin/main",
        "refs/heads/master",
    )
    for ref in candidates:
        if ref_exists(root, ref):
            return ref.removeprefix("refs/")
    return None


def count_ahead(root: Path, older: str, newer: str = "HEAD") -> int:
    result = git(root, "rev-list", "--count", f"{older}..{newer}")
    return int(result.stdout.strip() or "0")


def optional_git_config(root: Path, key: str) -> str | None:
    result = git(root, "config", "--get", key, check=False)
    value = result.stdout.strip()
    return value or None


def collect_state(root: Path) -> GitState:
    branch = current_branch(root)
    files = changed_files(root)
    base_ref = choose_base_ref(root)
    commits_ahead_of_base = count_ahead(root, base_ref) if base_ref else 0
    upstream_result = git(
        root,
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
        check=False,
    )
    upstream = upstream_result.stdout.strip() if upstream_result.returncode == 0 else None
    ahead_upstream = count_ahead(root, upstream) if upstream else None
    pr_url = optional_git_config(root, f"branch.{branch}.aiPrUrl") if branch else None
    return GitState(
        root=str(root),
        branch=branch,
        dirty=bool(files),
        changed_files=files,
        base_ref=base_ref,
        commits_ahead_of_base=commits_ahead_of_base,
        upstream=upstream,
        commits_ahead_of_upstream=ahead_upstream,
        pr_url=pr_url,
    )


def slugify(text: str, *, fallback: str = "task", max_length: int = 42) -> str:
    text = re.sub(r"\$[a-z0-9-]+|/[a-z0-9:-]+", " ", text.lower())
    words = re.findall(r"[a-z0-9]+", text)
    slug = "-".join(words[:7]).strip("-") or fallback
    return slug[:max_length].rstrip("-") or fallback


def unique_branch_name(root: Path, agent: str, prompt: str) -> str:
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    base = f"{slugify(agent, fallback='agent', max_length=12)}/{stamp}-{slugify(prompt)}"
    candidate = base
    counter = 2
    while (
        git(
            root, "show-ref", "--verify", "--quiet", f"refs/heads/{candidate}", check=False
        ).returncode
        == 0
    ):
        candidate = f"{base}-{counter}"
        counter += 1
    return candidate


def is_sensitive_path(raw_path: str) -> bool:
    normalized = raw_path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    path = PurePosixPath(normalized)
    name = path.name.lower()
    parts = {part.lower() for part in path.parts}
    if name.endswith(".example") or name in {".env.example", ".env.local.example"}:
        return False
    if "secrets" in parts:
        return True
    if name == ".env" or name.startswith(".env."):
        return True
    if name in {
        ".npmrc",
        ".pypirc",
        "credentials.json",
        "service-account.json",
        "id_rsa",
        "id_ed25519",
    }:
        return True
    return path.suffix.lower() in {
        ".pem",
        ".key",
        ".p12",
        ".pfx",
        ".keystore",
        ".dump",
        ".backup",
    }


def command_mentions_sensitive_path(command: str) -> bool:
    normalized = command.replace("\\", "/")
    tokens = re.findall(r""""[^"]+"|'[^']+'|[^\s;&|<>]+""", normalized)
    for token in tokens:
        candidate = token.strip("\"'`()[]{}:,=>")
        if candidate and is_sensitive_path(candidate):
            return True
    return False


def command_reads_secret(command: str) -> bool:
    reads = re.search(r"(?i)\b(cat|type|get-content|more|head|tail|select-string)\b", command)
    return bool(reads and command_mentions_sensitive_path(command))


def command_writes_secret(command: str) -> bool:
    writes = re.search(
        r"(?i)(?:\b(?:set-content|add-content|out-file|copy-item|move-item|remove-item|new-item)\b|"
        r"\b(?:touch|cp|mv|rm)\b|\bsed\s+-i\b|\bgit\s+add\b)",
        command,
    )
    return bool(writes and command_mentions_sensitive_path(command))


def command_is_blocked(command: str, branch: str) -> str | None:
    compact = " ".join(command.split())
    if re.search(r"(?i)\bgh\s+pr\s+(?:merge|close)\b", compact):
        return (
            "PR merge/close is never automatic; request that action explicitly "
            "outside this workflow."
        )
    if re.search(
        r"(?i)\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*f|checkout\s+--|restore\b)", compact
    ):
        return (
            "Destructive Git state changes are blocked by the project workflow. Preserve user work."
        )
    if command_reads_secret(command):
        return (
            "Reading real environment files, secrets, private keys, or dumps is "
            "blocked. Use example configuration only."
        )
    if command_writes_secret(command):
        return (
            "Writing, moving, deleting, or staging secret-bearing files is blocked. "
            "Use committed example configuration only."
        )
    protected_ref = re.search(
        r"(?i)\bgit\s+push\b(?:(?![;&|\n]).)*(?:HEAD:(?:refs/heads/)?(?:main|master|prod)\b|\s(?:refs/heads/)?(?:main|master|prod)(?:\s|$))",
        command,
    )
    if protected_ref or (
        branch in PROTECTED_BRANCHES and re.search(r"(?i)\bgit\s+push(?:\s|$)", command)
    ):
        return "Direct pushes to protected branches are blocked; push a task branch and open a PR."
    if branch in PROTECTED_BRANCHES:
        mutating = re.search(
            r"(?i)(?:\bgit\s+(?:add|commit|merge|rebase|reset|restore|clean|cherry-pick|tag)\b|"
            r"\b(?:set-content|add-content|out-file|copy-item|move-item|remove-item|new-item)\b|"
            r"\b(?:touch|mkdir|cp|mv|rm)\b|\bsed\s+-i\b)",
            command,
        )
        if mutating:
            return (
                "Mutating shell commands are blocked on a protected branch. "
                "Start a task branch first."
            )
    return None


def tool_paths(tool_input: Any) -> tuple[str, ...]:
    if not isinstance(tool_input, dict):
        return ()
    paths: list[str] = []
    for key in ("file_path", "path", "notebook_path"):
        value = tool_input.get(key)
        if isinstance(value, str):
            paths.append(value)
    for key in ("paths", "files"):
        value = tool_input.get(key)
        if isinstance(value, list):
            paths.extend(item for item in value if isinstance(item, str))
    command = tool_input.get("command")
    if isinstance(command, str):
        paths.extend(
            match.group(1).strip()
            for match in re.finditer(
                r"(?m)^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$", command
            )
        )
    return tuple(paths)


def print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def add_context(event: str, message: str) -> None:
    print_json(
        {
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": message,
            }
        }
    )


def block_prompt(reason: str) -> None:
    print_json({"decision": "block", "reason": reason})


def deny_tool(reason: str) -> None:
    print_json(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }
    )


def continue_turn(reason: str) -> None:
    print_json({"decision": "block", "reason": reason})


def read_hook_input() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise WorkflowError("Hook received no JSON input on stdin.")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise WorkflowError("Hook input must be a JSON object.")
    return payload


def configure_git_hooks(root: Path) -> None:
    git(root, "config", "core.hooksPath", ".githooks")


def handle_hook(agent: str) -> int:
    payload = read_hook_input()
    event = str(payload.get("hook_event_name", ""))
    cwd = payload.get("cwd") or os.getcwd()
    try:
        root = find_root(str(cwd))
    except WorkflowError:
        print_json({})
        return 0

    if event == "SessionStart":
        configure_git_hooks(root)
        state = collect_state(root)
        add_context(
            event,
            f"Workflow ready on branch '{state.branch or 'DETACHED'}'. Study "
            "AGENTS.md, SECURITY.md, closest nested instructions, tests, and "
            "indexed context before editing.",
        )
        return 0

    if event == "UserPromptSubmit":
        state = collect_state(root)
        if not state.branch:
            block_prompt(
                "The repository is in detached HEAD state. Switch to main or a task "
                "branch before continuing."
            )
            return 0
        if state.branch in PROTECTED_BRANCHES:
            if state.dirty:
                block_prompt(
                    f"Protected branch '{state.branch}' already has changes "
                    f"({', '.join(state.changed_files[:5])}). Preserve them manually "
                    "before starting agent work."
                )
                return 0
            branch = unique_branch_name(root, agent, str(payload.get("prompt", "task")))
            git(root, "switch", "-c", branch)
            add_context(
                event,
                f"Created task branch '{branch}' before any change. Keep this branch "
                "scoped to the current task and finish with a PR against upstream/main.",
            )
            return 0
        add_context(event, f"Continue the current task on non-protected branch '{state.branch}'.")
        return 0

    if event == "PreToolUse":
        tool_name = str(payload.get("tool_name", ""))
        tool_input = payload.get("tool_input", {})
        branch = current_branch(root)
        sensitive_paths = [path for path in tool_paths(tool_input) if is_sensitive_path(path)]
        if sensitive_paths:
            deny_tool(
                f"Access to sensitive path '{sensitive_paths[0]}' is blocked; use "
                "committed example configuration only."
            )
            return 0
        if tool_name.endswith(("browser_evaluate", "browser_run_code_unsafe")):
            deny_tool(
                "Unsafe arbitrary browser-code execution is disabled; use structured "
                "Playwright tools or repository tests."
            )
            return 0
        if tool_name in MUTATING_TOOLS and branch in PROTECTED_BRANCHES:
            deny_tool(
                f"File edits are blocked on protected branch '{branch}'. Start a task branch first."
            )
            return 0
        if tool_name == "Bash" and isinstance(tool_input, dict):
            command = str(tool_input.get("command", ""))
            reason = command_is_blocked(command, branch)
            if reason:
                deny_tool(reason)
                return 0
        print_json({})
        return 0

    if event == "Stop":
        if payload.get("stop_hook_active"):
            print_json({})
            return 0
        state = collect_state(root)
        if state.branch in PROTECTED_BRANCHES and state.dirty:
            continue_turn(
                f"Changed work exists on protected branch '{state.branch}'. Preserve "
                "it, move it safely to a task branch, then verify and ship."
            )
            return 0
        if state.branch and state.branch not in PROTECTED_BRANCHES:
            if state.dirty:
                continue_turn(
                    "The task branch still has uncommitted changes. Review the diff, "
                    "run fresh applicable verification, then invoke the ship skill to "
                    "commit, push, and open/update the PR."
                )
                return 0
            if state.commits_ahead_of_base > 0:
                unpushed = state.upstream is None or bool(state.commits_ahead_of_upstream)
                if unpushed or not state.pr_url:
                    continue_turn(
                        "The task has commits but delivery is incomplete. Invoke the "
                        "ship skill to push the branch and create/update its upstream "
                        "PR, then report the URL."
                    )
                    return 0
        print_json({})
        return 0

    print_json({})
    return 0


def parse_github_repo(remote_url: str) -> tuple[str, str]:
    value = remote_url.strip()
    if re.match(r"^[^/@\s]+@[^:\s]+:", value):
        path = value.split(":", 1)[1]
    else:
        parsed = urlparse(value)
        path = parsed.path if parsed.scheme in {"http", "https", "ssh", "git"} else value
    path = path.strip("/")
    path = path.removesuffix(".git")
    parts = path.split("/")
    if len(parts) < 2:
        raise WorkflowError(f"Cannot parse GitHub repository from remote URL: {remote_url}")
    return parts[-2], parts[-1]


def remote_url(root: Path, remote: str) -> str:
    result = git(root, "remote", "get-url", remote, check=False)
    if result.returncode != 0 or not result.stdout.strip():
        raise WorkflowError(f"Git remote '{remote}' is not configured.")
    return result.stdout.strip()


def build_pr_body(*, title: str, verification: str, security: str, body_file: Path | None) -> str:
    if body_file:
        return body_file.read_text(encoding="utf-8")
    return f"""## Summary

- {title}

## Verification

{verification.strip() or "- Not provided (explain before merge)."}

## Security

{security.strip() or "- Not provided (review before merge)."}

## Database / contracts

- [ ] Migration added or not applicable
- [ ] OpenAPI and generated TypeScript contracts updated or not applicable

## Review checklist

- [x] Work was completed on a task branch
- [x] Diff was reviewed for unrelated files and secrets
- [x] PR targets the upstream default branch
- [ ] Human review complete
"""


def require_executable(name: str) -> None:
    if shutil.which(name) is None:
        raise WorkflowError(f"Required executable '{name}' is not available on PATH.")


def finish(args: argparse.Namespace) -> int:
    require_executable("git")
    require_executable("gh")
    root = find_root(args.cwd or os.getcwd())
    configure_git_hooks(root)
    branch = current_branch(root)
    if not branch:
        raise WorkflowError("Cannot ship from detached HEAD.")
    if branch in PROTECTED_BRANCHES:
        raise WorkflowError(f"Refusing to ship directly from protected branch '{branch}'.")
    if not CONVENTIONAL_TITLE.fullmatch(args.title.strip()):
        raise WorkflowError(
            "PR title must be conventional, for example 'feat(auth): add session warning'."
        )
    if not CONVENTIONAL_TITLE.fullmatch(args.commit_message.strip()):
        raise WorkflowError("Commit message must use the same conventional format as the PR title.")

    files = changed_files(root)
    sensitive = [path for path in files if is_sensitive_path(path)]
    if sensitive:
        raise WorkflowError(f"Refusing to stage sensitive files: {', '.join(sensitive)}")

    if files:
        git(root, "add", "--all")
        staged = git(root, "diff", "--cached", "--quiet", check=False)
        if staged.returncode == 1:
            git(root, "commit", "-m", args.commit_message.strip())
        elif staged.returncode not in {0, 1}:
            raise WorkflowError("Unable to inspect staged changes.")

    base_ref = choose_base_ref(root)
    if not base_ref or count_ahead(root, base_ref) == 0:
        raise WorkflowError(
            "The task branch has no commits ahead of main; there is nothing to ship."
        )
    branch_files = tuple(
        path
        for path in git(root, "diff", "--name-only", "-z", f"{base_ref}...HEAD").stdout.split("\0")
        if path
    )
    sensitive = [path for path in branch_files if is_sensitive_path(path)]
    if sensitive:
        raise WorkflowError(
            f"Refusing to push commits containing sensitive files: {', '.join(sensitive)}"
        )

    origin_owner, _origin_repo = parse_github_repo(remote_url(root, "origin"))
    base_remote = "upstream" if "upstream" in git(root, "remote").stdout.split() else "origin"
    target_owner, target_repo = parse_github_repo(remote_url(root, base_remote))
    target = f"{target_owner}/{target_repo}"

    git(root, "push", "--set-upstream", "origin", branch)

    head = f"{origin_owner}:{branch}"
    existing_result = run(
        (
            "gh",
            "pr",
            "list",
            "--repo",
            target,
            "--head",
            head,
            "--state",
            "open",
            "--json",
            "url",
            "--limit",
            "1",
        ),
        cwd=root,
    )
    existing = json.loads(existing_result.stdout or "[]")
    body = build_pr_body(
        title=args.title,
        verification=args.verification,
        security=args.security,
        body_file=Path(args.body_file).resolve() if args.body_file else None,
    )
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".md", delete=False
    ) as temp:
        temp.write(body)
        body_path = Path(temp.name)
    try:
        if existing:
            pr_url = str(existing[0]["url"])
            run(
                (
                    "gh",
                    "pr",
                    "edit",
                    pr_url,
                    "--repo",
                    target,
                    "--title",
                    args.title.strip(),
                    "--body-file",
                    str(body_path),
                ),
                cwd=root,
            )
        else:
            created = run(
                (
                    "gh",
                    "pr",
                    "create",
                    "--repo",
                    target,
                    "--base",
                    "main",
                    "--head",
                    head,
                    "--title",
                    args.title.strip(),
                    "--body-file",
                    str(body_path),
                ),
                cwd=root,
            )
            pr_url = created.stdout.strip().splitlines()[-1]
    finally:
        body_path.unlink(missing_ok=True)

    git(root, "config", f"branch.{branch}.aiPrUrl", pr_url)
    state = collect_state(root)
    print_json(
        {
            "status": "shipped",
            "commit": git(root, "rev-parse", "--short", "HEAD").stdout.strip(),
            "head": head,
            "base": f"{target}:main",
            "pr_url": pr_url,
            "clean": not state.dirty,
            "ahead_of_upstream": state.commits_ahead_of_upstream,
        }
    )
    return 0


def validate_repository(cwd: str | None) -> int:
    root = find_root(cwd or os.getcwd())
    problems: list[str] = []
    for path in (".codex/hooks.json", ".claude/settings.json", ".mcp.json"):
        candidate = root / path
        try:
            json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            problems.append(f"{path}: {exc}")

    try:
        with (root / ".codex" / "config.toml").open("rb") as config_file:
            tomllib.load(config_file)
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        problems.append(f".codex/config.toml: {exc}")

    codex_skills = root / ".agents" / "skills"
    claude_skills = root / ".claude" / "skills"
    codex_files = {
        path.relative_to(codex_skills): path for path in codex_skills.glob("**/*") if path.is_file()
    }
    claude_files = {
        path.relative_to(claude_skills): path
        for path in claude_skills.glob("**/*")
        if path.is_file()
    }
    for relative in sorted(codex_files.keys() | claude_files.keys()):
        codex_file = codex_files.get(relative)
        claude_file = claude_files.get(relative)
        if codex_file is None:
            problems.append(f"Claude-only skill file: {relative}")
        elif claude_file is None:
            problems.append(f"Missing Claude skill mirror: {relative}")
        elif codex_file.read_bytes() != claude_file.read_bytes():
            problems.append(f"Skill drift: {relative}")

    hooks_path = optional_git_config(root, "core.hooksPath")
    if hooks_path != ".githooks":
        problems.append("core.hooksPath is not .githooks; run the setup script")

    if problems:
        print_json({"status": "invalid", "problems": problems})
        return 1
    print_json({"status": "valid", "skill_count": len(list(codex_skills.glob("*/SKILL.md")))})
    return 0


def setup_repository(cwd: str | None) -> int:
    root = find_root(cwd or os.getcwd())
    configure_git_hooks(root)
    tools = {name: shutil.which(name) for name in ("git", "gh", "uv", "npx", "codex", "claude")}
    print_json(
        {
            "status": "configured",
            "root": str(root),
            "git_hooks": ".githooks",
            "tools": tools,
            "recommended_plugins": {
                "codex": ["superpowers@openai-curated", "codex-security@openai-curated"],
                "claude": [
                    "superpowers@claude-plugins-official",
                    "security-guidance@claude-plugins-official",
                ],
            },
        }
    )
    return 0


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    hook_parser = subparsers.add_parser("hook", help="Handle a Codex or Claude hook event")
    hook_parser.add_argument("--agent", choices=("codex", "claude"), required=True)

    finish_parser = subparsers.add_parser("finish", help="Commit, push, and create/update the PR")
    finish_parser.add_argument("--title", required=True)
    finish_parser.add_argument("--commit-message", required=True)
    finish_parser.add_argument("--verification", required=True)
    finish_parser.add_argument("--security", required=True)
    finish_parser.add_argument("--body-file")
    finish_parser.add_argument("--cwd")

    state_parser = subparsers.add_parser("state", help="Print current workflow state")
    state_parser.add_argument("--cwd")

    validate_parser = subparsers.add_parser("validate", help="Validate mirrored workflow config")
    validate_parser.add_argument("--cwd")

    setup_parser = subparsers.add_parser("setup", help="Enable Git hooks and report prerequisites")
    setup_parser.add_argument("--cwd")
    return parser


def main() -> int:
    parser = make_parser()
    args = parser.parse_args()
    try:
        if args.command == "hook":
            return handle_hook(args.agent)
        if args.command == "finish":
            return finish(args)
        if args.command == "state":
            print_json(asdict(collect_state(find_root(args.cwd or os.getcwd()))))
            return 0
        if args.command == "validate":
            return validate_repository(args.cwd)
        if args.command == "setup":
            return setup_repository(args.cwd)
    except (WorkflowError, json.JSONDecodeError, OSError) as exc:
        print(f"agent-workflow: {exc}", file=sys.stderr)
        return 2
    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
