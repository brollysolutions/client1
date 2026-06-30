"""Dump the FastAPI OpenAPI schema to stdout.

Called by scripts/generate-openapi.sh:
    uv run python -m app.scripts.export_openapi > packages/contracts/openapi/openapi.json
"""

import json
import sys


def main() -> None:
    from app.main import app  # local import — avoids loading DB/Redis at module level

    print(json.dumps(app.openapi(), indent=2))


if __name__ == "__main__":
    main()
    sys.exit(0)
