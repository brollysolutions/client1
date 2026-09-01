"""External links attached to a property listing.

Property free text may not contain a URL at all: ``_normalize_public_text`` in
``app.schemas.property_details`` rejects schemes, bare domains, emails, and
markdown links, and tests assert it. That guard stays exactly as it is. This
module is the narrow, deliberate carve-out — a *structured* place for the one
thing agents legitimately need, a pointer to the property's existing presence
on YouTube/Instagram/Facebook.

Two properties make the carve-out defensible:

1. **The platform is derived from the host, never author-supplied.** An author
   cannot label ``https://yout-ube-verify.example`` as "YouTube". The stored
   ``platform`` is whatever ``LISTING_LINK_HOSTS`` says the host is, so the
   badge a public visitor sees always matches where the link actually goes.
2. **The host must be on the allowlist.** These links render on the anonymous
   public catalogue of a financial site, so an arbitrary author-supplied host
   would be a phishing surface that Admin approval alone is a weak control for
   (a reviewer cannot see where a shortener resolves). ``offers.py`` accepts any
   HTTPS host for partner URLs, but those render only to authenticated users on
   a dashboard — a weaker precedent that should not be copied here.

Links still pass through the existing submission -> Admin approval gate; the
allowlist narrows what a reviewer can be tricked into approving, it does not
replace the reviewer.
"""

from __future__ import annotations

import enum
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


class ListingLinkPlatform(enum.StrEnum):
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


# Extension seam: adding a platform is a new enum value plus its hosts here.
# Keep hosts lowercase and exact — matching is equality, never a suffix check,
# because "youtube.com.evil.example" ends with nothing we trust but would pass a
# naive ``endswith``.
LISTING_LINK_HOSTS: dict[str, ListingLinkPlatform] = {
    "youtube.com": ListingLinkPlatform.YOUTUBE,
    "www.youtube.com": ListingLinkPlatform.YOUTUBE,
    "m.youtube.com": ListingLinkPlatform.YOUTUBE,
    "youtu.be": ListingLinkPlatform.YOUTUBE,
    "instagram.com": ListingLinkPlatform.INSTAGRAM,
    "www.instagram.com": ListingLinkPlatform.INSTAGRAM,
    "facebook.com": ListingLinkPlatform.FACEBOOK,
    "www.facebook.com": ListingLinkPlatform.FACEBOOK,
    "m.facebook.com": ListingLinkPlatform.FACEBOOK,
    "fb.watch": ListingLinkPlatform.FACEBOOK,
}

MAX_LISTING_LINKS = 4
_MAX_URL_LENGTH = 1000

_ALLOWED_HOST_HINT = "YouTube, Instagram, or Facebook"


def resolve_listing_link_platform(url: str) -> ListingLinkPlatform | None:
    """Return the allowlisted platform for ``url``, or None if it is not allowed.

    Shared with the render path so a link stored before an allowlist change can
    never be rendered as a trusted platform badge afterwards.
    """

    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    if parsed.scheme != "https" or parsed.username is not None or parsed.password is not None:
        return None
    hostname = parsed.hostname
    if not hostname:
        return None
    # urlsplit lowercases nothing for us on the raw string; hostname is already
    # lowercased by urlsplit, but strip a trailing root dot ("youtube.com.")
    # which resolves identically yet would miss an equality match.
    return LISTING_LINK_HOSTS.get(hostname.rstrip("."))


class ListingLink(BaseModel):
    """One external link. ``platform`` is derived, never trusted from input."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    url: str = Field(max_length=_MAX_URL_LENGTH)
    platform: ListingLinkPlatform | None = None

    @model_validator(mode="after")
    def _derive_platform(self) -> ListingLink:
        resolved = resolve_listing_link_platform(self.url)
        if resolved is None:
            raise ValueError(
                f"Listing links must be HTTPS {_ALLOWED_HOST_HINT} URLs "
                "without embedded credentials."
            )
        # Overwrite unconditionally: an author-sent platform is advisory at best
        # and a lie at worst. Plain assignment is safe here — validate_assignment
        # is off, so this does not re-enter the validator.
        self.platform = resolved
        return self


def safe_stored_listing_links(stored: object) -> list[dict] | None:
    """Keep only the stored links that still pass the allowlist.

    Read projections must never re-run the strict ``ListingLink`` validator over
    a stored row and let it raise: a row saved before the allowlist shrank -- or
    edited directly in the database -- would otherwise 500 the whole catalogue
    for everyone, not just hide one link. This mirrors the containment
    ``_public_property_data`` already applies to malformed ``structured_details``
    (see app/api/v1/public_catalog.py): serve the safe facts, drop the bad part.

    Dropping rather than passing through is the security half. A link that no
    longer resolves to an allowlisted host must not reach a rendered anchor, and
    the platform is re-derived here so a stored ``platform`` can never disagree
    with where the URL actually goes.
    """

    if not isinstance(stored, list):
        return None
    safe: list[dict] = []
    for entry in stored:
        # Accept both the raw JSONB dict (the usual read path) and an already
        # built ListingLink, so constructing a read model directly does not
        # silently drop every link.
        if isinstance(entry, ListingLink):
            url: object = entry.url
        elif isinstance(entry, dict):
            url = entry.get("url")
        else:
            continue
        if not isinstance(url, str):
            continue
        platform = resolve_listing_link_platform(url)
        if platform is None:
            continue
        safe.append({"url": url, "platform": platform.value})
    return safe[:MAX_LISTING_LINKS] or None


def normalize_listing_links(links: list[ListingLink] | None) -> list[ListingLink] | None:
    """Drop duplicate URLs and enforce the count cap.

    Deduplication is by exact URL after Pydantic's whitespace strip. Two
    different URLs pointing at the same video are still two links; collapsing
    those would need per-platform canonicalization this feature does not need.
    """

    if links is None:
        return None
    seen: set[str] = set()
    unique: list[ListingLink] = []
    for link in links:
        if link.url in seen:
            continue
        seen.add(link.url)
        unique.append(link)
    if len(unique) > MAX_LISTING_LINKS:
        raise ValueError(f"Add at most {MAX_LISTING_LINKS} listing links.")
    return unique


StoredListingLinks = Annotated[
    list[ListingLink] | None,
    BeforeValidator(safe_stored_listing_links),
]
"""Read-shape type for ``listing_links``.

Use this on every read schema instead of a bare ``list[ListingLink] | None``.
The bare type re-runs the strict write validator over stored JSONB, so one row
written before the allowlist shrank would raise and 500 the whole endpoint
instead of hiding a single link. This filters first, then validates, so the
containment cannot be forgotten by a future read path.
"""
