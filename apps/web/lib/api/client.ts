// Thin typed HTTP wrapper over the FastAPI backend.
//
// It speaks the raw wire shapes (snake_case) generated from the OpenAPI spec in
// packages/contracts — callers pass a request body already shaped like the
// generated request schema and read back the generated response schema. The
// camelCase <-> snake_case mapping to the app's own types lives in lib/auth.ts,
// kept explicit and typed rather than a lossy generic converter.
//
// Framework-free on purpose: the access token is read through a getter the auth
// provider registers, so this module never imports React.

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// The auth provider registers a getter here so requests can attach the in-memory
// access token without this module knowing about React or where the token lives.
let readAccessToken: () => string | null = () => null;
let readBusinessLine: () => "loans" | "real_estate" | null = () => null;

export function registerTokenGetter(getter: () => string | null): void {
  readAccessToken = getter;
}

export function registerBusinessLineGetter(
  getter: () => "loans" | "real_estate" | null,
): void {
  readBusinessLine = getter;
}

// The auth provider also registers a refresher: on a 401 the wrapper calls it
// once to rotate the access token (via the httponly refresh cookie) and retries
// the original request. Returns the new token, or null if the session is dead.
let refreshSession: () => Promise<string | null> = async () => null;

export function registerTokenRefresher(fn: () => Promise<string | null>): void {
  refreshSession = fn;
}

// Single-flight: many calls 401-ing at once share one refresh round-trip.
let inflightRefresh: Promise<string | null> | null = null;
function refreshOnce(): Promise<string | null> {
  if (!inflightRefresh) {
    inflightRefresh = refreshSession().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

// Endpoints that must never trigger the auto-refresh retry (they ARE the auth
// handshake — retrying would recurse or mislead).
const NO_AUTO_REFRESH = ["/api/v1/auth/refresh", "/api/v1/auth/login"];

// DELETE /me's 401 is always a wrong-password rejection, never an expired
// token (unlike GET/PATCH /me, which legitimately benefit from the retry) —
// excluded by method + path, not by path alone, so those keep auto-refreshing.
function isNoRetryRequest(method: string, path: string): boolean {
  if (NO_AUTO_REFRESH.some((p) => path.startsWith(p))) return true;
  return method === "DELETE" && path === "/api/v1/auth/me";
}

export type ApiResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number; issues?: ApiValidationIssue[] };

export type ApiValidationIssue = {
  field: string;
  message: string;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // Already wire-shaped (snake_case) matching the generated request schema.
  body?: unknown;
  // Explicit Bearer token, used when a call must authenticate with a token that
  // is deliberately NOT in the app session yet (e.g. the forced-reset access
  // token, which must not log the user in until the reset completes).
  bearer?: string;
};

// FastAPI HTTPException -> { detail: "message" }; 422 -> { detail: [{ msg, ... }] }.
// The auth service's own messages are written to be user-safe and enumeration-safe,
// so we surface them as-is; server faults get a generic line (never leak internals).
function errorMessage(payload: unknown, status: number): string {
  if (status >= 500 || status === 0) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  const detail = (payload as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first.msg === "string" && first.msg.trim()) {
      return first.msg.replace(/^Value error, /, "");
    }
  }
  return "Something didn't work. Please try again.";
}

function validationIssues(payload: unknown, status: number): ApiValidationIssue[] {
  if (status !== 422) return [];
  const detail = (payload as { detail?: unknown } | undefined)?.detail;
  if (!Array.isArray(detail)) return [];

  const issues: ApiValidationIssue[] = [];
  for (const item of detail.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const { loc, msg } = item as { loc?: unknown; msg?: unknown };
    if (!Array.isArray(loc) || typeof msg !== "string" || !msg.trim()) continue;
    const segments = loc
      .filter((segment): segment is string | number =>
        typeof segment === "number" ||
        (typeof segment === "string" && /^[A-Za-z0-9_-]+$/.test(segment)),
      )
      .filter((segment, index) =>
        !(index === 0 && ["body", "query", "path", "header"].includes(String(segment))),
      );
    if (segments.length === 0) continue;
    const field = segments.join(".").slice(0, 240);
    const message = msg.trim().replace(/^Value error, /, "").slice(0, 500);
    issues.push({ field, message });
  }
  return issues;
}

function safeParse(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const NETWORK_ERROR = "Can't reach the server. Check your connection and try again.";

// Every request is time-bounded. This matters most for /auth/refresh: it runs
// inside a cross-tab Web Lock (lib/auth.withRefreshLock), so a stalled refresh
// would otherwise hold the exclusive lock and freeze auth recovery in every tab
// until the browser's own (minutes-long) network timeout. A bounded fetch means
// the lock is always released promptly.
const REQUEST_TIMEOUT_MS = 15_000;

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

export async function apiRequest<TResponse = undefined>(
  path: string,
  { method = "GET", body, bearer }: RequestOptions = {},
): Promise<ApiResponse<TResponse>> {
  // Send one attempt with the given token. Returns the Response, or null on a
  // network failure. `credentials: "include"` carries the httponly refresh
  // cookie across the localhost:3000 -> :8000 origin boundary (CORS allows it).
  const attempt = async (token: string | null): Promise<Response | null> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const businessLine = readBusinessLine();
    if (businessLine) headers["X-Business-Line"] = businessLine;
    try {
      return await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        credentials: "include",
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: timeoutSignal(),
      });
    } catch {
      // Includes the AbortError thrown when REQUEST_TIMEOUT_MS elapses — treated
      // as a network failure so the caller (and the refresh lock) unblocks.
      return null;
    }
  };

  let res = await attempt(bearer ?? readAccessToken());
  if (res === null) return { ok: false, status: 0, error: NETWORK_ERROR };

  // Expired access token mid-session: silently rotate once and retry. Skipped
  // when the caller owns its token (explicit `bearer`, e.g. forced-reset) or the
  // call itself is the refresh/login handshake.
  if (res.status === 401 && bearer === undefined && !isNoRetryRequest(method, path)) {
    const newToken = await refreshOnce();
    if (newToken) {
      const retry = await attempt(newToken);
      if (retry === null) return { ok: false, status: 0, error: NETWORK_ERROR };
      res = retry;
    }
  }

  const payload = safeParse(await res.text());
  if (!res.ok) {
    const issues = validationIssues(payload, res.status);
    return {
      ok: false,
      status: res.status,
      error: errorMessage(payload, res.status),
      ...(issues.length > 0 ? { issues } : {}),
    };
  }
  return { ok: true, status: res.status, data: payload as TResponse };
}

// Blob-returning sibling of apiRequest, for the handful of endpoints that
// stream a file (CSV exports) instead of JSON. Reuses the same auth header +
// single-flight 401-refresh-and-retry logic rather than a one-off fetch in
// feature code, then triggers the download via the same
// createObjectURL + synthetic <a download> + revokeObjectURL pattern as
// components/calculators/export-share-bar.tsx.
export type ApiDownloadResponse =
  | { ok: true; truncated: boolean }
  | { ok: false; error: string; status: number };

export async function apiDownload(
  path: string,
  filename: string,
): Promise<ApiDownloadResponse> {
  const attempt = async (token: string | null): Promise<Response | null> => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const businessLine = readBusinessLine();
    if (businessLine) headers["X-Business-Line"] = businessLine;
    try {
      return await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers,
        credentials: "include",
        signal: timeoutSignal(),
      });
    } catch {
      return null;
    }
  };

  let res = await attempt(readAccessToken());
  if (res === null) return { ok: false, status: 0, error: NETWORK_ERROR };

  if (res.status === 401) {
    const newToken = await refreshOnce();
    if (newToken) {
      const retry = await attempt(newToken);
      if (retry === null) return { ok: false, status: 0, error: NETWORK_ERROR };
      res = retry;
    }
  }

  if (!res.ok) {
    const payload = safeParse(await res.text());
    return { ok: false, status: res.status, error: errorMessage(payload, res.status) };
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { ok: true, truncated: res.headers.get("X-Report-Truncated") === "true" };
}
