# Reviewed 2026-08-31; keep the readable release beside the immutable manifest.
FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40

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
RUN apk add --no-cache --upgrade \
    "python3=3.12.14-r0" \
    "ffmpeg=8.0.1-r1" \
    "libcrypto3=3.5.8-r0" \
    "libssl3=3.5.8-r0" \
    "sqlite-libs=3.53.4-r0" \
    && addgroup -S -g 10001 media \
    && adduser -S -D -H -u 10001 -G media media

WORKDIR /opt/media-runtime
COPY --chown=media:media server.py ./server.py

USER 10001:10001
EXPOSE 8080

# Starting the Python probe competes with FFmpeg inside the deliberate 1-CPU
# quota. Keep the endpoint strict, but allow enough scheduling time that a real
# transcode cannot create a false unhealthy transition.
HEALTHCHECK --interval=15s --timeout=10s --retries=3 --start-period=10s \
    CMD ["python3", "-c", "import json,sys,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=8); sys.exit(0 if r.status == 200 and json.load(r).get('status') == 'ok' else 1)"]

ENTRYPOINT ["python3", "/opt/media-runtime/server.py"]
