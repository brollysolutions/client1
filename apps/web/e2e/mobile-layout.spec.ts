import { readdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CALCULATORS } from "@/lib/calculators/registry";
import { isDashboardPathAllowed } from "@/features/dashboard/nav-items";
import { RESET_MOBILE_KEY, type UserRole } from "@/lib/auth";
import { FIXTURE_ID, mockMobileApi } from "./helpers/mobile-fixtures";

test.setTimeout(180_000);
test.use({ contextOptions: { reducedMotion: "reduce" } });

const roles: UserRole[] = ["client", "admin", "sub_admin", "agent", "employee", "telecaller"];
const dynamicRoutes: Record<string, string[]> = {
  "/calculators/[slug]": CALCULATORS.map(({ slug }) => `/calculators/${slug}`),
  "/loans/[slug]": ["/loans/personal-loan", "/loans/health-insurance", "/loans/credit-card"],
  "/dashboard/explore/[slug]": ["/dashboard/explore/loans", "/dashboard/explore/insurance", "/dashboard/explore/cards"],
  "/dashboard/explore/[slug]/[productSlug]": ["/dashboard/explore/loans/personal-loan"],
};
// Discover every page, so new routes automatically enter the mobile sweep.
const routes = readdirSync("app", { recursive: true }).map(String)
  .filter((file) => file.replaceAll("\\", "/").endsWith("/page.tsx"))
  .flatMap((file) => {
    const route = "/" + file.replaceAll("\\", "/").split("/").filter((part) => !part.startsWith("(") && part !== "page.tsx").join("/");
    return dynamicRoutes[route] ?? [route.replace(/\[[^\]]+\]/g, FIXTURE_ID)];
  });

async function expectContained(page: Page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  expect(size.page, `Page overflow at ${page.url()} (${size.viewport}px)`).toBeLessThanOrEqual(size.viewport + 1);
  const overflow = await page.locator("main, [role=dialog]").evaluateAll((mains) => {
    return mains.flatMap((main) => Array.from(main.querySelectorAll("input:not([type=hidden]), textarea, [data-slot=select-trigger], h1")))
      .filter((element) => {
        if (element.closest("[aria-hidden=true], [inert]")) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map((element) => element.outerHTML.slice(0, 200));
  });
  expect(overflow, "Visible headings and form fields must fit the viewport").toEqual([]);
}

for (const route of routes) {
  test(`mobile route ${route}`, async ({ page, baseURL }, testInfo) => {
    const dashboard = route.startsWith("/dashboard");
    const role = dashboard ? roles.find((role) => isDashboardPathAllowed(route, { role, businessLine: "both", activeLine: "real_estate", profileLines: ["loans", "real_estate"], staffFeatures: ["payout_requests"] })) : undefined;
    if (dashboard) expect(role, `Missing authorized scenario for ${route}`).toBeDefined();
    if (role) await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await mockMobileApi(page, role, "real_estate");
    if (route === "/forgot-password") {
      await page.addInitScript((key) => sessionStorage.setItem(key, "+919876543210"), RESET_MOBILE_KEY);
    }
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(route === "/dashboard/apply" ? `${route}?product=${FIXTURE_ID}` : route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    if (dashboard) await expect(page.locator("#dashboard-main-content")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 390, 768, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      await expectContained(page);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("mobile.png"), animations: "disabled" });
    }
    expect(errors).toEqual([]);
  });
}

for (const role of roles) {
  test(`mobile ${role} navigation and home`, async ({ page, baseURL }, testInfo) => {
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await mockMobileApi(page, role);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/dashboard");
    await expect(page.locator("#dashboard-main-content")).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expectContained(page);
    await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), fullPage: true, animations: "disabled" });
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const destination = drawer.locator('a[href^="/dashboard/"]').first();
    await expect(destination).toBeVisible();
    const href = await destination.getAttribute("href");
    await destination.click();
    await expect(drawer).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expectContained(page);
  });
}

test("mobile populated review cards and constrained dialog", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await mockMobileApi(page, "admin");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Admin overview" })).toBeVisible();
  await expect(page.locator("td[data-label='Business line']")).toContainText("Real Estate");
  await expectContained(page);
  await page.getByRole("button", { name: "Review filters" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Review filters" })).toBeFocused();
});

test("mobile OTP and new-password steps fit a short phone viewport", async ({ page }) => {
  await mockMobileApi(page);
  await page.addInitScript((key) => sessionStorage.setItem(key, "+919876543210"), RESET_MOBILE_KEY);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/forgot-password");
  const otp = page.getByRole("textbox", { name: "Enter OTP" });
  await expect(otp).toBeVisible({ timeout: 30_000 });
  await expectContained(page);
  await otp.fill("123456");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await page.locator("#password").fill("Mobile#Fixture99");
  await page.locator("#confirm-password").fill("Mobile#Fixture99");
  await expectContained(page);
  await expect(page.locator("#password")).toHaveCSS("font-size", "16px");
});

test("mobile record sorting remains available above the cards", async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await mockMobileApi(page, "admin");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard/support-tickets");
  const sorting = page.getByRole("group", { name: "Sort records" });
  await expect(sorting).toBeVisible({ timeout: 30_000 });
  await sorting.getByRole("button", { name: "Sort by Subject", exact: true }).click();
  await expect(page.locator('td[data-label="Subject"]').first()).toContainText("Alpine");
  await sorting.getByRole("button", { name: "Sort by Subject, ascending" }).click();
  await expect(page.locator('td[data-label="Subject"]').first()).toContainText("Zebra");
  await expectContained(page);
});

test("mobile public navigation can expand and reach the auth pages", async ({ page }) => {
  await mockMobileApi(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await drawer.locator("summary").first().click();
  await expect(drawer.getByRole("link", { name: "Personal", exact: true })).toBeVisible();
  await drawer.getByRole("link", { name: "Login", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectContained(page);
});

test("mobile financial-product workspace keeps form controls reachable", async ({ page, baseURL }, testInfo) => {
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await mockMobileApi(page, "admin");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard/loan-config");
  await page.getByRole("button", { name: "New product", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectContained(page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
