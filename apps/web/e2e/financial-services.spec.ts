import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

test("Home exposes curated financial services and the four fixed calculators", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });

  await expect(
    page.getByRole("heading", { name: "Financial services for your next step" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calculate before you decide" })).toBeVisible();
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
