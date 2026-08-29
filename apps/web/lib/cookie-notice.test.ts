import { describe, expect, it } from "vitest";

import {
  BROWSER_STORAGE,
  ESSENTIAL_COOKIES,
  NON_ESSENTIAL_COOKIES_ENABLED,
} from "@/lib/cookie-notice";

describe("cookie notice inventory", () => {
  it("documents the two essential session cookies used by the application", () => {
    expect(ESSENTIAL_COOKIES.map((cookie) => cookie.name)).toEqual([
      "refresh_token",
      "session_hint",
    ]);
    expect(ESSENTIAL_COOKIES.every((cookie) => cookie.category === "Essential")).toBe(
      true,
    );
  });

  it("does not claim non-essential tracking or show a consent choice before it exists", () => {
    expect(NON_ESSENTIAL_COOKIES_ENABLED).toBe(false);
  });

  it("also discloses browser storage separately from cookies", () => {
    expect(BROWSER_STORAGE.map((entry) => entry.mechanism)).toEqual([
      "Local storage",
      "Session storage",
    ]);
  });
});
