/**
 * Client bundles must not carry secrets, and client components must not read
 * server-only env vars.
 *
 * apps/web/AGENTS.md: "Avoid exposing secrets through NEXT_PUBLIC_*, logs,
 * rendered errors, browser storage, or analytics." That rule is currently held
 * up by review attention alone. Next.js inlines every NEXT_PUBLIC_* value into
 * the JavaScript it ships to the browser, so a single mis-prefixed variable
 * publishes a credential to every visitor with no build error and no runtime
 * warning — and for a repo handling KYC documents and payouts, that is a
 * disclosure rather than a bug.
 *
 * Two directions are checked:
 *  1. No NEXT_PUBLIC_* name looks secret-bearing (the leak).
 *  2. No `"use client"` module reads a non-public env var (the silent
 *     `undefined` — and the leak it would become if someone "fixed" it by
 *     adding the NEXT_PUBLIC_ prefix instead of moving the code server-side).
 */

import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Source roots that end up in a build. */
const SCAN_DIRS = ["app", "components", "features", "hooks", "lib"];
const SCAN_FILES = ["middleware.ts", "next.config.ts"];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "test-results", "e2e", "__snapshots__"]);

/** Names that read as credential-bearing regardless of intent. */
const SECRET_NAME_PATTERN =
  /(SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|_TOKEN|TOKEN_|APIKEY|API_KEY|ACCESS_KEY|SALT|DSN|WEBHOOK_URL)/;

/**
 * NEXT_PUBLIC_* names that match the pattern above but are public by
 * construction. Each entry is a claim that the value is safe in a browser.
 */
const PUBLIC_BY_DESIGN = new Set<string>([
  // e.g. "NEXT_PUBLIC_VAPID_PUBLIC_KEY" — a public key is meant to ship.
]);

/** Non-public env vars that are legitimately readable in a client bundle. */
const CLIENT_SAFE_ENV = new Set(["NODE_ENV"]);

/** Vacuous-pass guards. */
const MIN_EXPECTED_FILES = 100;

function collectSourceFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, results);
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

const files: string[] = [
  ...SCAN_DIRS.flatMap((dir) => collectSourceFiles(join(WEB_ROOT, dir))),
  ...SCAN_FILES.map((file) => join(WEB_ROOT, file)),
];

const sources = files.map((file) => ({
  path: relative(WEB_ROOT, file).replace(/\\/g, "/"),
  text: readFileSync(file, "utf8"),
}));

/** A module is client-side if its first non-empty statement is "use client". */
function isClientModule(text: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);
}

describe("client env exposure", () => {
  it("scans a realistic amount of source", () => {
    expect(sources.length).toBeGreaterThanOrEqual(MIN_EXPECTED_FILES);
  });

  it("exposes no secret-looking NEXT_PUBLIC_* variable", () => {
    const offenders = new Map<string, string[]>();
    for (const { path, text } of sources) {
      for (const match of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        const name = match[0];
        if (!SECRET_NAME_PATTERN.test(name) || PUBLIC_BY_DESIGN.has(name)) continue;
        offenders.set(name, [...(offenders.get(name) ?? []), path]);
      }
    }
    const report = [...offenders.entries()]
      .map(([name, paths]) => `${name} (${[...new Set(paths)].join(", ")})`)
      .sort();

    expect(
      report,
      "Next.js inlines NEXT_PUBLIC_* values into the browser bundle. These names " +
        "read as secret-bearing:\n  " +
        `${report.join("\n  ")}\n\nMove the value server-side, or add it to ` +
        "PUBLIC_BY_DESIGN if it is genuinely public (e.g. a public key).",
    ).toEqual([]);
  });

  it("keeps server-only env vars out of client components", () => {
    const offenders: string[] = [];
    for (const { path, text } of sources) {
      if (!isClientModule(text)) continue;
      for (const match of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1];
        if (name.startsWith("NEXT_PUBLIC_") || CLIENT_SAFE_ENV.has(name)) continue;
        offenders.push(`${path}: process.env.${name}`);
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      'These "use client" modules read env vars that Next.js does not expose to ' +
        "the browser, so the value is undefined at runtime:\n  " +
        `${offenders.join("\n  ")}\n\nRead it in a server component or route handler ` +
        "and pass the result down — do not add a NEXT_PUBLIC_ prefix to a secret.",
    ).toEqual([]);
  });
});
