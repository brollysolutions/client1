import { describe, expect, it } from "vitest";

import { isSafeLocalHref } from "@/lib/safe-local-href";

describe("isSafeLocalHref", () => {
  it("accepts same-origin application paths", () => {
    expect(isSafeLocalHref("/dashboard/notifications?filter=unread#list")).toBe(true);
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%2f%2fattacker.example",
    "/%5cattacker.example",
    "javascript:alert(1)",
  ])("rejects unsafe destinations: %s", (href) => {
    expect(isSafeLocalHref(href)).toBe(false);
  });
});
