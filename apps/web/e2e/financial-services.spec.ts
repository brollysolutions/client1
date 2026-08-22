import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

test("Home restores the Loans band and places calculators after Properties", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });

  const loansHeading = page.getByRole("heading", {
    name: "Loans, cards, and insurance that fit you",
  });
  const propertiesHeading = page.getByRole("heading", { name: "Buy your property with confidence" });
  const calculatorsHeading = page.getByRole("heading", { name: "Calculate before you decide" });
  await expect(loansHeading).toBeVisible();
  await expect(propertiesHeading).toBeVisible();
  await expect(calculatorsHeading).toBeVisible();
  const headings = await page.locator("main h2").allTextContents();
  expect(headings.indexOf("Loans, cards, and insurance that fit you")).toBeLessThan(
    headings.indexOf("Buy your property with confidence"),
  );
  expect(headings.indexOf("Buy your property with confidence")).toBeLessThan(
    headings.indexOf("Calculate before you decide"),
  );
  await expect(page.getByText("Free planning tools")).toHaveCount(0);
  const calculators = page.locator('section[aria-labelledby="home-calculators-heading"]');
  for (const href of [
    "/calculators/emi",
    "/calculators/loan-eligibility",
    "/calculators/home-affordability",
    "/calculators/stamp-duty",
  ]) {
    await expect(calculators.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  await expect(calculators.getByRole("link", { name: "View all calculators" })).toHaveAttribute(
    "href",
    "/calculators",
  );
});

test("catalogue cards and provider applications remain inside Dhanadhara", async ({ page }) => {
  await page.goto("/loans", { waitUntil: "domcontentloaded", timeout: 90_000 });

  const catalogue = page.locator("#financial-services-catalogue");
  await expect(catalogue.getByRole("heading", { name: "Explore financial services" })).toBeVisible();
  const cardLink = catalogue.locator('a[aria-label^="Explore "]').first();
  await expect(cardLink).toHaveAttribute("href", /^\/loans\/[a-z0-9-]+$/);
  const detailPath = await cardLink.getAttribute("href");
  if (!detailPath) {
    throw new Error("Expected catalogue card to have an internal detail path");
  }
  await cardLink.click();
  await expect(page).toHaveURL(new RegExp(`${detailPath}$`), { timeout: 90_000 });

  await expect(page.getByText("Compare here. Continue here.")).toBeVisible();
  const internalAction = page
    .getByRole("link", { name: /Apply inside Dhanadhara|Request a quote/ })
    .first();
  await expect(internalAction).toHaveAttribute(
    "href",
    /^\/login\?return_to=%2Fdashboard%2Fapply%3Fproduct%3D/,
  );
  await expect(page.locator("#providers")).toBeVisible();

  const providerLinks = await page.locator("#providers a").evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  expect(providerLinks.every((href) => href.startsWith("/loans/") || href.startsWith("/login"))).toBe(
    true,
  );
});

test("catalogue results filter as you type under a sticky, button-free bar", async ({ page }) => {
  await page.goto("/loans", { waitUntil: "domcontentloaded", timeout: 90_000 });

  const catalogue = page.locator("#financial-services-catalogue");
  const bar = catalogue.locator('form[role="search"]');
  const search = bar.getByRole("searchbox", { name: "Search financial services" });

  // The submit gate is gone; filtering is driven entirely by the input.
  await expect(bar.getByRole("button", { name: "Show results" })).toHaveCount(0);
  await expect(catalogue.getByText("Admin-curated catalogue")).toHaveCount(0);

  // Scroll well past the bar's resting position and confirm it pins flush
  // under the 64px site header instead of scrolling away.
  await catalogue.locator('article a[aria-label^="Explore "]').last().scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  const pinned = await bar.boundingBox();
  expect(pinned?.y).toBeGreaterThanOrEqual(60);
  expect(pinned?.y).toBeLessThanOrEqual(68);

  // Typing alone updates the URL and the rendered results, with no click.
  const before = await catalogue.locator("article").count();
  expect(before).toBeGreaterThan(4);
  await search.fill("insurance");
  await expect(page).toHaveURL(/\/loans\?q=insurance$/, { timeout: 30_000 });
  await expect
    .poll(async () => catalogue.locator("article").count(), { timeout: 30_000 })
    .toBeLessThan(before);
  for (const label of await catalogue.locator('a[aria-label^="Explore "]').all()) {
    await expect(label).toHaveAttribute("aria-label", /Insurance/i);
  }

  // Category pills stay real links so the filter still works without JS.
  await expect(bar.getByRole("link", { name: /^Insurance/ })).toHaveAttribute(
    "href",
    "/loans?q=insurance&category=insurance",
  );

  // Clearing the search restores the full catalogue in place.
  await bar.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/loans$/, { timeout: 30_000 });
  await expect
    .poll(async () => catalogue.locator("article").count(), { timeout: 30_000 })
    .toBe(before);
});
