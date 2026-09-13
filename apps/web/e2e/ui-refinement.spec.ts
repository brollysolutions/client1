import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_ID, mockMobileApi } from "./helpers/mobile-fixtures";
import { RESET_MOBILE_KEY, type UserRole } from "@/lib/auth";
import type { AuthenticatedPlacement } from "@/lib/personalization-api";
import { CALCULATORS } from "@/lib/calculators/registry";
import mobileProperty from "./fixtures/mobile-property.json";

test.setTimeout(120_000);
test.use({ contextOptions: { reducedMotion: "reduce" } });

const widths = [320, 390, 768, 1365];
const families: { name: string; route: string; role?: UserRole }[] = [
  { name: "home", route: "/" },
  { name: "services", route: "/loans" },
  { name: "service-detail", route: "/loans/personal-loan" },
  { name: "properties", route: "/real-estate" },
  { name: "property-detail", route: `/real-estate/properties/${FIXTURE_ID}` },
  { name: "calculator", route: "/calculators/emi" },
  { name: "partners", route: "/earn-with-us" },
  { name: "contact", route: "/contact" },
  { name: "legal", route: "/privacy" },
  { name: "login", route: "/login" },
  { name: "register", route: "/register" },
  ...(["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as const)
    .map((role) => ({ name: role, route: "/dashboard", role })),
];

async function contained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1);
}

test("every calculator exposes named slider controls and readable values", async ({ page }) => {
  test.setTimeout(180_000);
  for (const calculator of CALCULATORS) {
    await page.goto(`/calculators/${calculator.slug}`, { waitUntil: "networkidle" });
    const sliders = page.getByRole("slider");
    await expect(sliders.first()).toBeVisible();
    expect(await sliders.count(), calculator.slug).toBeGreaterThan(0);
    for (const slider of await sliders.all()) {
      await expect(slider).toHaveAccessibleName(/\S/);
      await expect(slider).toHaveAttribute("aria-valuetext", /\S/);
    }
    await expect(page.locator('[data-slot="slider"][aria-valuetext]')).toHaveCount(0);
  }
});

test("the homepage shares one sky section colour and all page families share navy actions", async ({ page, baseURL }, testInfo) => {
  for (const width of [390, 1365]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    const sections = await page.locator("main > section, main > div > section").evaluateAll((elements) => elements.map((element) => ({
      name: element.getAttribute("aria-label") ?? element.id,
      background: getComputedStyle(element).backgroundColor,
    })));
    expect(sections.length).toBeGreaterThan(7);
    for (const section of sections) {
      expect(["rgb(240, 247, 252)", "rgb(41, 54, 129)"], section.name).toContain(section.background);
    }
    await page.screenshot({ path: testInfo.outputPath(`consistent-home-${width}.png`), fullPage: true, animations: "disabled" });
  }
  for (const route of ["/loans", "/loans/school-funding", "/real-estate", "/calculators/emi", "/earn-with-us", "/contact", "/privacy", "/login", "/register", "/dashboard"]) {
    if (route === "/dashboard") {
      await mockMobileApi(page, "admin");
      await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    }
    await page.goto(route, { waitUntil: "networkidle" });
    const palette = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(["--background", "--nav-bg", "--nav-tint", "--color-brand-cta-tint", "--muted", "--primary", "--nav-primary", "--color-brand-cta", "--color-dash-rail"].map((name) => [name, style.getPropertyValue(name).trim().toLowerCase()]));
    });
    for (const [name, value] of Object.entries(palette)) {
      const action = ["--primary", "--nav-primary", "--color-brand-cta", "--color-dash-rail"].includes(name);
      expect(value, `${route}: ${name}`).toBe(action ? "#293681" : "#f0f7fc");
    }
  }
});

test("EMI tabs own their inputs and slider keyboard changes remain shareable", async ({ page }, testInfo) => {
  for (const width of [390, 1365]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/calculators/emi?amount=1000000&rate=10&months=120", { waitUntil: "networkidle" });
    const panel = page.getByRole("tabpanel", { name: "Property", exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByRole("tab", { name: "Property", exact: true })).toHaveAttribute("aria-controls", (await panel.getAttribute("id"))!);
    const amount = panel.getByRole("slider", { name: "Loan amount", exact: true });
    await amount.focus();
    await amount.press("ArrowRight");
    await expect(panel.getByRole("spinbutton", { name: "Loan amount", exact: true })).toHaveValue("1050000");
    await expect(page).toHaveURL(/amount=1050000/);
    const personal = page.getByRole("tab", { name: "Personal", exact: true });
    await personal.focus();
    await personal.press("Enter");
    await expect(personal).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Personal", exact: true }).getByRole("spinbutton", { name: "Loan amount", exact: true })).toHaveValue("500000");
    await contained(page);
    await page.screenshot({ path: testInfo.outputPath(`emi-accessibility-${width}.png`), animations: "disabled" });
  }
});

test("property sections and range filters have complete accessible labels", async ({ page, baseURL }) => {
  await page.goto("/real-estate", { waitUntil: "networkidle" });
  await expect(page.locator("#apartments").getByRole("heading", { level: 2 })).toBeVisible();
  await mockMobileApi(page, "client", "real_estate");
  await page.route("**/api/v1/properties", (route) => route.fulfill({ json: {
    properties: [{ ...mobileProperty, price_paise: 780000000, media_urls: [mobileProperty.image], media: [], security_deposit_paise: null }],
  } }));
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  for (const width of [390, 1365]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/explore", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "All filters" });
    for (const end of ["Minimum", "Maximum"]) {
      await expect(filters.getByRole("slider", { name: `${end} budget in lakhs` })).toBeVisible();
    }
    await filters.getByRole("button", { name: /^Area \(sqft\)/ }).click();
    for (const end of ["Minimum", "Maximum"]) {
      await expect(filters.getByRole("slider", { name: `${end} area in square feet` })).toBeVisible();
    }
    await contained(page);
  }
});

test("the card-category redirect completes through ordinary navigation", async ({ page, baseURL }) => {
  await mockMobileApi(page, "client");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.goto("/dashboard/explore/cards", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/explore\/cards\/credit-card$/, { timeout: 30_000 });
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toContainText("Credit Card");
  await expect(page.locator("main").getByRole("status", { name: "Opening credit cards" })).toHaveCount(0);
});

test("the card-category redirect retains a loading region until its product arrives", async ({ page, baseURL }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockMobileApi(page, "client");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  let requested = false;
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/dashboard/explore/cards/credit-card?*", async (route) => {
    requested = true;
    // Keep the actual RSC payload intact while controlling its arrival. Paused
    // Chromium streams do not reliably complete behind the local gzip proxy.
    const response = await route.fetch();
    await ready;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/dashboard/explore/cards", { waitUntil: "domcontentloaded" });
    const historyLength = await page.evaluate(() => history.length);
    await expect.poll(() => requested).toBe(true);
    // Wait for the redirect itself, after the auth/access loading regions.
    const loading = page.locator("main").getByRole("status", { name: "Opening credit cards" });
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await contained(page);
      await expect(loading).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`redirect-loading-${width}.png`), animations: "disabled" });
    }
    const destination = page.waitForResponse((response) => new URL(response.url()).pathname === "/dashboard/explore/cards/credit-card", { timeout: 30_000 });
    release();
    const response = await destination;
    expect(response.status()).toBe(200);
    await response.finished();
    await expect(page).toHaveURL(/\/dashboard\/explore\/cards\/credit-card$/);
    await expect(page.locator("main").getByRole("heading", { level: 1 })).toContainText("Credit Card");
    await expect(loading).not.toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("the production page loads both existing font families", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const loadedFamilies = await page.evaluate(() => Array.from(document.fonts)
    .filter((font) => font.status === "loaded")
    .map((font) => font.family));
  expect(loadedFamilies.some((family) => family.includes("Space Grotesk"))).toBe(true);
  expect(loadedFamilies.some((family) => family.includes("Geist"))).toBe(true);
});

for (const family of families) {
  test(`visual family ${family.name}`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, family.role);
    if (family.role) await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(family.route);
    await expect(page.locator(family.role ? "#dashboard-main-content" : "main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await contained(page);
      await page.screenshot({ path: testInfo.outputPath(`${family.name}-${width}.png`), fullPage: true, animations: "disabled" });
    }
    expect(errors).toEqual([]);
  });
}

for (const route of ["/login", "/register", "/forgot-password", "/change-mobile", `/agent-invite/${FIXTURE_ID}`, `/staff-invite/${FIXTURE_ID}`]) {
  test(`shared legal links on ${route}`, async ({ page, baseURL }) => {
    await mockMobileApi(page);
    if (route === "/forgot-password") {
      await page.addInitScript((key) => sessionStorage.setItem(key, "+919876543210"), RESET_MOBILE_KEY);
    }
    await page.goto(route);
    await expect(page).toHaveURL(new URL(route, baseURL).href);
    const legal = page.getByRole("navigation", { name: "Account legal information" });
    await expect(legal).toBeVisible();
    for (const [name, href] of [["Privacy Policy", "/privacy"], ["Terms of Use", "/terms"]]) {
      const link = legal.getByRole("link", { name: `${name} (opens in a new tab)` });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
}

test("visual published campaigns", async ({ page }, testInfo) => {
  await expect(async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Explore financial options" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 90_000, intervals: [2000, 5000] });
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: testInfo.outputPath(`published-${width}.png`), animations: "disabled" });
  }
});

test("legal navigation retains registration input and validates normally", async ({ page, context }) => {
  await mockMobileApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await page.locator("#firstName").fill("Synthetic");
  await expect(page.getByText("Review our Terms of Use and Privacy Policy before creating an account.")).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("navigation", { name: "Account legal information" }).getByRole("link", { name: /Privacy Policy/ }).click();
  const legalPage = await popupPromise;
  await expect(legalPage).toHaveURL(/\/privacy$/);
  await expect(legalPage.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
  await legalPage.close();
  await expect(page.locator("#firstName")).toHaveValue("Synthetic");
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await contained(page);
});

for (const role of ["admin", "sub_admin", "agent", "employee", "telecaller"] as const) {
  test(`${role} loading, error and recovery remain usable`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, role);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let fail = true;
    await page.route(`**/api/v1/${role.replaceAll("_", "-")}/home`, async (route) => {
      await pending;
      if (fail) await route.fulfill({ status: 503, json: { detail: "Synthetic unavailable service" } });
      else await route.fallback();
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/dashboard");
    const main = page.locator("#dashboard-main-content");
    await expect(main.locator('[data-slot="skeleton"]').first()).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await contained(page);
    }
    await page.screenshot({ path: testInfo.outputPath("loading.png"), animations: "disabled" });
    release();
    const retry = main.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await contained(page);
    }
    await page.screenshot({ path: testInfo.outputPath("error.png"), animations: "disabled" });
    fail = false;
    await retry.click();
    await expect(retry).not.toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("mobile drawer restores keyboard focus after close", async ({ page, baseURL }) => {
  await mockMobileApi(page, "client");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
});

for (const role of ["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as const) {
  test(`${role} session skeleton resolves without exposing premature navigation`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, role);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    let release = () => {};
    const refresh = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/v1/auth/refresh", async (route) => { await refresh; await route.fallback(); });
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("status", { name: "Loading your workspace" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Workspace" })).not.toBeVisible();
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        await contained(page);
      }
      await page.screenshot({ path: testInfo.outputPath("session-loading.png"), animations: "disabled" });
      release();
      await expect(page.getByRole("status", { name: "Loading your workspace" })).not.toBeVisible();
      await expect(page.locator("#dashboard-main-content h1")).toBeVisible();
    } finally { release(); }
  });
}

test("navy sidebar keeps keyboard focus and light overlays readable", async ({ page, baseURL }) => {
  await mockMobileApi(page, "client");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.setViewportSize({ width: 1365, height: 844 });
  await page.goto("/dashboard");
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  await expect(navigation).toHaveCSS("background-color", "rgb(41, 54, 129)");
  const logo = navigation.getByRole("link", { name: "Dhanadhara dashboard" });
  await logo.focus();
  await expect(logo).toBeFocused();
  await expect(logo).toHaveCSS("--tw-ring-color", /#95ccdd/i);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const explore = navigation.getByRole("link", { name: "Explore", exact: true });
  await explore.focus();
  await page.keyboard.press("Tab");
  await expect(navigation.getByRole("link", { name: "Loans", exact: true })).toBeFocused();
  await navigation.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("menu").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toHaveCSS("background-color", "rgb(41, 54, 129)");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
});

test("restored banners preserve artwork visibility and carousel navigation", async ({ page }) => {
  // Run with release-catalogue-server.mjs --published-banners and a fresh build/cache.
  const artworkRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("banner-templates")) artworkRequests.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/", { waitUntil: "networkidle" });
  expect(artworkRequests).toEqual([]);
  const carousel = page.getByRole("region", { name: "Highlights", exact: true });
  // The outer semantic section receives its accessible name from aria-label.
  await expect(carousel.getByRole("heading", { name: "Explore financial options" })).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 568 });
    await carousel.getByRole("button", { name: "Go to slide 1" }).click();
    const slide = carousel.locator('[aria-roledescription="slide"][aria-hidden="false"]');
    const artwork = slide.locator("img");
    if (width < 640) {
      await expect(artwork).not.toBeVisible();
    } else {
      await expect(artwork).toBeVisible();
      await expect.poll(() => artwork.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(artwork).toHaveCSS("object-fit", "cover");
      await expect(artwork).toHaveCSS("mask-image", /linear-gradient/);
    }
    await carousel.getByRole("button", { name: "Go to slide 3" }).click();
    const textSlide = carousel.locator('[aria-roledescription="slide"][aria-hidden="false"]');
    await expect(textSlide.getByRole("heading", { name: "Guidance for your next step" })).toBeVisible();
    await expect(textSlide.locator("picture")).toHaveCount(0);
    await expect(textSlide.getByRole("link", { name: "Contact us" })).toBeVisible();
    await contained(page);
  }
  await carousel.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(carousel.getByRole("heading", { name: "Explore financial options" })).toBeVisible();
});

test("auth uses the original logo above a separate, reachable back link", async ({ page }) => {
  await mockMobileApi(page);
  for (const route of ["/login", "/register"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const logo = page.getByRole("link", { name: "Dhanadhara home", exact: true });
    const back = page.getByRole("link", { name: "Back to home", exact: true });
    await expect(logo.locator("img")).toHaveCSS("filter", "none");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await expect(async () => {
        const logoBox = await logo.boundingBox();
        const backBox = await back.boundingBox();
        expect(logoBox).not.toBeNull();
        expect(backBox).not.toBeNull();
        expect(logoBox!.y + logoBox!.height).toBeLessThan(backBox!.y);
      }).toPass();
      await back.focus();
      await expect(back).toBeFocused();
      await contained(page);
    }
    await back.click();
    await expect(page).toHaveURL(/\/$/);
  }
});

test("wide navbar menus fit the viewport and remain keyboard accessible", async ({ page }, testInfo) => {
  await mockMobileApi(page);
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(page.locator("header").getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
  await contained(page);
  for (const width of [1280, 1365]) {
    await page.setViewportSize({ width, height: 844 });
    const calculator = page.locator("header").getByRole("button", { name: "Calculators", exact: true });
    const earn = page.locator("header").getByRole("link", { name: "Earn with Us", exact: true });
    expect((await calculator.boundingBox())!.x).toBeLessThan((await earn.boundingBox())!.x);
    const partner = await page.locator("header").getByRole("link", { name: "Become a Partner", exact: true }).boundingBox();
    const login = await page.locator("header").getByRole("link", { name: "Login", exact: true }).boundingBox();
    expect(partner!.x + partner!.width).toBeLessThanOrEqual(login!.x);
    for (const name of ["Financial Services", "Properties", "Calculators"]) {
      const trigger = page.locator("header").getByRole("button", { name, exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.locator('[data-slot="navigation-menu-viewport"]');
      await expect(menu).toBeVisible();
      await expect(menu.locator("img")).toHaveCount(0);
      // Opening scales the panel briefly. Check the settled geometry together;
      // comparing its scroll width with an animated bounding box races that zoom.
      await expect.poll(() => menu.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          wide: box.width > 1000,
          contained: box.left >= 0 && box.right <= innerWidth,
          contentFits: element.scrollWidth <= Math.ceil(box.width),
        };
      })).toEqual({ wide: true, contained: true, contentFits: true });
      await page.screenshot({ path: testInfo.outputPath(`${name.replaceAll(" ", "-")}-${width}.png`), animations: "disabled" });
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  }
});

for (const width of [320, 390, 768]) {
  test(`calculator dropdown includes all tools and navigates from the mobile drawer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.locator("header").getByRole("button", { name: "Open menu", exact: true }).click();
    const drawer = page.getByRole("dialog");
    const summary = drawer.locator("summary").filter({ hasText: "Calculators" });
    const earn = drawer.getByRole("link", { name: "Earn with Us", exact: true });
    expect((await summary.boundingBox())!.y).toBeLessThan((await earn.boundingBox())!.y);
    await summary.focus();
    await page.keyboard.press("Enter");
    const calculators = summary.locator("..");
    await expect(calculators.locator('a[href^="/calculators/"]')).toHaveCount(18);
    await expect(calculators.locator("img")).toHaveCount(0);
    await expect(calculators.getByRole("link", { name: "View all calculators", exact: true })).toHaveAttribute("href", "/calculators");
    const emi = calculators.getByRole("link", { name: "EMI Calculator", exact: true });
    await emi.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/calculators\/emi$/);
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "EMI Calculator", exact: true })).toBeVisible();
    await page.locator("header").getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(page.getByRole("dialog").locator("summary").filter({ hasText: "Calculators" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("dialog").getByRole("link", { name: "Health Insurance Cover", exact: true })).toBeVisible();
    await contained(page);
  });
}

test("carousel autoplay pauses for keyboard, hover and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const carousel = page.getByRole("region", { name: "Highlights", exact: true });
  const second = carousel.getByRole("button", { name: "Go to slide 2" });
  const homeLink = page.getByRole("link", { name: "Dhanadhara home", exact: true }).first();
  await homeLink.focus();
  await page.mouse.move(0, 0);
  await expect(second).toHaveAttribute("aria-current", "true", { timeout: 10_000 });

  await second.focus();
  await page.waitForTimeout(5500);
  await expect(second).toHaveAttribute("aria-current", "true");

  await homeLink.focus();
  await carousel.hover();
  await page.waitForTimeout(5500);
  await expect(second).toHaveAttribute("aria-current", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(5500);
  await expect(second).toHaveAttribute("aria-current", "true");
});

for (const role of ["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as const) {
  test(`${role} dashboards omit published and fallback promotional banners`, async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    for (const line of ["loans", "real_estate"]) {
      await mockMobileApi(page, role, line);
      for (const published of [false, true]) {
        const placement: AuthenticatedPlacement = {
          banners: published ? [{ id: FIXTURE_ID, banner_type: "default", title: "Synthetic dashboard campaign", subtitle: "This promotional banner must stay off the workspace.", cta_label: null, deep_link: null, image_url: null }] : [],
          offers: [],
        };
        await page.route("**/api/v1/personalization/placements?**", (route) => route.fulfill({ json: placement }));
        await page.goto("/dashboard", { waitUntil: "networkidle" });
        const main = page.locator("#dashboard-main-content");
        await expect(main.locator("h1")).toBeVisible();
        await expect(main).not.toContainText(/Synthetic dashboard campaign|Turn every conversation into progress|Help buyers find the right property|Your financial journey, in one place|Your property journey starts here/);
        await expect(main.getByRole("region", { name: "Dashboard highlights" })).toHaveCount(0);
      }
    }
  });
}

test("eligible offer cards remain usable without a dashboard banner", async ({ page, baseURL }) => {
  await mockMobileApi(page, "agent");
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  const placement: AuthenticatedPlacement = {
    banners: [{ id: FIXTURE_ID, banner_type: "action", title: "Synthetic dashboard campaign", subtitle: null, cta_label: "Explore", deep_link: "/dashboard/explore", image_url: null }],
    offers: [{ id: FIXTURE_ID, title: "Synthetic eligible offer", partner_name: "Example partner", description: null, code: "SYNTHETIC", discount_type: "percentage", discount_value: "10", image_url: "/banner-templates/properties/villas.webp", redemption_url: "https://example.com/checkout", terms_url: null, terms_summary: "Synthetic browser fixture." }],
  };
  await page.route("**/api/v1/personalization/placements?**", (route) => route.fulfill({ json: placement }));
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  const highlights = page.getByRole("region", { name: "Dashboard highlights" });
  await expect(highlights.getByRole("heading", { name: "Synthetic eligible offer" })).toBeVisible();
  await expect(highlights.getByRole("link", { name: "Use offer" })).toHaveAttribute("href", "https://example.com/checkout");
  await expect(page.getByText("Synthetic dashboard campaign", { exact: true })).toHaveCount(0);
});

for (const role of ["admin", "sub_admin"] as const) {
  test(`${role} sidebar spans long pages and keeps navigation within the viewport`, async ({ page, baseURL }, testInfo) => {
    await mockMobileApi(page, role);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await page.setViewportSize({ width: 1365, height: 568 });
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const rail = page.locator("aside").filter({ has: page.getByRole("navigation", { name: "Workspace" }) });
    const nav = rail.getByRole("navigation", { name: "Workspace" });
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(pageHeight).toBeGreaterThan(568);
    const railBox = await rail.boundingBox();
    expect(railBox!.height).toBeGreaterThanOrEqual(pageHeight - 1);
    await expect(rail).toHaveCSS("background-color", "rgb(41, 54, 129)");
    await page.screenshot({ path: testInfo.outputPath("full-height-sidebar.png"), fullPage: true, animations: "disabled" });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const navBox = await nav.boundingBox();
    expect(navBox!.y).toBeGreaterThanOrEqual(-1);
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(569);
    await expect(nav.getByRole("button", { name: "Open account menu" })).toBeInViewport();
    await nav.getByRole("link", { name: "Dhanadhara dashboard" }).focus();
    await expect(nav.getByRole("link", { name: "Dhanadhara dashboard" })).toBeFocused();
  });
}

test("services search has clear focus and reachable categories at every width", async ({ page }, testInfo) => {
  await page.goto("/loans", { waitUntil: "networkidle" });
  const search = page.getByRole("searchbox", { name: "Search financial services" });
  const form = page.getByRole("search");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await search.scrollIntoViewIfNeeded();
    await search.focus();
    await expect(search).toBeFocused();
    await expect(search).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(search).toHaveCSS("font-size", "16px");
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(form).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await contained(page);
    await page.screenshot({ path: testInfo.outputPath(`services-search-${width}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 320, height: 844 });
  const insurance = form.getByRole("link", { name: /^Insurance/ });
  await insurance.focus();
  await expect(insurance).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/category=insurance/);
});

test("calculator illustrations fill the original 460px column without changing aspect ratio", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  for (const route of ["/calculators", ...CALCULATORS.map((calculator) => `/calculators/${calculator.slug}`)]) {
    await page.setViewportSize({ width: 1365, height: 844 });
    await page.goto(route, { waitUntil: "networkidle" });
    const illustration = page.locator("main picture img").first();
    for (const width of [1024, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(illustration).toBeVisible();
      await expect(illustration).toHaveCSS("width", "460px");
      const geometry = await illustration.evaluate((image: HTMLImageElement) => ({
        width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height,
        ratio: Number(image.getAttribute("width")) / Number(image.getAttribute("height")),
      }));
      expect(geometry.width / geometry.height).toBeCloseTo(geometry.ratio, 2);
      await contained(page);
    }
    if (["/calculators", "/calculators/emi", "/calculators/stamp-duty"].includes(route)) {
      await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll("/", "-")}-artwork.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(illustration).not.toBeVisible();
    await contained(page);
  }
});
