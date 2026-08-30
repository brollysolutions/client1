# Reviewed 2026-08-30; keep the readable tag beside the immutable manifest.
FROM python:3.12-slim@sha256:09f7da3bc104798d0afb40bc08d23ab2da20a76130cec1f2ef170848f5d85217

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEDIA_RUNTIME_HOST=0.0.0.0 \
    MEDIA_RUNTIME_PORT=8080 \
    MEDIA_MAX_UPLOAD_BYTES=20971520 \
    MEDIA_MAX_OUTPUT_BYTES=20971520 \
    MEDIA_MAX_DURATION_SECONDS=60 \
    MEDIA_TRANSCODE_TIMEOUT_SECONDS=180 \
    MEDIA_PROCESS_CPU_SECONDS=185 \
    MEDIA_PROCESS_ADDRESS_SPACE_BYTES=1342177280 \
    MEDIA_PROCESS_FILE_SIZE_BYTES=20971520 \
    MEDIA_PROCESS_OPEN_FILES=64 \
    MEDIA_PROCESS_COUNT=32

# FFmpeg and its codec/parser libraries deliberately exist only in this image.
# The runtime gets no application source, dependency environment, credentials,
# persistent volume, or public port in the documented Compose topology.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 10001 media \
    && adduser --system --uid 10001 --ingroup media --no-create-home media

WORKDIR /opt/media-runtime
COPY --chown=media:media server.py ./server.py

USER 10001:10001
EXPOSE 8080

# Starting the Python probe competes with FFmpeg inside the deliberate 1-CPU
# quota. Keep the endpoint strict, but allow enough scheduling time that a real
# transcode cannot create a false unhealthy transition.
HEALTHCHECK --interval=15s --timeout=10s --retries=3 --start-period=10s \
    CMD ["python", "-c", "import json,sys,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=8); sys.exit(0 if r.status == 200 and json.load(r).get('status') == 'ok' else 1)"]

ENTRYPOINT ["python", "/opt/media-runtime/server.py"]
