"""Sanitize and quarantine attacker-controlled managed media.

Images and PDFs are small enough to process synchronously at confirmation.
Videos are accepted into a private pending state and passed here by the single
scheduler service. No user filename, object key, scanner response, subprocess
output, or temporary path is logged or returned to a client.
"""

from __future__ import annotations

import http.client
import math
import socket
import struct
import warnings
from dataclasses import dataclass
from io import BytesIO
from urllib.parse import urlsplit

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


class MediaProcessorUnavailable(MediaProcessingError):
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


def validate_panorama_bytes(content: bytes, content_type: str) -> None:
    """Require a bounded equirectangular image suitable for a 360 viewer."""
    expected_format = _IMAGE_FORMAT_BY_CONTENT_TYPE.get(content_type)
    if expected_format not in {"JPEG", "WEBP"}:
        raise InvalidImage
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            Image.MAX_IMAGE_PIXELS = _IMAGE_MAX_PIXELS
            with Image.open(BytesIO(content)) as source:
                source.load()
                normalized = ImageOps.exif_transpose(source)
                width, height = normalized.size
                if source.format != expected_format or width < 2048 or height < 1024:
                    raise InvalidImage
                # Equirectangular panoramas are 2:1. Permit a two-percent
                # tolerance for camera stitching/cropping, but reject ordinary
                # landscape photos mislabeled as interactive tours.
                if abs(width - (height * 2)) > max(2, height // 50):
                    raise InvalidImage
                if width * height > _IMAGE_MAX_PIXELS:
                    raise InvalidImage
    except (InvalidImage, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage from exc


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


def _transcode_video_isolated(content: bytes, policy: VideoPolicy) -> tuple[bytes, float]:
    """Send bounded bytes to the secretless native-media trust boundary."""
    processor_url = settings.MEDIA_VIDEO_PROCESSOR_URL.strip()
    if not processor_url:
        raise MediaProcessorUnavailable
    parsed = urlsplit(processor_url)
    connection_type = (
        http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    )
    connection = connection_type(
        parsed.hostname,
        parsed.port,
        timeout=settings.MEDIA_TRANSCODE_TIMEOUT_SECONDS + 10,
    )
    try:
        connection.request(
            "POST",
            "/v1/transcode",
            body=content,
            headers={
                "Connection": "close",
                "Content-Length": str(len(content)),
                "Content-Type": "video/mp4",
                "X-Media-Max-Duration-Seconds": str(policy.max_duration_seconds),
                "X-Media-Protocol": "1",
            },
        )
        response = connection.getresponse()
        error_code = response.getheader("X-Media-Error")
        if response.status != 200:
            response.read(1024)
            if error_code == "duration_exceeded":
                raise VideoDurationExceeded
            if error_code == "output_too_large":
                raise CanonicalOutputTooLarge
            if error_code == "invalid_video":
                raise InvalidVideo
            raise MediaProcessorUnavailable
        if (
            response.getheader("X-Media-Protocol") != "1"
            or response.getheader("Content-Type") != "video/mp4"
        ):
            raise MediaProcessorUnavailable
        length_header = response.getheader("Content-Length")
        duration_header = response.getheader("X-Media-Duration-Seconds")
        if length_header is None or duration_header is None:
            raise MediaProcessorUnavailable
        output_size = int(length_header)
        duration = float(duration_header)
        if output_size < 1 or not math.isfinite(duration) or duration <= 0:
            raise MediaProcessorUnavailable
        if output_size > policy.max_bytes:
            raise CanonicalOutputTooLarge
        if duration > policy.max_duration_seconds:
            raise VideoDurationExceeded
        output = response.read(output_size + 1)
        if len(output) != output_size:
            raise MediaProcessorUnavailable
        return output, duration
    except MediaProcessingError:
        raise
    except (OSError, TimeoutError, ValueError, http.client.HTTPException) as exc:
        raise MediaProcessorUnavailable from exc
    finally:
        connection.close()


def process_video_object(
    source_key: str,
    destination_key: str,
    *,
    policy: VideoPolicy,
) -> VideoResult:
    """Scan, isolate native parsing, and publish one canonical private MP4."""
    content = storage.read_object_bytes(source_key, max_bytes=policy.max_bytes)
    if content is None or storage.sniff_content_type(content[:32]) != "video/mp4":
        raise InvalidVideo
    scan_bytes(content)
    output, duration = _transcode_video_isolated(content, policy)
    output_size = len(output)
    if output_size < 1 or output_size > policy.max_bytes:
        raise CanonicalOutputTooLarge
    if storage.sniff_content_type(output[:32]) != "video/mp4":
        raise InvalidVideo
    scan_bytes(output)
    storage.put_object_bytes(destination_key, output, "video/mp4")
    if storage.head_object(
        destination_key
    ) != output_size or not storage.content_matches_declared_type(destination_key, "video/mp4"):
        raise MediaProcessingError
    return VideoResult(size_bytes=output_size, duration_seconds=max(1, math.ceil(duration)))
