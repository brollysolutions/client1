import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "@/lib/security-headers";
import nextConfig from "@/next.config";

function asRecord(headers: ReturnType<typeof buildSecurityHeaders>) {
  return Object.fromEntries(headers.map(({ key, value }) => [key, value]));
}

describe("browser security headers", () => {
  it("applies the baseline to every web route", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");

    expect(globalRule?.headers.some((header) => header.key === "Content-Security-Policy")).toBe(
      true,
    );
  });

  it("enforces the shared browser hardening baseline", () => {
    const headers = asRecord(buildSecurityHeaders({ production: false }));

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("adds transport enforcement only to the production policy", () => {
    const development = asRecord(buildSecurityHeaders({ production: false }));
    const production = asRecord(buildSecurityHeaders({ production: true }));

    expect(development["Strict-Transport-Security"]).toBeUndefined();
    expect(development["Content-Security-Policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(production["Strict-Transport-Security"]).toBe(
      "max-age=31536000",
    );
    expect(production["Content-Security-Policy"]).toContain(
      "upgrade-insecure-requests",
    );
  });

  it("allowlists only validated API and public-asset origins", () => {
    const headers = asRecord(
      buildSecurityHeaders({
        production: true,
        apiBaseUrl: "https://api.dhanadhara.example/api/v1",
        assetHost: "https://assets.dhanadhara.example/public",
      }),
    );

    expect(headers["Content-Security-Policy"]).toContain(
      "connect-src 'self' https://api.dhanadhara.example",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "img-src 'self' data: blob: https://assets.dhanadhara.example",
    );
    expect(() =>
      buildSecurityHeaders({ production: true, apiBaseUrl: "javascript:alert(1)" }),
    ).toThrow(/HTTP/);
    expect(() =>
      buildSecurityHeaders({
        production: true,
        strictPublicConfig: true,
        apiBaseUrl: "http://localhost:8000",
      }),
    ).toThrow(/HTTPS/);
  });
});
