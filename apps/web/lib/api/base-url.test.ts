import { describe, expect, it } from "vitest";

import { resolveClientApiBaseUrl } from "./base-url";

describe("client API base URL", () => {
  it("uses the current origin when a production build has no separate API origin", () => {
    expect(resolveClientApiBaseUrl(undefined, "production")).toBe("");
    expect(resolveClientApiBaseUrl("", "production")).toBe("");
  });

  it("keeps the local API fallback outside production", () => {
    expect(resolveClientApiBaseUrl(undefined, "development")).toBe(
      "http://localhost:8000",
    );
    expect(resolveClientApiBaseUrl(undefined, "test")).toBe("http://localhost:8000");
  });

  it("preserves an explicit origin and removes only its trailing slash", () => {
    expect(
      resolveClientApiBaseUrl("https://api.dhanadhara.example/", "production"),
    ).toBe("https://api.dhanadhara.example");
  });
});
