import { expect, test } from "@playwright/test";

import {
  attachReleaseInteractionDiagnostics,
  expectReleaseEvent,
  focusCatalogueAfterHydration,
  installReleaseClientDelay,
  installReleaseInteractionDiagnostics,
  markReleaseProbe,
} from "./helpers/release-client-readiness";

test.describe.configure({ timeout: 120_000 });
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await attachReleaseInteractionDiagnostics(page, testInfo);
  }
});

test("Home restores the Loans band and places calculators after Properties", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });

  // The same Loans copy can legitimately appear in a live campaign hero. The
  // stable section ids identify the three homepage bands this test orders.
  const loansHeading = page.locator("#loans-heading");
  const propertiesHeading = page.locator("#real-estate-heading");
  const calculatorsHeading = page.locator("#home-calculators-heading");
  await expect(loansHeading).toBeVisible();
  await expect(propertiesHeading).toBeVisible();
  await expect(calculatorsHeading).toBeVisible();
  const bands = await page
    .locator('#loans, #real-estate, section[aria-labelledby="home-calculators-heading"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.id || element.getAttribute("aria-labelledby")),
    );
  expect(bands).toEqual(["loans", "real-estate", "home-calculators-heading"]);
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
  expect(providerLinks.length).toBeGreaterThan(0);
  for (const href of providerLinks) {
    // Apply and enquiry actions are both internal. Reject absolute and
    // protocol-relative destinations without hard-coding every valid route.
    expect(href).toMatch(/^\/(?!\/)/);
  }
});

test("catalogue results filter as you type under a sticky, button-free bar", async ({ page }) => {
  await installReleaseInteractionDiagnostics(page);
  // Reproduce the hosted standalone failure deterministically: the App Router
  // RSC request never commits. A later full document request must remain
  // unblocked so the application's bounded recovery path can finish the same
  // navigation.
  let stalledFilterRequest = false;
  await page.route("**/loans?*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      !stalledFilterRequest &&
      request.headers().rsc === "1" &&
      url.searchParams.get("q") === "insurance"
    ) {
      stalledFilterRequest = true;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await route.abort("timedout").catch(() => undefined);
      return;
    }
    await route.continue();
  });
  const delayed = await installReleaseClientDelay(page);
  await page.goto("/loans", {
    waitUntil: delayed ? "commit" : "domcontentloaded",
    timeout: 90_000,
  });

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
  const scrollBeforeFiltering = await page.evaluate(() => window.scrollY);

  // Typing alone updates the URL and the rendered results, with no click.
  const before = await catalogue.locator("article").count();
  expect(before).toBeGreaterThan(4);
  // The page is useful before hydration, so DOM readiness alone does not prove
  // that React owns this controlled input. The "/" focus shortcut is attached
  // by the same client island and is an observable readiness boundary.
  await focusCatalogueAfterHydration(page, search);
  await markReleaseProbe(bar, "catalogue-search-form");
  await markReleaseProbe(search, "catalogue-search-input");
  await search.fill("insurance");
  await expectReleaseEvent(page, "catalogue-search-input", "input");
  await expect(search).toHaveAttribute("data-release-probe", "catalogue-search-input");
  await expect(page).toHaveURL(/\/loans\?q=insurance$/, { timeout: 30_000 });
  await expect
    .poll(async () => catalogue.locator("article").count(), { timeout: 30_000 })
    .toBeLessThan(before);
  expect(stalledFilterRequest).toBe(true);
  await expect
    .poll(
      async () => Math.abs((await page.evaluate(() => window.scrollY)) - scrollBeforeFiltering),
      { timeout: 10_000 },
    )
    .toBeLessThanOrEqual(2);
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
