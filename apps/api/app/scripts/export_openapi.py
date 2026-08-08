"""Dump the FastAPI OpenAPI schema to stdout.

Called by scripts/generate-openapi.sh:
    uv run python -m app.scripts.export_openapi > packages/contracts/openapi/openapi.json
"""

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    from app.main import app  # local import — avoids loading DB/Redis at module level

    # sort_keys + trailing newline make the output byte-stable across interpreter
    # minors / dict-ordering so the CI contract-drift gate diffs cleanly.
    content = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(content, end="")
    else:
        # Avoid platform newline translation: contract drift is byte-for-byte
        # deterministic on Windows development hosts and Linux CI alike.
        args.output.write_bytes(content.encode("utf-8"))


if __name__ == "__main__":
    main()
    sys.exit(0)
