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
    nothing about the cap depends on the browser behaving. Used by public KYC
    intake and authenticated managed-media upload flows.

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


_PUBLIC_PREFIX = "public/"


def public_asset_url(object_key: str) -> str | None:
    """Direct, unsigned URL for an object under the `public/` prefix, or None.

    Everything else this module serves (KYC docs, task documents) stays behind
    presign_download's short-lived, `attachment`-forced signed URL -- never
    something you can hand to <img src>. `public/` is different: the bucket
    policy (infra, not this function) grants anonymous s3:GetObject on
    `{bucket}/public/*` with no s3:ListBucket, so an object under that prefix
    is already world-readable by construction. This function only builds the
    URL; the `startswith` check is the important line -- it is what stops a
    caller from turning a non-public key (e.g. a stray `image_key` typo
    pointing at an agent-application KYC object) into something that LOOKS
    like a servable URL. It does not grant access either way -- the bucket
    policy is the actual boundary -- but a None return means the frontend's
    <img>/next/image never even attempts the request.

    Same path-style URL shape as presign_upload/presign_download
    (`{endpoint}/{bucket}/{key}`, verified against this dev stack's minio),
    built against the public endpoint since this URL is handed to the
    browser.
    """
    if not object_key.startswith(_PUBLIC_PREFIX):
        return None
    return f"{_public_endpoint()}/{settings.SPACES_BUCKET}/{object_key}"


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


def presign_preview(object_key: str) -> str:
    """Short-lived inline GET for an authenticated, authorization-checked image."""
    return _client(_public_endpoint()).generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.SPACES_BUCKET, "Key": object_key},
        ExpiresIn=_PRESIGN_EXPIRE_SECONDS,
    )


def copy_object(source_key: str, destination_key: str, content_type: str) -> None:
    """Copy a verified private object into an approved public key."""
    _client(settings.SPACES_ENDPOINT_URL).copy_object(
        Bucket=settings.SPACES_BUCKET,
        Key=destination_key,
        CopySource={"Bucket": settings.SPACES_BUCKET, "Key": source_key},
        ContentType=content_type,
        MetadataDirective="REPLACE",
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


def read_head_bytes(object_key: str, n: int = 16) -> bytes | None:
    """First `n` bytes of an object via a ranged GET, or None if it does not
    exist. Server-side only, same posture as head_object — a magic-byte check
    needs actual content, not just the size head_object already gives.
    A transport failure re-raises (fail closed), same reasoning as head_object.
    """
    try:
        resp = _client(settings.SPACES_ENDPOINT_URL).get_object(
            Bucket=settings.SPACES_BUCKET, Key=object_key, Range=f"bytes=0-{n - 1}"
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey"):
            return None
        raise
    return resp["Body"].read()


def read_object_bytes(object_key: str, *, max_bytes: int) -> bytes | None:
    """Read one bounded private object, returning None when it is absent.

    The caller supplies the purpose-specific cap. ContentLength is checked
    before reading and the body length is checked again so a storage/proxy
    inconsistency can never turn a bounded sanitizer into an unbounded read.
    """
    try:
        resp = _client(settings.SPACES_ENDPOINT_URL).get_object(
            Bucket=settings.SPACES_BUCKET, Key=object_key
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey"):
            return None
        raise
    content_length = int(resp.get("ContentLength", 0))
    if content_length < 1 or content_length > max_bytes:
        return None
    body = resp["Body"].read(max_bytes + 1)
    if len(body) != content_length or len(body) > max_bytes:
        return None
    return body


def put_object_bytes(object_key: str, content: bytes, content_type: str) -> None:
    """Write generated canonical bytes with an explicit safe content type."""
    _client(settings.SPACES_ENDPOINT_URL).put_object(
        Bucket=settings.SPACES_BUCKET,
        Key=object_key,
        Body=content,
        ContentType=content_type,
    )


# Magic-byte signatures for the content types this codebase's managed upload
# flows allow (employee, agent application, loan document, and property media).
# (feature-status.md §2-12): the declared Content-Type is signed into the
# presigned-POST policy, but nothing previously verified the uploaded BYTES
# actually match it — an HTML/script polyglot declared as application/pdf
# would have been accepted and later served (mitigated, not prevented, by
# forced attachment disposition on download).
_MAGIC_BYTES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"%PDF-", "application/pdf"),
    # WEBP is a RIFF container — "RIFF" then a 4-byte size, then "WEBP" at
    # offset 8. Checked as one prefix over a 12-byte head rather than two
    # separate slices, since read_head_bytes already returns a flat head.
)
_WEBP_RIFF_PREFIX = b"RIFF"
_WEBP_MARKER = b"WEBP"


def sniff_content_type(head: bytes) -> str | None:
    """Best-guess content type from a file's opening bytes, or None if it
    matches none of the four types this codebase accepts anywhere."""
    for signature, content_type in _MAGIC_BYTES:
        if head.startswith(signature):
            return content_type
    if head[:4] == _WEBP_RIFF_PREFIX and head[8:12] == _WEBP_MARKER:
        return "image/webp"
    # ISO Base Media File Format: a 32-bit box length followed by `ftyp`.
    # Accept only well-known MP4 brands; QuickTime/MOV and arbitrary ISO-BMFF
    # payloads are not part of the closed upload vocabulary.
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brands = {head[8:12], *(head[index : index + 4] for index in range(16, len(head), 4))}
        if brands & {b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"M4V "}:
            return "video/mp4"
    return None


def content_matches_declared_type(object_key: str, declared_content_type: str) -> bool:
    """True only if the object's actual leading bytes sniff to the SAME type
    the caller declared at presign time. False on a mismatch, a type this
    module doesn't recognize, or a missing object — all three are "reject",
    never "assume it's fine"."""
    head = read_head_bytes(object_key, 32)
    if head is None:
        return False
    return sniff_content_type(head) == declared_content_type


def content_type_is_recognized(object_key: str) -> bool:
    """Weaker variant of content_matches_declared_type for the two upload
    flows (agent-application intake, employee task documents) whose confirm
    request does not carry the originally-declared content_type to compare
    against — True iff the object's leading bytes sniff to ANY of the four
    types this module recognizes (which is exactly the accepted set on
    every upload flow in this codebase — see _MAGIC_BYTES). Still rejects
    the actual security concern (arbitrary/executable content uploaded
    under a claimed KYC-document key); it just can't catch "uploaded a real
    PNG when a PDF was declared" without a schema change."""
    head = read_head_bytes(object_key, 32)
    if head is None:
        return False
    return sniff_content_type(head) is not None


def delete_object(object_key: str) -> None:
    # Best-effort: the task_documents row is the source of truth for what the
    # employee sees. A storage-side failure here must not block the DB delete
    # (an orphaned object is a cheap, silent cost; a stuck delete flow is not).
    # Logged without the key: private keys can contain account/application
    # identifiers and must not become durable log data.
    try:
        _client(settings.SPACES_ENDPOINT_URL).delete_object(
            Bucket=settings.SPACES_BUCKET, Key=object_key
        )
    except Exception:
        logger.warning("storage delete_object failed")
