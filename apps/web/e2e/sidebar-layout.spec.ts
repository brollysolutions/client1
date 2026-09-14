import { expect, test, type Locator } from "@playwright/test";
import { mockMobileApi } from "./helpers/mobile-fixtures";

test.use({ contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(120_000);

const destinations = [
  { role: "admin", route: "/dashboard/analytics", label: "Analytics" },
  { role: "sub_admin", route: "/dashboard/media-library", label: "Media library" },
  { role: "client", route: "/dashboard/referrals", label: "Referrals" },
  { role: "agent", route: "/dashboard/earnings", label: "Earnings" },
  { role: "employee", route: "/dashboard/tasks", label: "Tasks" },
  { role: "telecaller", route: "/dashboard/leads", label: "Leads" },
] as const;

async function entirelyInside(inner: Locator, outer: Locator) {
  await expect(async () => {
    const item = await inner.boundingBox();
    const container = await outer.boundingBox();
    expect(item).not.toBeNull();
    expect(container).not.toBeNull();
    expect(item!.y).toBeGreaterThanOrEqual(container!.y - 1);
    expect(item!.y + item!.height).toBeLessThanOrEqual(container!.y + container!.height + 1);
    expect(item!.x + item!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
  }).toPass();
}

for (const { role, route, label } of destinations) {
  test(`${role} sidebar keeps selected and lower items reachable independently of the page`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, role);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await page.setViewportSize({ width: 1365, height: 568 });
    await page.goto(route, { waitUntil: "networkidle" });
    const sidebar = page.locator("aside").getByRole("navigation", { name: "Workspace" });
    await expect(sidebar).toBeVisible();
    if (role === "client") await page.getByRole("button", { name: "Expand sidebar" }).click();
    const selected = sidebar.getByRole("link", { name: label, exact: true });
    await expect(selected).toHaveAttribute("aria-current", "page");
    // A direct URL must reveal the selected item without moving the main page.
    await expect(selected).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    for (const width of [1365, 1024]) {
      await page.setViewportSize({ width, height: 568 });
      const scroller = sidebar.locator("[data-sidebar-scroll]");
      const logo = sidebar.getByRole("link", { name: "Dhanadhara dashboard" });
      const account = sidebar.getByRole("button", { name: "Open account menu" });
      await expect(sidebar).toHaveCSS("height", "568px");
      await expect(scroller).toHaveCSS("scrollbar-width", "thin");
      await expect(scroller).toHaveCSS("overscroll-behavior-y", "contain");
      await expect(logo).toBeInViewport({ ratio: 1 });
      await expect(account).toBeInViewport({ ratio: 1 });
      const last = scroller.getByRole("link").last();
      await last.focus();
      await entirelyInside(last, scroller);
      expect((await last.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await scroller.hover();
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await sidebar.getByRole("link", { name: "Home", exact: true }).focus();
      await entirelyInside(sidebar.getByRole("link", { name: "Home", exact: true }), scroller);
      await page.screenshot({ path: testInfo.outputPath(`sidebar-${width}.png`), animations: "disabled" });
    }

    for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 600 }]) {
      await page.setViewportSize({ width, height });
      const trigger = page.getByRole("button", { name: "Open menu", exact: true });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Workspace" });
      const navigation = drawer.getByRole("navigation", { name: "Workspace" });
      await expect(navigation).toHaveCSS("height", `${height}px`);
      await expect(navigation.getByRole("link", { name: label, exact: true })).toBeInViewport({ ratio: 1 });
      const logo = navigation.getByRole("link", { name: "Dhanadhara dashboard" });
      const close = drawer.getByRole("button", { name: "Close", exact: true });
      expect((await logo.boundingBox())!.x + (await logo.boundingBox())!.width).toBeLessThanOrEqual((await close.boundingBox())!.x);
      const links = navigation.locator("[data-sidebar-scroll]");
      await links.getByRole("link").last().focus();
      await entirelyInside(links.getByRole("link").last(), links);
      await expect(navigation.getByRole("button", { name: "Open account menu" })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`drawer-${width}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}
