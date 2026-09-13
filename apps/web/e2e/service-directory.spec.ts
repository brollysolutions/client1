import { expect, test } from "@playwright/test";

import { financialServiceHref, LOAN_PRODUCTS } from "@/lib/products";

// The isolated release fixture deliberately publishes six provider products.
// The marketing directory must still include all 16 existing navbar services.
test.setTimeout(120_000);
test.use({ contextOptions: { reducedMotion: "reduce" } });

for (const width of [320, 390, 768, 1365]) {
  test(`all navbar services have branded photography at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/loans", { waitUntil: "networkidle" });
    const catalogue = page.locator("#financial-services-catalogue");
    await expect(catalogue.locator("article")).toHaveCount(16);
    await expect(catalogue.locator('a[aria-label^="Explore "]')).toHaveCount(16);
    for (const service of LOAN_PRODUCTS) {
      const card = catalogue.locator(`article[id="${service.id}"]`);
      await card.scrollIntoViewIfNeeded();
      const photo = card.locator('img[data-nimg="fill"]');
      await expect(photo).toHaveAttribute("src", new RegExp(`${service.id}\\.webp`));
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      const exactLogo = card.locator('img[src*="logo-horizontal.png"]');
      await expect(exactLogo).toHaveCount(1);
      await expect.poll(() => exactLogo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      const imageBox = await photo.boundingBox();
      const logoBox = await exactLogo.boundingBox();
      expect(logoBox!.x).toBeGreaterThan(imageBox!.x);
      expect(logoBox!.y).toBeGreaterThan(imageBox!.y);
      expect(logoBox!.x - imageBox!.x).toBeLessThan(30);
      expect(logoBox!.y - imageBox!.y).toBeLessThan(30);
      await expect(card.getByRole("link", { name: /^Enquire about/ })).toHaveAttribute("href", /^\/contact\?line=loans&product=/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`service-directory-${width}.png`), fullPage: true, animations: "disabled" });
  });
}

test("category counts cover 11 loans, 4 insurances and 1 card", async ({ page }) => {
  await page.goto("/loans");
  const catalogue = page.locator("#financial-services-catalogue");
  const categories = page.getByRole("group", { name: "Filter by category" });
  for (const [name, count] of [["Loans", 11], ["Insurance", 4], ["Credit cards", 1]] as const) {
    const category = categories.getByRole("link", { name: new RegExp(`^${name}\\s*${count}$`, "i") });
    await expect(category).toBeVisible();
    await category.click();
    await expect(catalogue.locator("article")).toHaveCount(count);
  }
  await categories.getByRole("link", { name: /^All services\s*16$/ }).click();
  await expect(catalogue.locator("article")).toHaveCount(16);
});

test("legacy footer anchors reach service cards after the catalogue streams", async ({ page }) => {
  await page.route("**/loans?*", async (route) => {
    if (route.request().headers().rsc === "1") await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.setViewportSize({ width: 1365, height: 844 });
  await page.goto("/");
  const footerLink = page.getByRole("contentinfo").getByRole("link", { name: "Vehicle Loan", exact: true });
  await footerLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/loans#vehicle-loan$/);
  const vehicle = page.locator("article#vehicle-loan");
  await expect(vehicle).toBeInViewport();
  await expect(vehicle.getByRole("link", { name: /^Explore/ })).toHaveAttribute("href", "/loans/vehicle-loan");
  const enquiry = vehicle.getByRole("link", { name: "Enquire about Vehicle Loan" });
  await enquiry.focus();
  await expect(enquiry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/contact\?line=loans&product=Vehicle\+Loan$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("desktop and mobile navbar links open a dedicated service page", async ({ page }) => {
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    if (width < 1280) {
      await page.locator("header").getByRole("button", { name: "Open menu", exact: true }).click();
      await page.getByRole("dialog").locator("summary").filter({ hasText: "Financial Services" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "School Funding", exact: true }).click();
    } else {
      const menu = page.locator("header").getByRole("button", { name: "Financial Services", exact: true });
      await menu.focus();
      await page.keyboard.press("Enter");
      await page.locator('[data-slot="navigation-menu-viewport"]').getByRole("link", { name: "School Funding", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/loans\/school-funding$/);
    await expect(page.getByRole("heading", { level: 1, name: "School Funding" })).toBeVisible();
    await page.getByRole("link", { name: "Enquire about School Funding", exact: true }).first().click();
    await expect(page).toHaveURL(/\/contact\?line=loans&product=School\+Funding$/);
  }
});

const publishedIds = new Set(["personal-loan", "business-loan", "home-loan", "credit-cards", "health-insurance", "travel-insurance"]);

test("overview provider filters submit, retain values and clear at the comparison section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/loans/school-funding");
  const providers = page.locator("#providers");
  await providers.getByLabel("Search providers").fill("Review provider");
  await providers.getByLabel("Provider type").selectOption("nbfc");
  await providers.getByLabel("Sort by").selectOption("amount");
  await providers.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/provider_q=Review\+provider.*#providers$/);
  await expect(providers.getByLabel("Search providers")).toHaveValue("Review provider");
  await expect(providers.getByLabel("Provider type")).toHaveValue("nbfc");
  await expect(providers.getByLabel("Sort by")).toHaveValue("amount");
  await expect(providers.getByRole("heading", { name: "No provider options published yet" })).toBeVisible();
  await expect(providers.locator('a[href*="dashboard%2Fapply"]')).toHaveCount(0);
  await providers.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/loans\/school-funding#providers$/);
  await expect(providers.getByLabel("Search providers")).toHaveValue("");
  await expect(providers.getByLabel("Provider type")).toHaveValue("");
  await expect(providers.getByLabel("Sort by")).toHaveValue("recommended");
  await expect(providers.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
});

for (const service of LOAN_PRODUCTS) {
  test(`${service.label} has a responsive, canonical page and the appropriate enquiry journey`, async ({ page, baseURL }, testInfo) => {
    const href = financialServiceHref(service.id);
    const response = await page.goto(href, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 1 })).toContainText(service.id === "credit-cards" ? "Credit Card" : service.label);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}${href}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/images\/services\//);
    const photo = main.locator('img[src*="images%2Fservices"]');
    await expect(photo).toHaveCount(1);
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(main.locator('img[src*="logo-horizontal.png"]')).toHaveCount(1);
    const applicationLinks = main.locator('a[href*="dashboard%2Fapply"]');
    await expect(main.locator("#providers")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Compare configured provider options", exact: true })).toBeVisible();
    if (publishedIds.has(service.id)) {
      expect(await applicationLinks.count()).toBeGreaterThan(0);
      await expect(main.locator("#providers")).toBeVisible();
    } else {
      await expect(applicationLinks).toHaveCount(0);
      await expect(main.getByRole("heading", { name: "Plan your enquiry", exact: true })).toBeVisible();
      await expect(main.getByRole("heading", { name: "No provider options published yet", exact: true })).toBeVisible();
    }
    for (const width of [320, 390, 768, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      const enquiry = main.getByRole("link", { name: /^Enquire about/ }).first();
      await enquiry.focus();
      await expect(enquiry).toBeFocused();
      await expect(enquiry).toHaveAttribute("href", /^\/contact\?line=loans&product=/);
      if (["school-funding", "health-insurance"].includes(service.id)) await page.screenshot({ path: testInfo.outputPath(`service-${width}.png`), fullPage: true, animations: "disabled" });
    }
  });
}

test("all service pages are in the sitemap and the credit-card alias keeps query state", async ({ page, request, baseURL }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const service of LOAN_PRODUCTS) expect(xml).toContain(`${baseURL}${financialServiceHref(service.id)}`);
  await page.goto("/loans/credit-cards?provider_q=Example&provider_page=2");
  await expect(page).toHaveURL(/\/loans\/credit-card\?provider_q=Example&provider_page=2$/);
});
