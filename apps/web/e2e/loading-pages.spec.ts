import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loadingFallbacks } from "./helpers/loading-fallbacks";

// Render real fallback components against the production page's CSS/fonts.
// This gallery checks layout independently of Next's streaming/cache timing;
// mobile-layout.spec.ts separately delays actual client requests and releases them.
test.setTimeout(120_000);
test.use({ contextOptions: { reducedMotion: "reduce" } });

let markupDirectory: string;
test.beforeAll(({ browserName }, testInfo) => {
  markupDirectory = testInfo.outputPath(`loading-markup-${browserName}`);
  execFileSync(process.execPath, [require.resolve("vitest/vitest.mjs"), "run", "components/loading-pages.test.tsx"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_LOADING_MARKUP_DIR: markupDirectory },
    windowsHide: true,
    timeout: 90_000,
  });
});

for (const { name } of loadingFallbacks) {
  test(`loading layout ${name}`, async ({ page }, testInfo) => {
    await page.goto("/");
    const shell = await page.evaluate(() => ({
      styles: [...document.querySelectorAll('link[rel="stylesheet"], style')].map((node) => node.outerHTML).join(""),
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
    }));
    const markup = readFileSync(join(markupDirectory, `${name}.html`), "utf8");
    await page.setContent(`<!doctype html><html lang="en" class="${shell.htmlClass}"><head>${shell.styles}</head><body class="${shell.bodyClass}"><main>${markup}</main></body></html>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("status").first()).toBeVisible();
    for (const width of [320, 390, 768, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      const placeholders = await page.locator('[data-slot="skeleton"]').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().width > 0).map((node) => ({ box: node.getBoundingClientRect().toJSON(), animation: getComputedStyle(node).animationName })));
      expect(placeholders.length).toBeGreaterThan(2);
      for (const { box, animation } of placeholders) {
        expect(box.height).toBeGreaterThan(0);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
        expect(animation).toBe("none");
      }
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true, animations: "disabled" });
    }
  });
}
