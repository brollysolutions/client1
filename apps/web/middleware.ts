import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge pre-redirect for /dashboard, NOT the whole (app) route group. This is
// a UX/perf shortcut, not the security boundary: RLS + the API's own token
// checks are the real wall (CLAUDE.md). It reads the non-authoritative
// "session_hint" cookie that session-provider.tsx sets on login, clears on
// logout, and re-syncs on every AuthProvider mount (a mirror of the
// localStorage hint it already kept, extended to a cookie so middleware can
// see it). An obviously-logged-out visitor to /dashboard gets redirected
// here, before the app shell downloads and hydrates, instead of only
// bouncing after AppGuard's client-side check resolves. A forged or
// outlived-its-Max-Age hint still has to pass AppGuard, which is unchanged
// and remains authoritative — but a MISSING hint never reaches AppGuard at
// all, so keep session-provider.tsx's cookie in sync with any real session or
// this redirects a still-valid user straight to /login.
//
// Next.js route groups like (app) don't appear in the URL, so this matcher
// can't reference the group directly: add new (app) routes to the matcher
// array by hand, or they silently get no edge coverage (falling back to
// AppGuard-only protection, which is safe, just not fast).
export function middleware(request: NextRequest) {
  if (!request.cookies.has("session_hint")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
