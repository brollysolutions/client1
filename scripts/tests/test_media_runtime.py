from __future__ import annotations

import http.client
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_PATH = ROOT / "apps/media-runtime/server.py"
SPEC = importlib.util.spec_from_file_location("dhanadhara_media_runtime", SERVER_PATH)
assert SPEC is not None and SPEC.loader is not None
runtime = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runtime
SPEC.loader.exec_module(runtime)


def mp4(payload: bytes = b"video") -> bytes:
    return b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom" + payload


class MediaRuntimeTests(unittest.TestCase):
    def test_probe_preserves_codec_resolution_and_duration_policy(self) -> None:
        payload = {
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                },
                {"codec_type": "audio", "codec_name": "aac"},
            ],
            "format": {"duration": "59.25"},
        }
        commands: list[list[str]] = []

        def run(command: list[str], *, timeout: int, stdout: object) -> bytes:
            commands.append(command)
            self.assertLessEqual(timeout, 60)
            stdout.write(json.dumps(payload).encode())
            return b""

        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            source = work_dir / "source.mp4"
            source.write_bytes(mp4())
            with patch.object(runtime, "_run", run):
                duration = runtime._probe(source, work_dir, 60)

        self.assertEqual(duration, 59.25)
        self.assertIn("-max_alloc", commands[0])
        self.assertIn("-probesize", commands[0])
        self.assertIn("-analyzeduration", commands[0])

    def test_probe_rejects_overlong_video(self) -> None:
        payload = {
            "streams": [
                {"codec_type": "video", "codec_name": "h264", "width": 1280, "height": 720}
            ],
            "format": {"duration": "61"},
        }

        def run(_command: list[str], *, timeout: int, stdout: object) -> bytes:
            del timeout
            stdout.write(json.dumps(payload).encode())
            return b""

        with tempfile.TemporaryDirectory() as temp_dir:
            work_dir = Path(temp_dir)
            source = work_dir / "source.mp4"
            source.write_bytes(mp4())
            with (
                patch.object(runtime, "_run", run),
                self.assertRaisesRegex(runtime.MediaRejected, "duration_exceeded"),
            ):
                runtime._probe(source, work_dir, 60)

    def test_transcode_command_has_time_stream_metadata_and_thread_bounds(self) -> None:
        commands: list[list[str]] = []

        def run(command: list[str], *, timeout: int, stdout: object) -> bytes:
            del stdout
            commands.append(command)
            self.assertEqual(timeout, runtime.TRANSCODE_TIMEOUT_SECONDS)
            return b""

        with patch.object(runtime, "_run", run):
            runtime._transcode(Path("source.mp4"), Path("canonical.mp4"), 60)

        command = commands[0]
        for expected in (
            "-nostdin",
            "-max_alloc",
            "-probesize",
            "-analyzeduration",
            "-t",
            "-sn",
            "-dn",
            "-map_metadata",
            "-map_chapters",
            "-threads",
            "-filter_threads",
            "-filter_complex_threads",
        ):
            self.assertIn(expected, command)
        self.assertEqual(command.count("-threads"), 2)
        thread_indexes = [index for index, value in enumerate(command) if value == "-threads"]
        self.assertTrue(all(command[index + 1] == "1" for index in thread_indexes))
        self.assertLess(thread_indexes[0], command.index("-i"))

    def test_transcode_preserves_output_too_large_failure_code(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "canonical.mp4"
            destination.write_bytes(b"x" * min(runtime.MAX_OUTPUT_BYTES, 1024))
            threshold = destination.stat().st_size
            with (
                patch.object(runtime, "MAX_OUTPUT_BYTES", threshold),
                patch.object(runtime, "PROCESS_FILE_SIZE_BYTES", threshold),
                patch.object(
                    runtime,
                    "_run",
                    side_effect=runtime.MediaRejected("invalid_video"),
                ),
                self.assertRaisesRegex(runtime.MediaRejected, "output_too_large"),
            ):
                runtime._transcode(Path("source.mp4"), destination, 60)

    def test_subprocess_resource_limits_are_all_installed(self) -> None:
        if runtime.resource is None:
            self.skipTest("POSIX resource module is available in the Linux runtime image")
        with patch.object(runtime.resource, "setrlimit") as setrlimit:
            runtime._set_subprocess_limits()

        resources = {call.args[0] for call in setrlimit.call_args_list}
        self.assertEqual(
            resources,
            {
                runtime.resource.RLIMIT_CORE,
                runtime.resource.RLIMIT_CPU,
                runtime.resource.RLIMIT_AS,
                runtime.resource.RLIMIT_FSIZE,
                runtime.resource.RLIMIT_NOFILE,
                runtime.resource.RLIMIT_NPROC,
            },
        )

    def test_http_protocol_returns_only_bounded_canonical_bytes(self) -> None:
        canonical = mp4(b"canonical")
        server = runtime.MediaRuntimeServer(("127.0.0.1", 0), runtime.Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(
                runtime,
                "transcode",
                return_value=runtime.TranscodeResult(canonical, 1.25),
            ):
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=2)
                connection.request(
                    "POST",
                    "/v1/transcode",
                    body=mp4(),
                    headers={
                        "Content-Type": "video/mp4",
                        "X-Media-Max-Duration-Seconds": "60",
                        "X-Media-Protocol": "1",
                    },
                )
                response = connection.getresponse()
                body = response.read()
                connection.close()

            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("Content-Type"), "video/mp4")
            self.assertEqual(response.getheader("X-Media-Protocol"), "1")
            self.assertEqual(response.getheader("X-Media-Duration-Seconds"), "1.250000")
            self.assertEqual(body, canonical)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_health_remains_responsive_while_transcode_is_active(self) -> None:
        entered = threading.Event()
        release = threading.Event()
        result: list[int] = []

        def transcode_while_busy(
            _content: bytes, _max_duration_seconds: int
        ) -> runtime.TranscodeResult:
            entered.set()
            if not release.wait(timeout=2):
                raise RuntimeError("test did not release active transcode")
            return runtime.TranscodeResult(mp4(b"canonical"), 1.0)

        def post_video(port: int) -> None:
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            connection.request(
                "POST",
                "/v1/transcode",
                body=mp4(),
                headers={
                    "Content-Type": "video/mp4",
                    "X-Media-Max-Duration-Seconds": "60",
                    "X-Media-Protocol": "1",
                },
            )
            response = connection.getresponse()
            response.read()
            result.append(response.status)
            connection.close()

        server = runtime.MediaRuntimeServer(("127.0.0.1", 0), runtime.Handler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        post_thread = threading.Thread(target=post_video, args=(server.server_port,))
        try:
            with patch.object(runtime, "transcode", side_effect=transcode_while_busy):
                post_thread.start()
                self.assertTrue(entered.wait(timeout=1))
                connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=1)
                connection.request("GET", "/health")
                response = connection.getresponse()
                body = response.read()
                connection.close()
                self.assertEqual(response.status, 200)
                self.assertEqual(json.loads(body), {"status": "ok"})
                release.set()
                post_thread.join(timeout=2)
        finally:
            release.set()
            post_thread.join(timeout=2)
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=2)

        self.assertEqual(result, [200])


if __name__ == "__main__":
    unittest.main()
