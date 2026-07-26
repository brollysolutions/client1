"""S3-compatible object storage — minio in dev, DigitalOcean Spaces in prod.

Both speak the same S3 API, so one boto3 client works in every environment;
only SPACES_ENDPOINT_URL/credentials differ (same posture as DATABASE_URL
swapping pgbouncer host per environment, not a mock/live feature toggle like
payments — storage has no "off" state, every environment needs it).

Presigning is a pure local HMAC computation: boto3 never makes a network call
to generate a URL, so callers (and tests) don't need a reachable storage
endpoint just to get a signed URL back.

Two endpoints, one bucket: SPACES_ENDPOINT_URL is the container-network host
the API itself talks to (delete_object runs server-side, inside the compose
network — "minio:9000" in dev). Presigned URLs are handed to the *browser*
instead, which can't resolve that container-network hostname at all, so
presign_upload/presign_download sign against SPACES_PUBLIC_ENDPOINT_URL (the
port published to the host — "localhost:9000" in dev). In prod both are the
same public Spaces URL, so SPACES_PUBLIC_ENDPOINT_URL is left unset and
falls back to SPACES_ENDPOINT_URL — no double config needed there.
"""

from __future__ import annotations

import logging

import boto3
from botocore.client import BaseClient
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

logger = logging.getLogger(__name__)

_PRESIGN_EXPIRE_SECONDS = 300


def _client(endpoint_url: str) -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=settings.SPACES_REGION,
        aws_access_key_id=settings.SPACES_ACCESS_KEY,
        aws_secret_access_key=settings.SPACES_SECRET_KEY,
        # Short timeouts + no retries: delete_object is best-effort (see
        # delete_object below) and must fail fast, not hang the request, if
        # storage is briefly unreachable. Presigning never hits the network
        # regardless of this config.
        config=BotoConfig(
            signature_version="s3v4",
            connect_timeout=3,
            read_timeout=3,
            retries={"max_attempts": 1},
        ),
    )


def _public_endpoint() -> str:
    return settings.SPACES_PUBLIC_ENDPOINT_URL or settings.SPACES_ENDPOINT_URL


def presign_upload(object_key: str, content_type: str) -> str:
    return _client(_public_endpoint()).generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.SPACES_BUCKET,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=_PRESIGN_EXPIRE_SECONDS,
    )


def presign_upload_post(
    object_key: str,
    content_type: str,
    *,
    max_bytes: int,
    expires_in: int = _PRESIGN_EXPIRE_SECONDS,
) -> tuple[str, dict[str, str]]:
    """Browser multipart-POST presign with a SIGNED size cap.

    Unlike presign_upload's PUT (which signs only bucket/key/content-type and
    has no size bound at all — fine for authenticated staff uploads, not fine
    for an anonymous public endpoint), the POST policy document is part of the
    signature: storage itself rejects an oversize or wrong-typed body, so
    nothing about the cap depends on the browser behaving. Used exclusively by
    the public agent-application KYC upload path.

    Returns (url, fields). The caller POSTs both back to `url` as multipart
    form fields alongside the file; the file part must be appended LAST — S3/
    MinIO ignore any field that comes after it.
    """
    resp = _client(_public_endpoint()).generate_presigned_post(
        Bucket=settings.SPACES_BUCKET,
        Key=object_key,
        Fields={"Content-Type": content_type, "success_action_status": "201"},
        Conditions=[
            {"Content-Type": content_type},
            {"success_action_status": "201"},
            ["content-length-range", 1, max_bytes],
        ],
        ExpiresIn=expires_in,
    )
    return resp["url"], resp["fields"]


def head_object(object_key: str) -> int | None:
    """Object size in bytes, or None if it does not exist.

    Runs server-side against SPACES_ENDPOINT_URL (container network) — never
    reaches the browser. Distinguishes "doesn't exist" (safe to reject the
    submission) from a transport failure (re-raised, so the caller fails
    closed with a 502 instead of silently accepting an unverified upload).
    _client already bounds this to a 3s timeout with no retries, so a dead
    storage endpoint cannot hang the request.
    """
    try:
        resp = _client(settings.SPACES_ENDPOINT_URL).head_object(
            Bucket=settings.SPACES_BUCKET, Key=object_key
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey"):
            return None
        raise
    return int(resp["ContentLength"])


def presign_download(object_key: str) -> str:
    return _client(_public_endpoint()).generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.SPACES_BUCKET,
            "Key": object_key,
            # Force download rather than inline render. A collected document
            # is untrusted input (e.g. a PDF can carry embedded JavaScript);
            # this closes off a viewer executing it just from opening the link.
            "ResponseContentDisposition": "attachment",
        },
        ExpiresIn=_PRESIGN_EXPIRE_SECONDS,
    )


def list_objects(prefix: str) -> list[dict]:
    """List every object under `prefix` as [{"key", "last_modified"}, ...].

    Server-side only (SPACES_ENDPOINT_URL, container network) — never reaches
    the browser. Paginated so a large prefix doesn't silently truncate.
    Unlike delete_object, this is NOT best-effort: the orphan-purge job that
    calls this needs to know if the sweep actually ran, so a transport
    failure propagates rather than being swallowed into an empty list.
    """
    client = _client(settings.SPACES_ENDPOINT_URL)
    paginator = client.get_paginator("list_objects_v2")
    results: list[dict] = []
    for page in paginator.paginate(Bucket=settings.SPACES_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            results.append({"key": obj["Key"], "last_modified": obj["LastModified"]})
    return results


def delete_object(object_key: str) -> None:
    # Best-effort: the task_documents row is the source of truth for what the
    # employee sees. A storage-side failure here must not block the DB delete
    # (an orphaned object is a cheap, silent cost; a stuck delete flow is not).
    # Logged (key only, never document content/PII) so a persistent storage
    # problem doesn't go completely unnoticed.
    try:
        _client(settings.SPACES_ENDPOINT_URL).delete_object(
            Bucket=settings.SPACES_BUCKET, Key=object_key
        )
    except Exception:
        logger.warning("storage delete_object failed for key=%s", object_key)
