import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/components/footer-links";

describe("FOOTER_COLUMNS integrity", () => {
  it("links directly to existing public pages, without repeated destinations", () => {
    const destinations: string[] = [];
    for (const col of FOOTER_COLUMNS) {
      for (const link of col.links) {
        expect(link.label).toBeTruthy();
        expect(link.href).toMatch(/^\/[a-z-]+$/);
        expect(existsSync(join(process.cwd(), "app", "(public)", link.href.slice(1), "page.tsx")), link.href).toBe(true);
        destinations.push(link.href);
      }
    }
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(destinations).toEqual(expect.arrayContaining(["/loans", "/real-estate", "/calculators", "/get-started", "/help-center", "/contact"]));
  });
});

describe("LEGAL_LINKS integrity", () => {
  it("keeps every public legal notice discoverable from the shared footer", () => {
    expect(LEGAL_LINKS).toEqual([
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Cookies", href: "/cookies" },
      { label: "Sitemap", href: "/sitemap.xml" },
    ]);
  });
});
