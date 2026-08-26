import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RE_CATEGORIES } from "./real-estate";

// Locks the data contract the dashboard Home card grid
// (features/real-estate/real-estate-home.tsx) and Explore/category rows are
// built on. Mirrors features/dashboard/explore-categories.test.ts's
// illustration-exists guard.

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(WEB_ROOT, "public");

describe("RE_CATEGORIES", () => {
  it("has unique category keys", () => {
    const keys = RE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("points every illustration at a file that exists on disk", () => {
    for (const category of RE_CATEGORIES) {
      const relative = category.illustration.replace(/^\//, "");
      const path = join(PUBLIC_DIR, relative);
      expect(existsSync(path), `missing illustration: ${category.illustration}`).toBe(true);
    }
  });
});
