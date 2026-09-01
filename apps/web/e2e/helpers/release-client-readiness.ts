import { expect, type Locator, type Page } from "@playwright/test";

const RELEASE_CLIENT_DELAY_ENV = "PLAYWRIGHT_RELEASE_CLIENT_DELAY_MS";
const MAX_RELEASE_CLIENT_DELAY_MS = 5_000;

/**
 * Give the release gate a deterministic slow-hydration mode. The hosted gate
 * enables this before navigation so client-readiness assertions cannot pass by
 * runner timing alone. Application responses and test retries stay unchanged.
 */
export async function installReleaseClientDelay(page: Page): Promise<void> {
  const rawDelay = process.env[RELEASE_CLIENT_DELAY_ENV];
  if (rawDelay == null || rawDelay === "") return;

  const delayMs = Number(rawDelay);
  if (
    !Number.isInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > MAX_RELEASE_CLIENT_DELAY_MS
  ) {
    throw new Error(
      `${RELEASE_CLIENT_DELAY_ENV} must be an integer from 0 to ${MAX_RELEASE_CLIENT_DELAY_MS}`,
    );
  }
  if (delayMs === 0) return;

  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
}

/** Wait until the catalogue's client-only keyboard effect owns the input. */
export async function focusCatalogueAfterHydration(
  page: Page,
  search: Locator,
): Promise<void> {
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(search).toBeFocused({ timeout: 500 });
  }).toPass({ timeout: 30_000, intervals: [100, 250, 500] });
}

/** Select a React-owned toggle, retrying only while its state did not change. */
export async function selectToggleAfterHydration(toggle: Locator): Promise<void> {
  await expect(async () => {
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 500 });
  }).toPass({ timeout: 30_000, intervals: [100, 250, 500] });
}
