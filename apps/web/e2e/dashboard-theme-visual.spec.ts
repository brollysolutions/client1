import { expect, test } from "@playwright/test";
import { mockMobileApi } from "./helpers/mobile-fixtures";
import { expectVisibleImagesLoaded } from "./helpers/visible-images";
import type { UserRole } from "@/lib/auth";

test.use({ colorScheme: "dark", contextOptions: { reducedMotion: "reduce" } });
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });
test.setTimeout(120_000);

const families: { name: string; route: string; role?: UserRole }[] = [
  { name: "home", route: "/" },
  { name: "services", route: "/loans" },
  { name: "service-detail", route: "/loans/personal-loan" },
  { name: "properties", route: "/real-estate" },
  { name: "calculator", route: "/calculators/emi" },
  { name: "partners", route: "/earn-with-us" },
  { name: "contact", route: "/contact" },
  { name: "legal", route: "/privacy" },
  { name: "get-started", route: "/get-started" },
  { name: "help-center", route: "/help-center" },
  { name: "login", route: "/login" },
  { name: "register", route: "/register" },
  ...(["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as const)
    .map((role) => ({ name: role, route: "/dashboard", role })),
];

for (const family of families) {
  test(`dark appearance: ${family.name}`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, family.role);
    if (family.role) await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(family.route, { waitUntil: "domcontentloaded" });
    const main = page.locator(family.role ? "#dashboard-main-content" : "main");
    await expect(main).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toBeAttached();
    // Readiness belongs to the rendered page. Background route prefetches need
    // not become idle before a user can read or interact with the workspace.
    await expect(main.locator('[data-slot="skeleton"]:visible').first()).not.toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.evaluate(() => document.fonts.ready);
    for (const width of [390, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      await expectVisibleImagesLoaded(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`${family.name}-${width}.png`), animations: "disabled" });
    }
    expect(errors).toEqual([]);
  });
}
