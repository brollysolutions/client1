"""Packaged, public brand artwork shared by email and report presentation."""

from pathlib import Path

LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "logo-horizontal.png"
# Read immutable application data once, not for every async email request.
LOGO_PNG = LOGO_PATH.read_bytes()


def branded_filename(filename: str) -> str:
    return filename if filename.startswith("dhanadhara-") else f"dhanadhara-{filename}"
