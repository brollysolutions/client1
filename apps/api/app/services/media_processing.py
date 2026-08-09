"""Sanitize and quarantine attacker-controlled managed media.

Images and PDFs are small enough to process synchronously at confirmation.
Videos are accepted into a private pending state and passed here by the single
scheduler service. No user filename, object key, scanner response, subprocess
output, or temporary path is logged or returned to a client.
"""

from __future__ import annotations

import json
import math
import socket
import struct
import subprocess
import tempfile
import warnings
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings
from app.services import storage

_SCAN_CHUNK_BYTES = 1024 * 1024
_IMAGE_MAX_PIXELS = 25_000_000
_IMAGE_FORMAT_BY_CONTENT_TYPE = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


class MediaProcessingError(Exception):
    """Base for errors safe to map to a generic upload/processing response."""


class MalwareDetected(MediaProcessingError):
    pass


class ScannerUnavailable(MediaProcessingError):
    pass


class InvalidImage(MediaProcessingError):
    pass


class InvalidVideo(MediaProcessingError):
    pass


class VideoDurationExceeded(MediaProcessingError):
    pass


class CanonicalOutputTooLarge(MediaProcessingError):
    pass


@dataclass(frozen=True)
class VideoPolicy:
    max_bytes: int
    max_duration_seconds: int


@dataclass(frozen=True)
class VideoResult:
    size_bytes: int
    duration_seconds: int


def _scan_with_clamav(content: bytes) -> None:
    try:
        with socket.create_connection(
            (settings.CLAMAV_HOST, settings.CLAMAV_PORT),
            timeout=settings.CLAMAV_TIMEOUT_SECONDS,
        ) as connection:
            connection.settimeout(settings.CLAMAV_TIMEOUT_SECONDS)
            connection.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), _SCAN_CHUNK_BYTES):
                chunk = content[offset : offset + _SCAN_CHUNK_BYTES]
                connection.sendall(struct.pack("!I", len(chunk)))
                connection.sendall(chunk)
            connection.sendall(struct.pack("!I", 0))
            response = bytearray()
            while not response.endswith(b"\0") and len(response) <= 4096:
                part = connection.recv(4096)
                if not part:
                    break
                response.extend(part)
    except OSError as exc:
        raise ScannerUnavailable from exc

    result = bytes(response).rstrip(b"\0\r\n")
    if result.endswith(b" FOUND"):
        raise MalwareDetected
    if not result.endswith(b" OK"):
        raise ScannerUnavailable


def scan_bytes(content: bytes) -> None:
    if not content:
        raise MediaProcessingError
    if settings.MEDIA_MALWARE_SCAN_MODE == "disabled":
        # Settings rejects this mode outside development. Keeping the branch
        # here lets host-only development run without a 4 GiB signature engine.
        return
    _scan_with_clamav(content)


def sanitize_image_bytes(content: bytes, content_type: str, *, max_bytes: int) -> bytes:
    expected_format = _IMAGE_FORMAT_BY_CONTENT_TYPE.get(content_type)
    if expected_format is None:
        raise InvalidImage
    scan_bytes(content)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = _IMAGE_MAX_PIXELS
            with Image.open(BytesIO(content)) as source:
                source.load()
                if source.format != expected_format:
                    raise InvalidImage
                normalized = ImageOps.exif_transpose(source)
                if normalized.width * normalized.height > _IMAGE_MAX_PIXELS:
                    raise InvalidImage
                if expected_format == "JPEG" and normalized.mode not in {"RGB", "L"}:
                    normalized = normalized.convert("RGB")
                output = BytesIO()
                save_options: dict[str, object] = {}
                if expected_format == "JPEG":
                    save_options = {"quality": 90, "optimize": True, "progressive": True}
                elif expected_format == "PNG":
                    save_options = {"optimize": True}
                elif expected_format == "WEBP":
                    save_options = {"quality": 85, "method": 6}
                # Deliberately omit exif/pnginfo/icc_profile: the canonical
                # image contains pixels only, with no GPS, XMP, or comments.
                normalized.save(output, format=expected_format, **save_options)
    except (InvalidImage, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage from exc
    result = output.getvalue()
    if not result or len(result) > max_bytes:
        raise CanonicalOutputTooLarge
    return result


def canonicalize_object(
    source_key: str,
    destination_key: str,
    content_type: str,
    *,
    max_bytes: int,
) -> int:
    """Scan one bounded object and write immutable canonical bytes."""
    content = storage.read_object_bytes(source_key, max_bytes=max_bytes)
    if content is None:
        raise MediaProcessingError
    if content_type.startswith("image/"):
        canonical = sanitize_image_bytes(content, content_type, max_bytes=max_bytes)
    elif content_type == "application/pdf":
        scan_bytes(content)
        canonical = content
    else:
        raise MediaProcessingError
    storage.put_object_bytes(destination_key, canonical, content_type)
    written = storage.head_object(destination_key)
    if written != len(canonical) or not storage.content_matches_declared_type(
        destination_key, content_type
    ):
        raise MediaProcessingError
    return len(canonical)


def _probe_video(path: Path, policy: VideoPolicy) -> float:
    command = [
        settings.MEDIA_FFPROBE_BINARY,
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height:format=duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            timeout=min(settings.MEDIA_TRANSCODE_TIMEOUT_SECONDS, 60),
        )
        payload = json.loads(completed.stdout)
        streams = payload.get("streams") or []
        video_stream = next(item for item in streams if item.get("codec_type") == "video")
        audio_streams = [item for item in streams if item.get("codec_type") == "audio"]
        duration = float(payload["format"]["duration"])
        width = int(video_stream["width"])
        height = int(video_stream["height"])
    except (
        FileNotFoundError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
        json.JSONDecodeError,
        subprocess.SubprocessError,
    ) as exc:
        raise InvalidVideo from exc
    if (
        video_stream.get("codec_name") != "h264"
        or any(stream.get("codec_name") != "aac" for stream in audio_streams)
        or not math.isfinite(duration)
        or duration <= 0
        or width < 1
        or height < 1
        or width * height > 3840 * 2160
    ):
        raise InvalidVideo
    if duration > policy.max_duration_seconds:
        raise VideoDurationExceeded
    return duration


def _transcode_video(source: Path, destination: Path) -> None:
    command = [
        settings.MEDIA_FFMPEG_BINARY,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-sn",
        "-dn",
        "-vf",
        "scale=min(1920\\,iw):min(1080\\,ih):"
        "force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-map_metadata",
        "-1",
        "-metadata",
        "title=",
        "-metadata",
        "comment=",
        "-movflags",
        "+faststart",
        "-threads",
        "2",
        "-y",
        str(destination),
    ]
    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            timeout=settings.MEDIA_TRANSCODE_TIMEOUT_SECONDS,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        raise InvalidVideo from exc


def process_video_object(
    source_key: str,
    destination_key: str,
    *,
    policy: VideoPolicy,
) -> VideoResult:
    """Scan, validate, transcode, strip metadata, and publish a canonical MP4."""
    with tempfile.TemporaryDirectory(prefix="managed-media-") as temp_dir:
        source = Path(temp_dir) / "source.mp4"
        destination = Path(temp_dir) / "canonical.mp4"
        downloaded = storage.download_object_to_file(source_key, source, max_bytes=policy.max_bytes)
        if downloaded < 1:
            raise InvalidVideo
        content = source.read_bytes()
        if storage.sniff_content_type(content[:32]) != "video/mp4":
            raise InvalidVideo
        scan_bytes(content)
        duration = _probe_video(source, policy)
        _transcode_video(source, destination)
        output_size = destination.stat().st_size
        if output_size < 1 or output_size > policy.max_bytes:
            raise CanonicalOutputTooLarge
        output = destination.read_bytes()
        if storage.sniff_content_type(output[:32]) != "video/mp4":
            raise InvalidVideo
        scan_bytes(output)
        storage.upload_file(destination_key, destination, "video/mp4")
        if storage.head_object(
            destination_key
        ) != output_size or not storage.content_matches_declared_type(destination_key, "video/mp4"):
            raise MediaProcessingError
    return VideoResult(size_bytes=output_size, duration_seconds=max(1, math.ceil(duration)))
