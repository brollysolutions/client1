import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockMobileApi } from "./helpers/mobile-fixtures";

test.setTimeout(120_000);

async function hold(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function scale(control: Locator) {
  return control.evaluate((element) => {
    const value = getComputedStyle(element).scale;
    return value === "none" ? 1 : parseFloat(value);
  });
}

test("auth logo and Support share one row above the back link", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/login", "/register", "/forgot-password", "/change-mobile", "/agent-invite/synthetic", "/staff-invite/synthetic"]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const logo = page.getByRole("link", { name: "Dhanadhara home", exact: true });
        const support = page.getByRole("button", { name: "Support", exact: true });
        await expect(async () => {
          await expect(support).toBeVisible();
          await expect(logo).toBeVisible();
          const left = (await logo.boundingBox())!;
          expect(left).not.toBeNull();
          const right = (await support.boundingBox())!;
          expect(right).not.toBeNull();
          expect(left.x + left.width).toBeLessThanOrEqual(right.x);
          expect(Math.abs(left.y + left.height / 2 - right.y - right.height / 2)).toBeLessThan(2);
          expect(right.height).toBeGreaterThanOrEqual(44);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          if (path === "/login" || path === "/register") {
            const back = (await page.getByRole("link", { name: "Back to home", exact: true }).boundingBox())!;
            expect(back.y).toBeGreaterThan(left.y + left.height);
            expect(back.y).toBeGreaterThan(right.y + right.height);
          }
        }).toPass({ timeout: 10_000 });
      }
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.screenshot({ path: testInfo.outputPath(`auth-${colorScheme}-${width}.png`) });
    }
  }
  await page.getByRole("button", { name: "Support", exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Support", exact: true })).toBeFocused();
});

test("native and shared buttons respond to a press without changing activation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const support = page.getByRole("button", { name: "Support", exact: true });
  await hold(page, support);
  await expect.poll(() => scale(support)).toBeLessThan(0.995);
  await expect(page.getByRole("dialog")).toBeHidden();
  // Releasing outside cancels activation and returns to the resting size.
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect.poll(() => scale(support)).toBe(1);
  await expect(page.getByRole("dialog")).toBeHidden();

  const eye = page.getByRole("button", { name: "Show password", exact: true });
  await hold(page, eye);
  await expect.poll(() => scale(eye)).toBeLessThan(0.995);
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.mouse.up();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await support.focus();
  await page.keyboard.down("Space");
  await expect.poll(() => scale(support)).toBeLessThan(0.995);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.up("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(support).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await hold(page, support);
  expect(await scale(support)).toBe(1);
  await expect(support).toHaveCSS("transition-duration", "0s");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("button links, disabled actions and dashboard native tabs keep their behavior", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/earn-with-us", { waitUntil: "domcontentloaded" });
  const cta = page.locator("main section").last().getByRole("link");
  await hold(page, cta);
  await expect.poll(() => scale(cta)).toBeLessThan(0.995);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/apply-as-agent/);

  await mockMobileApi(page, "admin");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  const disabled = page.getByRole("button", { name: "Save changes", exact: true });
  await expect(disabled).toBeDisabled();
  await hold(page, disabled);
  expect(await scale(disabled)).toBe(1);
  await page.mouse.up();

  await page.goto("/dashboard/property-review", { waitUntil: "domcontentloaded" });
  const published = page.getByRole("tab", { name: /Published/ });
  await hold(page, published);
  await expect.poll(() => scale(published)).toBeLessThan(0.995);
  await page.mouse.up();
  await expect(published).toHaveAttribute("aria-selected", "true");
});

test("public page closers meet the footer without a spacer and retain destinations", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of ["/", "/loans", "/real-estate", "/calculators/emi", "/earn-with-us"]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const footer = page.getByRole("contentinfo");
        const cta = page.locator("main section").last();
        const gap = await footer.evaluate((element) => element.getBoundingClientRect().top - document.querySelector("main")!.getBoundingClientRect().bottom);
        expect(Math.abs(gap)).toBeLessThanOrEqual(1);
        expect(await cta.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(await footer.evaluate((element) => getComputedStyle(element).backgroundColor));
        await expect(cta.getByRole("heading", { level: 2 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const cta = page.locator("main section").last();
      await cta.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`closer-${colorScheme}-${width}.png`) });
    }
  }
  await page.goto("/calculators/emi", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main section").last().getByRole("link")).toHaveAttribute("href", /\/contact\?.*line=loans.*product=/);
  await page.goto("/real-estate", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main section").last().getByRole("link")).toHaveAttribute("href", "/contact?line=real_estate");
});
