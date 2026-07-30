"""Magic-byte content-type sniffing (feature-status.md §2-12).

Pure-function tests for services.storage.sniff_content_type / the two
verification helpers built on it — no live storage needed, since
sniff_content_type takes raw bytes directly.
"""

from __future__ import annotations

import pytest

from app.services import storage


def test_sniff_jpeg() -> None:
    assert storage.sniff_content_type(b"\xff\xd8\xff\xe0\x00\x10JFIF") == "image/jpeg"


def test_sniff_png() -> None:
    assert storage.sniff_content_type(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR") == "image/png"


def test_sniff_pdf() -> None:
    assert storage.sniff_content_type(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3") == "application/pdf"


def test_sniff_webp() -> None:
    head = b"RIFF" + b"\x24\x00\x00\x00" + b"WEBP" + b"VP8 "
    assert storage.sniff_content_type(head) == "image/webp"


def test_sniff_rejects_html_polyglot_declared_as_pdf() -> None:
    """The actual security concern: an HTML/script document, whatever it
    claims to be at presign time, must never sniff to a real type."""
    html = b"<html><script>alert(1)</script></html>"
    assert storage.sniff_content_type(html) is None


def test_sniff_rejects_empty_bytes() -> None:
    assert storage.sniff_content_type(b"") is None


def test_sniff_rejects_truncated_webp_missing_marker() -> None:
    """RIFF prefix alone (e.g. a truncated/corrupt upload) must not pass —
    the WEBP marker at offset 8 is required too."""
    assert storage.sniff_content_type(b"RIFF\x24\x00\x00\x00AVI ") is None


@pytest.mark.asyncio
async def test_content_matches_declared_type_true_on_match(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "read_head_bytes", lambda _key, _n=12: b"%PDF-1.7\n%\xe2\xe3\xcf")
    assert storage.content_matches_declared_type("some/key", "application/pdf") is True


@pytest.mark.asyncio
async def test_content_matches_declared_type_false_on_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A real PNG uploaded when application/pdf was declared — this module
    can only catch it because content_type is available to compare against
    (loan_documents.py's confirm flow); the other two flows only have
    content_type_is_recognized (below), which cannot catch this specific
    case — see that function's own docstring."""
    monkeypatch.setattr(
        storage, "read_head_bytes", lambda _key, _n=12: b"\x89PNG\r\n\x1a\n\x00\x00"
    )
    assert storage.content_matches_declared_type("some/key", "application/pdf") is False


@pytest.mark.asyncio
async def test_content_matches_declared_type_false_on_missing_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "read_head_bytes", lambda _key, _n=12: None)
    assert storage.content_matches_declared_type("some/key", "application/pdf") is False


@pytest.mark.asyncio
async def test_content_type_is_recognized_false_for_polyglot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "read_head_bytes", lambda _key, _n=12: b"<html><script>x</script>")
    assert storage.content_type_is_recognized("some/key") is False


@pytest.mark.asyncio
async def test_content_type_is_recognized_true_for_real_jpeg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(storage, "read_head_bytes", lambda _key, _n=12: b"\xff\xd8\xff\xe0")
    assert storage.content_type_is_recognized("some/key") is True
