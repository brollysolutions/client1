from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import pytest
from PIL import Image

from app.services import media_processing


def _jpeg_with_metadata() -> bytes:
    image = Image.new("RGB", (12, 8), color=(12, 34, 56))
    exif = Image.Exif()
    exif[0x010F] = "private-camera"
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif)
    return output.getvalue()


def _jpeg(width: int, height: int) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), color=(12, 34, 56)).save(output, format="JPEG", quality=70)
    return output.getvalue()


def test_sanitize_image_removes_metadata_and_keeps_declared_format(monkeypatch) -> None:
    monkeypatch.setattr(media_processing.settings, "MEDIA_MALWARE_SCAN_MODE", "disabled")

    result = media_processing.sanitize_image_bytes(
        _jpeg_with_metadata(), "image/jpeg", max_bytes=1024 * 1024
    )

    with Image.open(BytesIO(result)) as image:
        assert image.format == "JPEG"
        assert len(image.getexif()) == 0
        assert image.size == (12, 8)


def test_sanitize_image_rejects_declared_format_mismatch(monkeypatch) -> None:
    monkeypatch.setattr(media_processing.settings, "MEDIA_MALWARE_SCAN_MODE", "disabled")

    with pytest.raises(media_processing.InvalidImage):
        media_processing.sanitize_image_bytes(
            _jpeg_with_metadata(), "image/png", max_bytes=1024 * 1024
        )


def test_panorama_validation_accepts_two_to_one_and_rejects_ordinary_landscape() -> None:
    media_processing.validate_panorama_bytes(_jpeg(2048, 1024), "image/jpeg")

    with pytest.raises(media_processing.InvalidImage):
        media_processing.validate_panorama_bytes(_jpeg(2048, 1365), "image/jpeg")


def test_panorama_validation_rejects_small_or_png_media() -> None:
    with pytest.raises(media_processing.InvalidImage):
        media_processing.validate_panorama_bytes(_jpeg(1024, 512), "image/jpeg")
    with pytest.raises(media_processing.InvalidImage):
        media_processing.validate_panorama_bytes(_jpeg(2048, 1024), "image/png")


def test_scan_fails_closed_when_clamav_is_unreachable(monkeypatch) -> None:
    monkeypatch.setattr(media_processing.settings, "MEDIA_MALWARE_SCAN_MODE", "clamav")

    def unavailable(*args, **kwargs):
        raise OSError("offline")

    monkeypatch.setattr(media_processing.socket, "create_connection", unavailable)
    with pytest.raises(media_processing.ScannerUnavailable):
        media_processing.scan_bytes(b"safe-looking bytes")


def test_canonical_media_is_bounded_before_object_bytes_are_read(monkeypatch) -> None:
    first_entered = threading.Event()
    release_first = threading.Event()
    second_entered = threading.Event()

    def read_object(key: str, *, max_bytes: int) -> bytes:
        assert max_bytes == 1024
        if key == "first":
            first_entered.set()
            assert release_first.wait(timeout=2)
        else:
            second_entered.set()
        return b"%PDF-1.7 synthetic"

    monkeypatch.setattr(media_processing, "_MEDIA_PROCESS_SLOT", threading.BoundedSemaphore(1))
    monkeypatch.setattr(media_processing.storage, "read_object_bytes", read_object)
    monkeypatch.setattr(media_processing, "scan_bytes", lambda _content: None)
    monkeypatch.setattr(media_processing.storage, "put_object_bytes", lambda *_args: None)
    monkeypatch.setattr(
        media_processing.storage,
        "head_object",
        lambda _key: len(b"%PDF-1.7 synthetic"),
    )
    monkeypatch.setattr(
        media_processing.storage,
        "content_matches_declared_type",
        lambda _key, _content_type: True,
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            media_processing.canonicalize_object,
            "first",
            "canonical-first",
            "application/pdf",
            max_bytes=1024,
        )
        assert first_entered.wait(timeout=1)
        second = executor.submit(
            media_processing.canonicalize_object,
            "second",
            "canonical-second",
            "application/pdf",
            max_bytes=1024,
        )
        assert not second_entered.wait(timeout=0.1)
        release_first.set()
        assert first.result(timeout=2) == len(b"%PDF-1.7 synthetic")
        assert second.result(timeout=2) == len(b"%PDF-1.7 synthetic")

    assert second_entered.is_set()


def _mp4(payload: bytes = b"video") -> bytes:
    return b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom" + payload


class _Response:
    def __init__(self, status: int, content: bytes, headers: dict[str, str]) -> None:
        self.status = status
        self._content = content
        self._headers = headers

    def getheader(self, name: str) -> str | None:
        return self._headers.get(name)

    def read(self, amount: int) -> bytes:
        return self._content[:amount]


def _install_connection(monkeypatch: pytest.MonkeyPatch, response: _Response) -> dict[str, object]:
    captured: dict[str, object] = {}

    class Connection:
        def __init__(self, host: str, port: int, *, timeout: int) -> None:
            captured.update(host=host, port=port, timeout=timeout)

        def request(self, method: str, path: str, *, body: bytes, headers: dict[str, str]) -> None:
            captured.update(method=method, path=path, body=body, headers=headers)

        def getresponse(self) -> _Response:
            return response

        def close(self) -> None:
            captured["closed"] = True

    monkeypatch.setattr(media_processing.http.client, "HTTPConnection", Connection)
    monkeypatch.setattr(
        media_processing.settings,
        "MEDIA_VIDEO_PROCESSOR_URL",
        "http://media-runtime:8080",
    )
    return captured


def test_isolated_processor_transport_is_bounded_and_versioned(monkeypatch) -> None:
    output = _mp4(b"canonical")
    response = _Response(
        200,
        output,
        {
            "Content-Length": str(len(output)),
            "Content-Type": "video/mp4",
            "X-Media-Duration-Seconds": "59.25",
            "X-Media-Protocol": "1",
        },
    )
    captured = _install_connection(monkeypatch, response)
    policy = media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60)

    canonical, duration = media_processing._transcode_video_isolated(_mp4(), policy)

    assert canonical == output
    assert duration == 59.25
    assert captured["host"] == "media-runtime"
    assert captured["port"] == 8080
    assert captured["method"] == "POST"
    assert captured["path"] == "/v1/transcode"
    assert captured["body"] == _mp4()
    assert captured["headers"] == {
        "Connection": "close",
        "Content-Length": str(len(_mp4())),
        "Content-Type": "video/mp4",
        "X-Media-Max-Duration-Seconds": "60",
        "X-Media-Protocol": "1",
    }
    assert captured["closed"] is True


@pytest.mark.parametrize(
    ("error_code", "error"),
    [
        ("invalid_video", media_processing.InvalidVideo),
        ("duration_exceeded", media_processing.VideoDurationExceeded),
        ("output_too_large", media_processing.CanonicalOutputTooLarge),
        ("processing_unavailable", media_processing.MediaProcessorUnavailable),
    ],
)
def test_isolated_processor_returns_only_bounded_error_codes(
    monkeypatch: pytest.MonkeyPatch, error_code: str, error: type[Exception]
) -> None:
    response = _Response(422, b'{"private":"not exposed"}', {"X-Media-Error": error_code})
    _install_connection(monkeypatch, response)

    with pytest.raises(error):
        media_processing._transcode_video_isolated(
            _mp4(),
            media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
        )


def test_isolated_processor_rejects_oversized_success(monkeypatch) -> None:
    response = _Response(
        200,
        _mp4(),
        {
            "Content-Length": "20000001",
            "Content-Type": "video/mp4",
            "X-Media-Duration-Seconds": "1",
            "X-Media-Protocol": "1",
        },
    )
    _install_connection(monkeypatch, response)

    with pytest.raises(media_processing.CanonicalOutputTooLarge):
        media_processing._transcode_video_isolated(
            _mp4(),
            media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
        )


def test_isolated_processor_rejects_incomplete_success(monkeypatch) -> None:
    output = _mp4()
    response = _Response(
        200,
        output,
        {
            "Content-Length": str(len(output) + 1),
            "Content-Type": "video/mp4",
            "X-Media-Duration-Seconds": "1",
            "X-Media-Protocol": "1",
        },
    )
    _install_connection(monkeypatch, response)

    with pytest.raises(media_processing.MediaProcessorUnavailable):
        media_processing._transcode_video_isolated(
            _mp4(),
            media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
        )


def test_isolated_processor_rejects_overlong_success(monkeypatch) -> None:
    output = _mp4()
    response = _Response(
        200,
        output,
        {
            "Content-Length": str(len(output)),
            "Content-Type": "video/mp4",
            "X-Media-Duration-Seconds": "61",
            "X-Media-Protocol": "1",
        },
    )
    _install_connection(monkeypatch, response)

    with pytest.raises(media_processing.VideoDurationExceeded):
        media_processing._transcode_video_isolated(
            _mp4(),
            media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
        )


def test_process_video_scans_both_sides_of_isolated_runtime_and_stores_private_canonical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _mp4(b"source")
    canonical = _mp4(b"canonical")
    scanned: list[bytes] = []
    stored: list[tuple[str, bytes, str]] = []
    monkeypatch.setattr(
        media_processing.storage,
        "read_object_bytes",
        lambda _key, *, max_bytes: source if len(source) <= max_bytes else None,
    )
    monkeypatch.setattr(media_processing, "scan_bytes", scanned.append)
    monkeypatch.setattr(
        media_processing,
        "_transcode_video_isolated",
        lambda content, _policy: (canonical, 1.0) if content == source else pytest.fail(),
    )
    monkeypatch.setattr(
        media_processing.storage,
        "put_object_bytes",
        lambda key, content, content_type: stored.append((key, content, content_type)),
    )
    monkeypatch.setattr(media_processing.storage, "head_object", lambda _key: len(canonical))
    monkeypatch.setattr(
        media_processing.storage,
        "content_matches_declared_type",
        lambda _key, _content_type: True,
    )

    result = media_processing.process_video_object(
        "private/source.mp4",
        "private/canonical.mp4",
        policy=media_processing.VideoPolicy(
            max_bytes=20 * 1024 * 1024,
            max_duration_seconds=60,
        ),
    )

    assert result == media_processing.VideoResult(size_bytes=len(canonical), duration_seconds=1)
    assert scanned == [source, canonical]
    assert stored == [("private/canonical.mp4", canonical, "video/mp4")]
