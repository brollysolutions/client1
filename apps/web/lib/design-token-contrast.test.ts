import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing six-digit color token: ${name}`);
  return match[1];
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
  ])("keeps %s at WCAG AA on white and cream", (token) => {
    const foreground = tokenHex(token);
    expect(contrastRatio(foreground, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, "#f3f3ee")).toBeGreaterThanOrEqual(4.5);
  });
});
