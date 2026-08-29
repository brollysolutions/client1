export type SecurityHeader = { key: string; value: string };

type SecurityHeaderOptions = {
  production: boolean;
  strictPublicConfig?: boolean;
  apiBaseUrl?: string;
  assetHost?: string;
};

function trustedOrigin(
  label: string,
  value: string | undefined,
  production: boolean,
  strictPublicConfig: boolean,
): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be a valid absolute HTTP URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must be a valid absolute HTTP URL.`);
  }

  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (production && parsed.protocol !== "https:" && (strictPublicConfig || !loopback)) {
    throw new Error(`${label} must use HTTPS outside local development.`);
  }
  return parsed.origin;
}

export function buildSecurityHeaders({
  production,
  strictPublicConfig = false,
  apiBaseUrl,
  assetHost,
}: SecurityHeaderOptions): SecurityHeader[] {
  const apiOrigin = trustedOrigin(
    "NEXT_PUBLIC_API_BASE_URL",
    apiBaseUrl,
    production,
    strictPublicConfig,
  );
  const assetOrigin = trustedOrigin(
    "NEXT_PUBLIC_ASSET_HOST",
    assetHost,
    production,
    strictPublicConfig,
  );
  const connectSources = ["'self'", apiOrigin, ...(production ? [] : ["ws:", "wss:"])].filter(
    (source): source is string => Boolean(source),
  );
  const imageSources = ["'self'", "data:", "blob:", assetOrigin].filter(
    (source): source is string => Boolean(source),
  );
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(production ? [] : ["'unsafe-eval'"]),
  ];

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    ...(production ? ["upgrade-insecure-requests"] : []),
  ];

  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: directives.join("; ") },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Origin-Agent-Cluster", value: "?1" },
  ];

  if (production) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  }
  return headers;
}
