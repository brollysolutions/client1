import { expect, test } from "@playwright/test";
import { mockMobileApi } from "./helpers/mobile-fixtures";

test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const role of ["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as const) {
  test(`${role} sidebar logo, toggle and scrollbars stay aligned`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, role);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await page.setViewportSize({ width: 1365, height: 844 });
    await page.goto("/dashboard");
    const sidebar = page.locator("aside").getByRole("navigation", { name: "Workspace" });
    const logo = sidebar.getByRole("link", { name: "Dhanadhara dashboard" });
    await expect(logo).toBeVisible();
    if (role === "client") {
      const collapsed = await logo.boundingBox();
      const expand = sidebar.getByRole("button", { name: "Expand sidebar" });
      expect((await expand.boundingBox())!.y).toBeGreaterThan(collapsed!.y + collapsed!.height);
      await expand.click();
      const collapse = sidebar.getByRole("button", { name: "Collapse sidebar" });
      await expect(collapse).toBeVisible();
      await expect(logo.locator("img")).toHaveAttribute("src", /logo-horizontal\.png/);
      const expandedLogo = await logo.boundingBox();
      const toggle = await collapse.boundingBox();
      expect(toggle!.x).toBeGreaterThanOrEqual(expandedLogo!.x + expandedLogo!.width);
      expect(Math.abs(toggle!.y + toggle!.height / 2 - expandedLogo!.y - expandedLogo!.height / 2)).toBeLessThan(2);
      await page.screenshot({ path: testInfo.outputPath("client-expanded.png"), animations: "disabled" });
      await collapse.focus();
      await page.keyboard.press("Enter");
      await expect(expand).toBeFocused();
      expect((await logo.boundingBox())!.width).toBe(collapsed!.width);
    } else {
      await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(logo.locator("img")).toHaveCSS("filter", "brightness(0) invert(1)");
      await expect(logo).toHaveCSS("width", "192px");
      await expect(logo.locator("img")).toHaveAttribute("src", /logo-horizontal\.png/);
      await expect(sidebar.getByRole("button", { name: /sidebar/ })).toHaveCount(0);
    }
    const scroller = sidebar.locator("[data-sidebar-scroll]");
    await expect(scroller).toHaveCSS("scrollbar-width", "thin");
    await expect(scroller).toHaveCSS("scrollbar-color", "rgb(149, 204, 221) rgba(0, 0, 0, 0)");
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 568 });
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      const drawer = page.getByRole("dialog");
      const mobileLogo = drawer.getByRole("link", { name: "Dhanadhara dashboard" });
      // Opening the drawer can place its logo under the menu-button pointer.
      // Check its resting treatment separately from the intended hover feedback.
      await page.mouse.move(width - 2, 566);
      await expect(mobileLogo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(mobileLogo.locator("img")).toHaveCSS("filter", "brightness(0) invert(1)");
      await mobileLogo.hover();
      await expect(mobileLogo).toHaveCSS("background-color", "rgb(55, 72, 147)");
      await expect(mobileLogo.locator("img")).toHaveCSS("filter", "brightness(0) invert(1)");
      await page.mouse.move(width - 2, 566);
      await page.screenshot({ path: testInfo.outputPath(`${role}-${width}.png`), animations: "disabled" });
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator("html")).toHaveCSS("scrollbar-width", "auto");
    await expect(page.locator("html")).toHaveCSS("scrollbar-color", "auto");
  });
}

test("native scrollbars stay thin in pages, form dialogs and horizontal tables", async ({ page, baseURL }) => {
  await page.goto("/loans");
  await expect(page.locator("html")).toHaveCSS("scrollbar-width", "thin");
  await mockMobileApi(page, "admin");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.goto("/dashboard/loan-config");
  await expect(page.locator("#dashboard-main-content")).toBeVisible();
  await expect(page.locator(".overflow-x-auto").first()).toHaveCSS("scrollbar-width", "thin");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("scrollbar-width", "thin");
  await expect(dialog).toHaveCSS("scrollbar-color", "rgb(127, 137, 156) rgba(0, 0, 0, 0)");
});
