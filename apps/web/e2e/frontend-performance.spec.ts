import { expect, test } from "@playwright/test";

test.describe("frontend resource loading", () => {
  test("EMI retains deep-linked inputs and updates its shareable results", async ({ page }) => {
    await page.goto("/calculators/emi?amount=1000000&rate=10&months=120");
    const amount = page.getByRole("spinbutton", { name: "Loan amount", exact: true });
    await expect(amount).toHaveValue("1000000");
    await expect(page.getByRole("spinbutton", { name: "Interest rate", exact: true })).toHaveValue("10");
    await amount.fill("2000000");
    await amount.press("Enter");
    await expect(page).toHaveURL(/amount=2000000/);
    await page.reload();
    await expect(amount).toHaveValue("2000000");
    await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeEnabled();
  });

  test("EMI loads its own calculator without unrelated calculator implementations", async ({ page }) => {
    const scripts: Promise<string>[] = [];
    page.on("response", (response) => {
      if (response.request().resourceType() === "script" && response.ok()) {
        scripts.push(response.text());
      }
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/calculators/emi", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeVisible();
    expect(scripts.length).toBeGreaterThan(0);
    const initialCode = (await Promise.all(scripts)).join("\n");
    expect(initialCode.includes("Debt-free in")).toBe(false);
    expect(initialCode.includes("Your city")).toBe(false);
  });

  test("calculator copy and a stable loading region appear before hydration", async ({ page }) => {
    // Allow React's inline streaming reveal, but prevent application hydration.
    await page.route("**/*.js*", (route) => route.abort());
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/calculators/emi");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const pending = page.getByRole("status", { name: "", exact: true }).filter({ hasText: "Loading calculator" });
    await expect(pending).toBeVisible();
    const bounds = await pending.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(512);
    await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeAttached();
  });

  for (const width of [390, 768]) {
    test(`calculator artwork loads only when visible at ${width}px`, async ({ page }) => {
      const artworkPath = "/illustrations/calculators/emi.svg";
      const imageRequests: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "image") imageRequests.push(request.url());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/calculators/emi", { waitUntil: "load" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(imageRequests.filter((url) => url.includes(artworkPath))).toEqual([]);

      // Changing the viewport must reveal the same artwork without a reload,
      // with no client-only media query delaying the initial document's copy.
      const artworkResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === artworkPath,
      );
      await page.setViewportSize({ width: 1440, height: 900 });
      expect((await artworkResponse).ok()).toBe(true);
      await expect
        .poll(() => page.locator("img").evaluateAll((images: HTMLImageElement[], path) =>
          images.some((image) => image.currentSrc.endsWith(path) && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0),
        artworkPath))
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    });
  }

  test("the header logo uses a responsive image while retaining its identity", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/", { waitUntil: "load" });
    const logo = page.getByRole("img", { name: "Dhanadhara", exact: true }).first();
    await expect(logo).toBeVisible();
    const source = await logo.evaluate((image: HTMLImageElement) => image.currentSrc);
    const url = new URL(source);
    expect(url.pathname).toBe("/_next/image");
    expect(url.searchParams.get("url")).toBe("/brand/logo-horizontal.png");
    expect(Number(url.searchParams.get("w"))).toBeLessThan(960);
    await expect(logo).toHaveAttribute("alt", "Dhanadhara");
    await expect(page.getByRole("link", { name: "Dhanadhara home", exact: true }).first()).toHaveAttribute("href", "/");
  });
});
