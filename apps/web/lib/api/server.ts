// Server-only fetch wrapper for the FastAPI backend, for Server Components
// that need ISR-cached data (public catalog pages, etc). NOT a server-side
// twin of lib/api/client.ts's full feature set: no cookie jar exists in Node,
// so there is nothing for `credentials: "include"` to carry, and no retry —
// this is for anonymous GETs only.
//
// apiRequest (lib/api/client.ts) cannot be reused here: its BASE_URL comes
// from NEXT_PUBLIC_API_BASE_URL, which resolves to the WEB container's own
// "localhost" in dev and is empty (same-origin-behind-nginx) in prod — a
// relative URL that Node's fetch throws on immediately. This module reads a
// separate, non-NEXT_PUBLIC_, runtime-only env var instead (see
// docker-compose.yml's comment on API_INTERNAL_URL for why the split exists).

import type { ApiResponse } from "@/lib/api/client";

if (typeof window !== "undefined") {
  // A NEXT_PUBLIC_-less var is `undefined` in the browser, so without this
  // guard a stray client-side import would silently fall through to the
  // "http://api:8000" default and fail confusingly instead of loudly.
  throw new Error("lib/api/server.ts is server-only and must not be imported by client code.");
}

const SERVER_BASE_URL = (process.env.API_INTERNAL_URL ?? "http://api:8000").replace(/\/$/, "");

const REQUEST_TIMEOUT_MS = 5_000;

const NETWORK_ERROR = "Can't reach the server. Check your connection and try again.";

function errorMessage(status: number): string {
  if (status >= 500 || status === 0) {
    return "Something went wrong on our end. Please try again in a moment.";
  }
  return "Something didn't work. Please try again.";
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  return String(error);
}

export async function serverFetchJson<TResponse>(
  path: string,
  {
    revalidate,
    expectedStatuses = [],
  }: {
    revalidate: number;
    expectedStatuses?: readonly number[];
  },
): Promise<ApiResponse<TResponse>> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal:
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
          : undefined,
      next: { revalidate },
    });
  } catch (error) {
    // Includes prod-image-build-time failures (API_INTERNAL_URL unresolved
    // inside the builder) and a stopped/unreachable API at runtime. Callers
    // must treat this the same as an empty result, never let it throw.
    // Node's TimeoutError is a DOMException. Passing it to Next's logger as a
    // raw object also prints every inherited legacy DOM error constant, burying
    // the useful name/message in a large, misleading dump.
    console.error("serverFetchJson.network_error", path, errorDetail(error));
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  if (!res.ok) {
    if (!expectedStatuses.includes(res.status)) {
      console.error("serverFetchJson.http_error", path, res.status);
    }
    return { ok: false, status: res.status, error: errorMessage(res.status) };
  }

  try {
    const data = (await res.json()) as TResponse;
    return { ok: true, status: res.status, data };
  } catch (error) {
    console.error("serverFetchJson.parse_error", path, error);
    return { ok: false, status: res.status, error: errorMessage(res.status) };
  }
}
