from __future__ import annotations

import json
import shutil
import subprocess
from io import BytesIO
from pathlib import Path

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


def test_probe_video_accepts_h264_aac_within_policy(monkeypatch) -> None:
    payload = {
        "streams": [
            {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080},
            {"codec_type": "audio", "codec_name": "aac"},
        ],
        "format": {"duration": "59.25"},
    }
    monkeypatch.setattr(
        media_processing.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args=args[0], returncode=0, stdout=json.dumps(payload).encode(), stderr=b""
        ),
    )

    duration = media_processing._probe_video(
        Path("video.mp4"),
        media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
    )

    assert duration == 59.25


@pytest.mark.parametrize(
    ("video_codec", "audio_codec", "duration", "error"),
    [
        ("vp9", "aac", "30", media_processing.InvalidVideo),
        ("h264", "opus", "30", media_processing.InvalidVideo),
        ("h264", "aac", "61", media_processing.VideoDurationExceeded),
    ],
)
def test_probe_video_rejects_unsupported_or_overlong_media(
    monkeypatch, video_codec, audio_codec, duration, error
) -> None:
    payload = {
        "streams": [
            {
                "codec_type": "video",
                "codec_name": video_codec,
                "width": 1280,
                "height": 720,
            },
            {"codec_type": "audio", "codec_name": audio_codec},
        ],
        "format": {"duration": duration},
    }
    monkeypatch.setattr(
        media_processing.subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args=args[0], returncode=0, stdout=json.dumps(payload).encode(), stderr=b""
        ),
    )

    with pytest.raises(error):
        media_processing._probe_video(
            Path("video.mp4"),
            media_processing.VideoPolicy(max_bytes=20_000_000, max_duration_seconds=60),
        )


def test_process_video_transcodes_with_real_binaries_and_strips_metadata(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    ffmpeg = shutil.which(media_processing.settings.MEDIA_FFMPEG_BINARY)
    ffprobe = shutil.which(media_processing.settings.MEDIA_FFPROBE_BINARY)
    if ffmpeg is None or ffprobe is None:
        pytest.skip("FFmpeg binaries are verified in the API container image.")

    source = tmp_path / "source.mp4"
    captured = tmp_path / "captured.mp4"
    subprocess.run(
        [
            ffmpeg,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x240:d=1",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=1000:duration=1",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-metadata",
            "comment=private-location",
            "-movflags",
            "+faststart",
            "-y",
            str(source),
        ],
        check=True,
        capture_output=True,
    )
    monkeypatch.setattr(media_processing.settings, "MEDIA_MALWARE_SCAN_MODE", "disabled")

    def download(_key: str, path: Path, *, max_bytes: int) -> int:
        assert source.stat().st_size <= max_bytes
        shutil.copyfile(source, path)
        return path.stat().st_size

    def upload(_key: str, path: Path, _content_type: str) -> None:
        shutil.copyfile(path, captured)

    monkeypatch.setattr(media_processing.storage, "download_object_to_file", download)
    monkeypatch.setattr(media_processing.storage, "upload_file", upload)
    monkeypatch.setattr(
        media_processing.storage,
        "head_object",
        lambda _key: captured.stat().st_size,
    )
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

    assert result.duration_seconds == 1
    assert result.size_bytes == captured.stat().st_size
    metadata = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format_tags=comment", "-of", "json", captured],
        check=True,
        capture_output=True,
        text=True,
    )
    assert "private-location" not in metadata.stdout
