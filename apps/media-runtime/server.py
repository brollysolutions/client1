"""Secretless, least-privilege HTTP boundary for untrusted MP4 parsing.

The application scheduler performs authorization, storage access, malware
scanning, and lifecycle transitions. This process receives only one bounded MP4
and returns one bounded canonical MP4. Compose supplies the outer container
network/privilege/CPU/memory/PID/tmpfs limits; this module independently bounds
HTTP reads, subprocess time, CPU, address space, output size, descriptors, and
process count.
"""

from __future__ import annotations

import json
import math
import os
import signal
import subprocess
import tempfile
import threading
from contextlib import suppress
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import NoReturn

try:
    import resource
except ModuleNotFoundError:  # pragma: no cover - worker image is always Linux
    resource = None  # type: ignore[assignment]


def _positive_env(name: str, default: int) -> int:
    value = int(os.environ.get(name, str(default)))
    if value <= 0:
        raise RuntimeError(f"{name} must be positive")
    return value


HOST = os.environ.get("MEDIA_RUNTIME_HOST", "0.0.0.0")
PORT = _positive_env("MEDIA_RUNTIME_PORT", 8080)
MAX_UPLOAD_BYTES = _positive_env("MEDIA_MAX_UPLOAD_BYTES", 20 * 1024 * 1024)
MAX_OUTPUT_BYTES = _positive_env("MEDIA_MAX_OUTPUT_BYTES", 20 * 1024 * 1024)
MAX_DURATION_SECONDS = _positive_env("MEDIA_MAX_DURATION_SECONDS", 60)
TRANSCODE_TIMEOUT_SECONDS = _positive_env("MEDIA_TRANSCODE_TIMEOUT_SECONDS", 180)
PROCESS_CPU_SECONDS = _positive_env("MEDIA_PROCESS_CPU_SECONDS", 185)
# FFmpeg maps substantially more virtual address space than its resident set for
# a policy-maximum 1080p encode. The container's 768 MiB cgroup is the hard real-
# memory boundary; this separate 1.25 GiB RLIMIT_AS still bounds mappings without
# rejecting valid policy input before the cgroup limit is approached.
PROCESS_ADDRESS_SPACE_BYTES = _positive_env("MEDIA_PROCESS_ADDRESS_SPACE_BYTES", 1280 * 1024 * 1024)
PROCESS_FILE_SIZE_BYTES = _positive_env("MEDIA_PROCESS_FILE_SIZE_BYTES", 20 * 1024 * 1024)
PROCESS_OPEN_FILES = _positive_env("MEDIA_PROCESS_OPEN_FILES", 64)
PROCESS_COUNT = _positive_env("MEDIA_PROCESS_COUNT", 32)
FFMPEG_BINARY = "ffmpeg"
FFPROBE_BINARY = "ffprobe"
_PROBE_OUTPUT_MAX_BYTES = 256 * 1024
_MAX_PIXELS = 3840 * 2160
_MAX_ALLOC_BYTES = 128 * 1024 * 1024
_PROBE_BYTES = 8 * 1024 * 1024
_ANALYZE_MICROSECONDS = 10_000_000
_TRANSCODE_SLOT = threading.BoundedSemaphore(1)


class MediaRejected(Exception):
    def __init__(self, code: str, status: HTTPStatus = HTTPStatus.UNPROCESSABLE_ENTITY):
        super().__init__(code)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class TranscodeResult:
    content: bytes
    duration_seconds: float


def _is_mp4(content: bytes) -> bool:
    head = content[:32]
    if len(head) < 12 or head[4:8] != b"ftyp":
        return False
    brands = {head[8:12], *(head[index : index + 4] for index in range(16, len(head), 4))}
    return bool(brands & {b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V "})


def _set_subprocess_limits() -> None:
    if resource is None:  # pragma: no cover - production image is Linux
        raise RuntimeError("POSIX resource limits are required")
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(
        resource.RLIMIT_CPU,
        (PROCESS_CPU_SECONDS, PROCESS_CPU_SECONDS),
    )
    resource.setrlimit(
        resource.RLIMIT_AS,
        (PROCESS_ADDRESS_SPACE_BYTES, PROCESS_ADDRESS_SPACE_BYTES),
    )
    resource.setrlimit(
        resource.RLIMIT_FSIZE,
        (PROCESS_FILE_SIZE_BYTES, PROCESS_FILE_SIZE_BYTES),
    )
    resource.setrlimit(
        resource.RLIMIT_NOFILE,
        (PROCESS_OPEN_FILES, PROCESS_OPEN_FILES),
    )
    resource.setrlimit(resource.RLIMIT_NPROC, (PROCESS_COUNT, PROCESS_COUNT))


def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
    with suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGKILL)
    process.wait()


def _run(command: list[str], *, timeout: int, stdout: int | object) -> bytes:
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            start_new_session=True,
            preexec_fn=_set_subprocess_limits,
        )
    except OSError as exc:
        raise MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE) from exc
    try:
        output, _ = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        _kill_process_group(process)
        raise MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE) from exc
    if process.returncode != 0:
        raise MediaRejected("invalid_video")
    return output or b""


def _probe(source: Path, work_dir: Path, max_duration_seconds: int) -> float:
    probe_output = work_dir / "probe.json"
    command = [
        FFPROBE_BINARY,
        "-v",
        "error",
        "-max_alloc",
        str(_MAX_ALLOC_BYTES),
        "-probesize",
        str(_PROBE_BYTES),
        "-analyzeduration",
        str(_ANALYZE_MICROSECONDS),
        "-show_entries",
        "stream=codec_type,codec_name,width,height:format=duration",
        "-of",
        "json",
        str(source),
    ]
    try:
        with probe_output.open("xb") as output:
            _run(command, timeout=min(TRANSCODE_TIMEOUT_SECONDS, 60), stdout=output)
        if probe_output.stat().st_size > _PROBE_OUTPUT_MAX_BYTES:
            raise MediaRejected("invalid_video")
        payload = json.loads(probe_output.read_bytes())
        streams = payload.get("streams") or []
        video_stream = next(item for item in streams if item.get("codec_type") == "video")
        audio_streams = [item for item in streams if item.get("codec_type") == "audio"]
        duration = float(payload["format"]["duration"])
        width = int(video_stream["width"])
        height = int(video_stream["height"])
    except MediaRejected:
        raise
    except (KeyError, StopIteration, TypeError, ValueError, json.JSONDecodeError, OSError) as exc:
        raise MediaRejected("invalid_video") from exc
    if (
        video_stream.get("codec_name") != "h264"
        or any(stream.get("codec_name") != "aac" for stream in audio_streams)
        or not math.isfinite(duration)
        or duration <= 0
        or width < 1
        or height < 1
        or width * height > _MAX_PIXELS
    ):
        raise MediaRejected("invalid_video")
    if duration > max_duration_seconds:
        raise MediaRejected("duration_exceeded")
    return duration


def _transcode(source: Path, destination: Path, max_duration_seconds: int) -> None:
    command = [
        FFMPEG_BINARY,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-max_alloc",
        str(_MAX_ALLOC_BYTES),
        "-probesize",
        str(_PROBE_BYTES),
        "-analyzeduration",
        str(_ANALYZE_MICROSECONDS),
        # Input and output thread counts are separate FFmpeg options. Bound the
        # decoder before -i and the encoder below so host CPU count cannot fan
        # attacker-controlled work out beyond the process/thread limit.
        "-threads",
        "1",
        "-i",
        str(source),
        "-t",
        str(max_duration_seconds),
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
        "-map_chapters",
        "-1",
        "-metadata",
        "title=",
        "-metadata",
        "comment=",
        "-movflags",
        "+faststart",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-filter_complex_threads",
        "1",
        "-y",
        str(destination),
    ]
    try:
        _run(command, timeout=TRANSCODE_TIMEOUT_SECONDS, stdout=subprocess.DEVNULL)
    except MediaRejected as exc:
        # RLIMIT_FSIZE stops FFmpeg before an oversized canonical file can fill
        # tmpfs. Preserve the existing purpose-specific failure code rather than
        # reporting a valid-but-too-large video as a codec/parser failure.
        with suppress(OSError):
            if destination.stat().st_size >= min(MAX_OUTPUT_BYTES, PROCESS_FILE_SIZE_BYTES):
                raise MediaRejected("output_too_large") from exc
        raise


def transcode(content: bytes, max_duration_seconds: int) -> TranscodeResult:
    if not 0 < len(content) <= MAX_UPLOAD_BYTES or not _is_mp4(content):
        raise MediaRejected("invalid_video")
    if not 0 < max_duration_seconds <= MAX_DURATION_SECONDS:
        raise MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE)
    try:
        with tempfile.TemporaryDirectory(prefix="media-", dir="/tmp") as temp_dir:
            work_dir = Path(temp_dir)
            source = work_dir / "source.mp4"
            destination = work_dir / "canonical.mp4"
            source.write_bytes(content)
            source.chmod(0o600)
            duration = _probe(source, work_dir, max_duration_seconds)
            _transcode(source, destination, max_duration_seconds)
            if destination.is_symlink() or not destination.is_file():
                raise MediaRejected("invalid_video")
            output_size = destination.stat().st_size
            if output_size < 1 or output_size > MAX_OUTPUT_BYTES:
                raise MediaRejected("output_too_large")
            output = destination.read_bytes()
    except MediaRejected:
        raise
    except OSError as exc:
        raise MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE) from exc
    if len(output) != output_size or not _is_mp4(output):
        raise MediaRejected("invalid_video")
    return TranscodeResult(content=output, duration_seconds=duration)


class MediaRuntimeServer(ThreadingHTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "media-runtime"
    sys_version = ""

    def log_message(self, _format: str, *_args: object) -> None:
        # Paths are fixed and native/parser diagnostics may contain submitted
        # metadata. The application records only bounded processing state.
        return

    def _send(self, status: HTTPStatus, content: bytes, content_type: str, **headers: str) -> None:
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in headers.items():
            self.send_header(name.replace("_", "-"), value)
        self.end_headers()
        self.wfile.write(content)
        self.close_connection = True

    def _error(self, error: MediaRejected) -> None:
        payload = json.dumps({"error": error.code}, separators=(",", ":")).encode()
        self._send(
            error.status,
            payload,
            "application/json",
            X_Media_Error=error.code,
            X_Media_Protocol="1",
        )

    def do_GET(self) -> None:
        if self.path != "/health":
            self._error(MediaRejected("not_found", HTTPStatus.NOT_FOUND))
            return
        self._send(HTTPStatus.OK, b'{"status":"ok"}', "application/json")

    def do_POST(self) -> None:
        self.connection.settimeout(30)
        if self.path != "/v1/transcode":
            self._error(MediaRejected("not_found", HTTPStatus.NOT_FOUND))
            return
        if (
            self.headers.get("X-Media-Protocol") != "1"
            or self.headers.get_content_type() != "video/mp4"
            or self.headers.get("Transfer-Encoding") is not None
        ):
            self._error(MediaRejected("invalid_request", HTTPStatus.BAD_REQUEST))
            return
        try:
            content_length = int(self.headers["Content-Length"])
            max_duration = int(self.headers["X-Media-Max-Duration-Seconds"])
        except (KeyError, TypeError, ValueError):
            self._error(MediaRejected("invalid_request", HTTPStatus.BAD_REQUEST))
            return
        if not 0 < content_length <= MAX_UPLOAD_BYTES:
            self._error(MediaRejected("invalid_request", HTTPStatus.REQUEST_ENTITY_TOO_LARGE))
            return
        if not _TRANSCODE_SLOT.acquire(blocking=False):
            self._error(MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE))
            return
        try:
            content = self.rfile.read(content_length)
            if len(content) != content_length:
                raise MediaRejected("invalid_request", HTTPStatus.BAD_REQUEST)
            result = transcode(content, max_duration)
        except MediaRejected as exc:
            self._error(exc)
        except (OSError, TimeoutError):
            self._error(MediaRejected("processing_unavailable", HTTPStatus.SERVICE_UNAVAILABLE))
        finally:
            _TRANSCODE_SLOT.release()
        if "result" in locals():
            self._send(
                HTTPStatus.OK,
                result.content,
                "video/mp4",
                X_Media_Duration_Seconds=f"{result.duration_seconds:.6f}",
                X_Media_Protocol="1",
            )


def main() -> NoReturn:
    server = MediaRuntimeServer((HOST, PORT), Handler)
    server.serve_forever(poll_interval=0.5)
    raise AssertionError("unreachable")


if __name__ == "__main__":
    main()
