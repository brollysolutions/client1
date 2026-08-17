/**
 * Every authenticated page must be covered by the middleware matcher.
 *
 * middleware.ts documents this exact hazard in its own comment: Next.js route
 * groups like `(app)` never appear in the URL, so the matcher cannot reference
 * the group and every new authenticated route has to be added to the array by
 * hand. Miss one and the page silently loses its edge redirect — no build
 * error, no runtime warning. It still falls back to AppGuard's client-side
 * check, so the failure is a slower and leakier auth bounce rather than an open
 * door, but it is invisible until someone notices the flash of app shell.
 *
 * This test enumerates the filesystem routes instead of trusting memory.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_DIR = join(WEB_ROOT, "app");

/** Route group that requires an authenticated session. */
const PROTECTED_GROUP = "(app)";

/**
 * Vacuous-pass guard. If the walk stops finding pages (an App Router layout
 * change, a moved directory), every assertion below trivially holds.
 */
const MIN_EXPECTED_PAGES = 40;

/** Collect every page.tsx under `dir`, returned as paths relative to app/. */
function collectPages(dir: string, relative = ""): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `_private` folders and `@slot` parallel routes are not addressable URLs.
    if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      pages.push(...collectPages(join(dir, entry.name), nextRelative));
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      pages.push(nextRelative);
    }
  }
  return pages;
}

/**
 * Turn an App Router file path into a concrete URL path.
 * Route groups drop out; dynamic segments get a sample value so the result can
 * be tested against the matcher as a real request path would be.
 */
function toUrlPath(relativeFile: string): string {
  const segments = relativeFile
    .split("/")
    .slice(0, -1) // drop page.tsx
    .filter((segment) => !/^\(.+\)$/.test(segment)) // route groups are not in the URL
    .flatMap((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return ["sample"]; // optional catch-all
      if (/^\[\.\.\..+\]$/.test(segment)) return ["sample", "nested"]; // catch-all
      if (/^\[.+\]$/.test(segment)) return ["sample"]; // dynamic segment
      return [segment];
    });
  return `/${segments.join("/")}`;
}

/**
 * Compile the Next.js matcher subset this project uses.
 *
 * Supported: literal segments and `:param`, `:param?`, `:param+`, `:param*`.
 * Anything richer (inline regex groups, `has` conditions, brace syntax) is
 * REJECTED rather than approximated — a matcher this function silently
 * mis-evaluates would turn the whole suite into false assurance.
 */
function compileMatcher(pattern: string): RegExp {
  if (/[(){}\\]/.test(pattern)) {
    throw new Error(
      `Unsupported middleware matcher syntax: ${pattern}. Extend compileMatcher() ` +
        `to handle it — do not loosen this check.`,
    );
  }
  const body = pattern
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const match = /^:([A-Za-z0-9_]+)([*+?])?$/.exec(segment);
      if (!match) return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
      const modifier = match[2];
      if (modifier === "*") return "(?:/[^/]+)*";
      if (modifier === "+") return "(?:/[^/]+)+";
      if (modifier === "?") return "(?:/[^/]+)?";
      return "/[^/]+";
    })
    .join("");
  return new RegExp(`^${body || "/"}$`);
}

const matchers: string[] = Array.isArray(config.matcher)
  ? (config.matcher as string[])
  : [config.matcher as string];

const protectedPages = collectPages(join(APP_DIR, PROTECTED_GROUP)).map(
  (relative) => `${PROTECTED_GROUP}/${relative}`,
);

describe("middleware matcher coverage", () => {
  it("finds the protected page tree", () => {
    expect(protectedPages.length).toBeGreaterThanOrEqual(MIN_EXPECTED_PAGES);
  });

  it("only uses matcher syntax this test can evaluate", () => {
    for (const pattern of matchers) {
      expect(() => compileMatcher(pattern)).not.toThrow();
    }
  });

  it("covers every page in the protected route group", () => {
    const compiled = matchers.map(compileMatcher);
    const uncovered = protectedPages
      .map(toUrlPath)
      .filter((urlPath) => !compiled.some((regex) => regex.test(urlPath)))
      .sort();

    expect(
      uncovered,
      `These ${PROTECTED_GROUP} pages are not covered by any middleware matcher, so ` +
        `they get no edge auth redirect and fall back to client-side AppGuard only:\n  ` +
        `${uncovered.join("\n  ")}\n\nAdd the path to config.matcher in middleware.ts.`,
    ).toEqual([]);
  });
});
