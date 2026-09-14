import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

function tokenHex(name: string, seen = new Set<string>(), dark = false): string {
  if (seen.has(name)) throw new Error(`Circular color alias: ${name}`);
  seen.add(name);
  const pattern = new RegExp(`${name}:\\s*([^;]+)`);
  const darkTokens = css.match(/:root\.dark\s*\{([^}]+)\}/)?.[1] ?? "";
  const match = (dark ? darkTokens.match(pattern) : null) ?? css.match(pattern);
  if (!match) throw new Error(`Missing color token: ${name}`);
  const value = match[1].trim();
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) return tokenHex(alias[1], seen, dark);
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Unsupported color token: ${name}`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4),
    );
  if (!channels) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("shared normal-text color contrast", () => {
  it.each([false, true])("keeps announcement copy and chart segments distinct (dark=%s)", (dark) => {
    const color = (name: string) => tokenHex(name, new Set(), dark);
    expect(contrastRatio(color("--color-notice-foreground"), color("--color-notice"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color("--color-brand-link"), color("--color-chart-interest"))).toBeGreaterThanOrEqual(3);
  });

  it("keeps dark reading surfaces, actions and focus legible", () => {
    const color = (name: string) => tokenHex(name, new Set(), true);
    for (const surface of ["--background", "--card", "--popover", "--muted"]) {
      for (const text of ["--foreground", "--muted-foreground", "--color-brand-heading", "--color-brand-link", "--color-success", "--color-warning", "--color-error", "--color-info"]) {
        expect(contrastRatio(color(text), color(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const control of ["--input", "--ring"]) {
        expect(contrastRatio(color(control), color(surface)), `${control} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const action of ["primary", "destructive"]) {
      expect(contrastRatio(color(`--${action}`), color(`--${action}-foreground`))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses one pale sky surface and one navy action across all page families", () => {
    for (const name of ["--background", "--nav-bg", "--nav-tint", "--color-brand-cta-tint", "--color-surface-silver", "--color-loans-soft", "--color-realestate-soft", "--secondary", "--muted"]) {
      expect(tokenHex(name), name).toBe(tokenHex("--color-surface-sky"));
    }
    for (const name of ["--primary", "--nav-primary", "--color-brand-cta", "--color-cta", "--color-brand-blue", "--color-loans-accent", "--color-realestate-accent", "--color-dash-rail"]) {
      expect(tokenHex(name), name).toBe(tokenHex("--color-brand-navy"));
    }
  });

  it.each([
    "--color-brand-blue",
    "--color-brand-cta",
    "--color-cta",
    "--color-success",
    "--color-warning",
    "--color-error",
    "--color-info",
    "--color-loans-accent",
    "--color-realestate-accent",
    "--nav-primary",
  ])("keeps %s at WCAG AA on white and sky", (token) => {
    const foreground = tokenHex(token);
    expect(contrastRatio(foreground, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, tokenHex("--background"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--color-dash-foreground", "--color-dash-muted", "--color-brand-sky"])("keeps %s legible on navy navigation", (token) => {
    expect(contrastRatio(tokenHex(token), tokenHex("--color-dash-rail"))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokenHex(token), tokenHex("--color-dash-rail-hover"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps editing boundaries and focus distinct on white", () => {
    for (const token of ["--input", "--ring"]) {
      expect(contrastRatio(tokenHex(token), tokenHex("--card"))).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps inactive tab labels legible on the muted sky surface", () => {
    expect(contrastRatio(tokenHex("--color-text-secondary"), tokenHex("--muted"))).toBeGreaterThanOrEqual(4.5);
  });
});
