import * as React from "react";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadingFallbacks } from "@/e2e/helpers/loading-fallbacks";

// Next supplies the automatic JSX runtime; Vitest's existing config uses classic JSX.
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("page loading coverage", () => {
  it("covers every page through a tested nearest route fallback", () => {
    const covered = new Set(loadingFallbacks.flatMap((entry) => entry.path ? [entry.path] : []));
    const pages = readdirSync("app", { recursive: true }).map(String).filter((file) => file.replaceAll("\\", "/").endsWith("/page.tsx"));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      let directory = dirname(page);
      while (directory !== "." && !existsSync(join("app", directory, "loading.tsx"))) directory = dirname(directory);
      expect(covered.has(join(directory, "loading.tsx").replaceAll("\\", "/")), page).toBe(true);
    }
  });

  it.each(loadingFallbacks)("$name announces loading and renders inert placeholders", ({ name, element }) => {
    const markup = renderToStaticMarkup(element);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/data-slot="skeleton"/g)?.length).toBeGreaterThan(2);
    expect(markup).not.toMatch(/<(input|select|textarea|button)\b/);
    // The browser gallery requests the same React-rendered markup. Playwright's
    // JSX transform targets its component protocol rather than React SSR.
    const galleryDirectory = process.env.PLAYWRIGHT_LOADING_MARKUP_DIR;
    if (galleryDirectory) {
      mkdirSync(galleryDirectory, { recursive: true });
      writeFileSync(join(galleryDirectory, `${name}.html`), markup);
    }
  });
});
