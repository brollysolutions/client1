import { expect, test } from "@playwright/test";
import { financialServiceHref, LOAN_PRODUCTS } from "@/lib/products";
import { serviceAnchor } from "@/lib/service-directory";
import type { PublicFinancialProduct } from "@/lib/financial-catalog";

// Run only against the isolated review API. Admin publication determines which
// configured products appear; static marketing data cannot republish a row.
let products: PublicFinancialProduct[];
test.setTimeout(120_000);
test.use({ contextOptions: { reducedMotion: "reduce" } });
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/v1/public/financial-products?page_size=100");
  expect(response.ok()).toBe(true);
  products = (await response.json()).items;
  expect(products.length).toBeGreaterThan(0);
});

for (const width of [320, 390, 768, 1365]) {
  test(`published services have branded photography at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/loans", { waitUntil: "networkidle" });
    const catalogue = page.locator("#financial-services-catalogue");
    await expect(catalogue.locator("article")).toHaveCount(products.length);
    for (const product of products) {
      const card = catalogue.locator(`article[id="${serviceAnchor(product.slug)}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole("link", { name: /^Explore / })).toHaveAttribute("href", financialServiceHref(product.slug));
      const photo = card.locator('img[data-nimg="fill"]');
      await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(card.locator('img[src*="logo-horizontal.png"]')).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: testInfo.outputPath(`published-services-${width}.png`), fullPage: true, animations: "disabled" });
  });
}

test("category counts follow the active published catalogue", async ({ page }) => {
  await page.goto("/loans");
  const catalogue = page.locator("#financial-services-catalogue");
  const categories = page.getByRole("group", { name: "Filter by category" });
  for (const [label, category] of [["Loans", "loan"], ["Insurance", "insurance"], ["Credit cards", "credit_card"]] as const) {
    const count = products.filter((product) => product.category === category).length;
    const link = categories.getByRole("link", { name: new RegExp(`^${label}\\s*${count}$`, "i") });
    await expect(link).toBeVisible();
    await link.click();
    await expect(catalogue.locator("article")).toHaveCount(count);
  }
});

test("desktop and mobile navigation open the same published service", async ({ page }) => {
  const product = products[0];
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    if (width < 1280) {
      await page.locator("header").getByRole("button", { name: "Open menu", exact: true }).click();
      await page.getByRole("dialog").locator("summary").filter({ hasText: "Financial Services" }).click();
      await page.getByRole("dialog").getByRole("link", { name: product.label, exact: true }).click();
    } else {
      await page.locator("header").getByRole("button", { name: "Financial Services", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.locator('[data-slot="navigation-menu-viewport"]').getByRole("link", { name: product.label, exact: true }).click();
    }
    await expect(page.getByRole("heading", { level: 1, name: product.label, exact: true })).toBeVisible();
  }
});

for (const service of LOAN_PRODUCTS) {
  test(`${service.label} page follows publication and keeps its canonical URL`, async ({ page, baseURL }) => {
    const href = financialServiceHref(service.id);
    const product = products.find((item) => financialServiceHref(item.slug) === href);
    const response = await page.goto(href, { waitUntil: "networkidle" });
    if (!product) {
      // Streamed App Router not-found responses can retain HTTP 200; robots
      // and rendered content must still exclude unpublished service details.
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
      await expect(page.locator("#providers")).toHaveCount(0);
      return;
    }
    expect(response?.status()).toBe(200);
    await expect(page.locator("main").getByRole("heading", { level: 1 })).toHaveText(product.label);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}${href}`);
    await expect(page.locator("#providers").getByRole("heading", { name: "Compare configured provider options", exact: true })).toBeVisible();
    expect(await page.locator('main a[href*="dashboard%2Fapply"]').count()).toBeGreaterThan(0);
    for (const width of [320, 390, 768, 1365]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }
  });
}

test("sitemap omits unpublished services and retains canonical card aliases", async ({ page, request, baseURL }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  for (const service of LOAN_PRODUCTS) {
    const href = financialServiceHref(service.id);
    expect(xml.includes(`${baseURL}${href}</loc>`)).toBe(products.some((product) => financialServiceHref(product.slug) === href));
  }
  await page.goto("/loans/credit-cards?provider_q=Example&provider_page=2");
  await expect(page).toHaveURL(/\/loans\/credit-card\?provider_q=Example&provider_page=2$/);
});
