"""Every route must install the RLS context, or be an explicitly reviewed public one.

The API connects as the `app` role, which is SUPERUSER + BYPASSRLS, so RLS is
*off* by default on every session. It only turns on when a route's dependency
tree reaches `get_current_user`, which runs `SET LOCAL ROLE api_user` plus the
`app.*` GUCs (see app/core/deps.py::_set_rls_context). A route wired to a plain
`get_db` session therefore reads and writes every row in every table with no
policy applied and no error — the failure is silent and total.

Per-feature `*_rls.py` suites prove the policies are correct for the routes
someone remembered to cover. This file closes the other half: it enumerates the
whole route table and fails when a NEW route ships without the context. The
allowlist below is the reviewable record of the routes that are deliberately
superuser — adding to it is a diff line a reviewer sees, whereas forgetting the
dependency is invisible.

No database or Redis needed: this is pure app introspection, so it runs in every
environment including a bare `pytest -q` with no Docker stack.
"""

from __future__ import annotations

from fastapi.routing import APIRoute

from app.core.deps import get_current_user
from app.main import app

# Routes that intentionally run WITHOUT the RLS context, each because the caller
# has no authenticated identity yet (registration/login/OTP/reset), the data is
# public by definition (public catalog), or the caller is authenticated by a
# separate mechanism (signed webhook, single-use invitation token).
#
# Adding an entry means: "this endpoint runs as the `app` superuser with RLS
# disabled, and I have checked that its query scope is safe without policies."
PUBLIC_ROUTES = frozenset(
    {
        # Liveness/readiness — no business data.
        "GET /",
        "GET /health",
        # Unauthenticated auth lifecycle: the caller has no session to scope yet.
        "POST /api/v1/auth/login",
        "POST /api/v1/auth/refresh",
        "POST /api/v1/auth/otp/resend",
        "POST /api/v1/auth/register/initiate",
        "POST /api/v1/auth/register/verify-otp",
        "POST /api/v1/auth/register/set-password",
        "POST /api/v1/auth/forgot/initiate",
        "POST /api/v1/auth/forgot/verify",
        "POST /api/v1/auth/forgot/reset",
        # Mobile-change runs pre-session by design (the mobile IS the identity).
        "POST /api/v1/mobile-change/initiate",
        "POST /api/v1/mobile-change/resend",
        "POST /api/v1/mobile-change/verify",
        # Staff first-login invite: the holder has an account but no password yet,
        # so there is no session to scope. Both routes take a hashed, single-use,
        # expiring token, are IP rate-limited, and touch only the one identity that
        # token resolves to; neither reads or writes any other business table.
        "GET /api/v1/staff-invites/{token}",
        "POST /api/v1/staff-invites/{token}/accept",
        # Approved-Agent first-login uses the same reviewed boundary as staff:
        # a hashed, expiring, single-use token scopes the anonymous request to
        # one pending-password identity, with separate preview/accept IP caps.
        "GET /api/v1/agent-invites/{token}",
        "POST /api/v1/agent-invites/{token}/accept",
        # Prospective-agent intake: applicant has no account until approval.
        "POST /api/v1/agent-applications",
        "POST /api/v1/agent-applications/otp/initiate",
        "POST /api/v1/agent-applications/otp/resend",
        "POST /api/v1/agent-applications/otp/verify",
        "POST /api/v1/agent-applications/uploads/presign",
        # Public marketing/catalog surfaces — published content only.
        "GET /api/v1/public/banners",
        "GET /api/v1/public/properties",
        "GET /api/v1/public/properties/{property_id}",
        "GET /api/v1/public/content-blocks",
        "GET /api/v1/public/content-blocks/{slug}",
        "GET /api/v1/public/financial-products",
        "GET /api/v1/public/financial-products/{slug}",
        "GET /api/v1/public/financial-products/{slug}/providers",
        # Anonymous lead capture from the public site.
        "POST /api/v1/leads",
        # Bearer-token-in-URL invitation lookup; the token is the authorization.
        "GET /api/v1/leads/invitations/{token}",
        # VAPID public key is public by construction.
        "GET /api/v1/push/vapid-public-key",
        # Signature-verified provider callback, not a user session.
        "POST /api/v1/payouts/webhook/razorpay",
    }
)

# Enumeration guard. FastAPI keeps `include_router` results as nested
# `_IncludedRouter` objects rather than flattening them into `app.routes`, so a
# naive `for r in app.routes` walk finds only the 2 root routes and this whole
# file would pass while checking nothing. If a FastAPI upgrade changes that
# internal shape again, this floor turns a vacuous pass into a red test.
MIN_EXPECTED_ROUTES = 180


def _walk(routes: object, prefix: str = "") -> list[tuple[str, APIRoute]]:
    """Yield (full_path, route) for every APIRoute, descending into included routers."""
    found: list[tuple[str, APIRoute]] = []
    for route in routes:  # type: ignore[attr-defined]
        if isinstance(route, APIRoute):
            found.append((prefix + route.path, route))
            continue
        # FastAPI >=0.115 nests included routers; the prefix lives on the context.
        context = getattr(route, "include_context", None)
        if context is not None:
            found.extend(_walk(context.included_router.routes, prefix + (context.prefix or "")))
    return found


def _installs_rls_context(dependant: object, seen: set[int] | None = None) -> bool:
    """True when get_current_user is anywhere in this route's dependency tree."""
    seen = set() if seen is None else seen
    if getattr(dependant, "call", None) is get_current_user:
        return True
    for sub in getattr(dependant, "dependencies", ()):
        if id(sub) in seen:
            continue
        seen.add(id(sub))
        if _installs_rls_context(sub, seen):
            return True
    return False


def _route_keys() -> list[str]:
    keys: list[str] = []
    for path, route in _walk(app.routes):
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            keys.append(f"{method} {path}")
    return keys


def _unprotected_route_keys() -> set[str]:
    unprotected: set[str] = set()
    for path, route in _walk(app.routes):
        if _installs_rls_context(route.dependant):
            continue
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            unprotected.add(f"{method} {path}")
    return unprotected


def test_route_enumeration_is_not_vacuous() -> None:
    """Guard the guard: prove the walker still finds the real route table."""
    count = len(_route_keys())
    assert count >= MIN_EXPECTED_ROUTES, (
        f"Only {count} routes enumerated (expected >= {MIN_EXPECTED_ROUTES}). "
        "FastAPI's router internals likely changed and _walk() no longer descends "
        "into included routers — every assertion in this file is passing vacuously."
    )


def test_every_route_installs_rls_context_or_is_allowlisted() -> None:
    undeclared = sorted(_unprotected_route_keys() - PUBLIC_ROUTES)
    assert not undeclared, (
        "These routes never run SET LOCAL ROLE api_user, so they execute as the "
        "`app` SUPERUSER with RLS disabled on every table:\n  "
        + "\n  ".join(undeclared)
        + "\n\nAdd the authenticated dependency (get_active_user / require_*), or, if the "
        "endpoint is genuinely public, add it to PUBLIC_ROUTES with a comment stating "
        "why running without policies is safe."
    )


def test_public_allowlist_has_no_stale_entries() -> None:
    """A removed or newly-protected route must not linger in the allowlist.

    Stale entries silently pre-authorize a future path that happens to reuse the
    same method+path string.
    """
    stale = sorted(PUBLIC_ROUTES - _unprotected_route_keys())
    assert not stale, (
        "PUBLIC_ROUTES lists routes that no longer exist or now install the RLS "
        "context. Remove them:\n  " + "\n  ".join(stale)
    )
