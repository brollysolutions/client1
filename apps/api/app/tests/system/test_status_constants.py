"""Compatibility guards for framework-owned HTTP status names."""

from __future__ import annotations

import ast
from pathlib import Path


def test_production_code_uses_current_http_422_status_name() -> None:
    app_root = Path(__file__).resolve().parents[2]
    deprecated_name = "HTTP_422_" + "UNPROCESSABLE_ENTITY"
    offenders: list[str] = []

    for path in sorted(app_root.rglob("*.py")):
        if "tests" in path.relative_to(app_root).parts:
            continue

        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            identifier = None
            if isinstance(node, ast.Attribute):
                identifier = node.attr
            elif isinstance(node, ast.Name):
                identifier = node.id
            elif isinstance(node, ast.alias):
                identifier = node.name

            if identifier == deprecated_name:
                relative_path = path.relative_to(app_root)
                offenders.append(f"{relative_path}:{node.lineno}")

    assert not offenders, (
        f"Starlette deprecated {deprecated_name}; use "
        "HTTP_422_UNPROCESSABLE_CONTENT instead:\n  " + "\n  ".join(offenders)
    )
