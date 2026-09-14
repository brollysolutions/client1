import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_ID, mockMobileApi } from "./helpers/mobile-fixtures";
import property from "./fixtures/mobile-property.json";
import details from "./fixtures/dashboard-property.json";

test.use({ contextOptions: { reducedMotion: "reduce" } });
test.setTimeout(120_000);

async function signIn(page: Page, baseURL: string, role: Parameters<typeof mockMobileApi>[1], line = "loans") {
  await mockMobileApi(page, role, line);
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL }]);
}

const sample = { ...property, title: details.project_name, structured_details: details, property_subtype: "gated_community_apartment", meta: "3 bed · 1,450 sqft · Courtyard facing", price_paise: 1160000000, price_display: "₹1.16 Cr", bhk: 3, area_sqft: 1450, media_urls: [property.image], media: [], active: true, construction_status: "under_construction", security_deposit_paise: null };

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test("campaign tabs show one panel and remain usable on a narrow screen", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "admin");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/dashboard/campaign-approvals");
  const banners = page.getByRole("tab", { name: /^Banners/ });
  const offers = page.getByRole("tab", { name: /^Dashboard offers/ });
  await expect(banners).toHaveAttribute("aria-selected", "true");
  await offers.click();
  await expect(offers).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await offers.press("ArrowLeft");
  await expect(banners).toHaveAttribute("aria-selected", "true");
  expect((await offers.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await noOverflow(page);
});

test("opening a notification reduces the badge, removes its preview and preserves history", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client");
  const items = [1, 2].map((index) => ({ id: `${FIXTURE_ID.slice(0, -1)}${index}`, type: "admin_broadcast", title: `Update ${index}`, body: "Synthetic notification", href: "/dashboard/notifications", read_at: null as string | null, created_at: "2026-09-14T10:00:00Z" }));
  await page.route("**/api/v1/notifications**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("unread-count")) return route.fulfill({ json: { count: items.filter((item) => !item.read_at).length } });
    if (pathname.endsWith("/read")) {
      const item = items.find((item) => pathname.includes(item.id))!;
      item.read_at = "2026-09-14T11:00:00Z";
      return route.fulfill({ json: item });
    }
    return route.fulfill({ json: { notifications: items } });
  });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Notifications, 2 unread" }).click();
  await page.getByRole("link", { name: /Update 1/ }).click();
  await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
  await page.getByRole("button", { name: "Notifications, 1 unread" }).click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover.getByText("Update 1", { exact: true })).toHaveCount(0);
  await expect(popover.getByText("Update 2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("main").getByText("Update 1", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
});

test("loan row whitespace and keyboard activation open the application", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client");
  await page.route("**/api/v1/loans/applications", (route) => route.fulfill({ json: { applications: [{ id: FIXTURE_ID, loan_type: { label: "Home Loan" }, status: "new", amount_requested: "500000", amount_sanctioned: null, opened_at: "2026-09-01T12:00:00Z" }] } }));
  await page.goto("/dashboard");
  const row = page.getByRole("row", { name: "Open Home Loan application" });
  await row.locator("td").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/loans/${FIXTURE_ID}`));
  await page.goto("/dashboard");
  await page.getByRole("row", { name: "Open Home Loan application" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(`/dashboard/loans/${FIXTURE_ID}`));
});

test("a failed read restores only that notification after another read succeeds", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client");
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>((resolve) => { releaseFailure = resolve; });
  const items = [1, 2].map((index) => ({ id: `${FIXTURE_ID.slice(0, -1)}${index}`, type: "admin_broadcast", title: `Read check ${index}`, body: "Synthetic read rollback", href: null, read_at: null as string | null, created_at: "2026-09-14T10:00:00Z" }));
  await page.route("**/api/v1/notifications**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("unread-count")) return route.fulfill({ json: { count: items.filter((item) => !item.read_at).length } });
    if (pathname.endsWith("/read")) {
      const item = items.find((item) => pathname.includes(item.id))!;
      if (item === items[0]) {
        await failureGate;
        return route.fulfill({ status: 400, json: { detail: "Synthetic read failure" } });
      }
      item.read_at = "2026-09-14T11:00:00Z";
      return route.fulfill({ json: item });
    }
    return route.fulfill({ json: { notifications: items } });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications, 2 unread" }).click();
  await page.getByRole("button", { name: /Read check 1/ }).click();
  await page.getByRole("button", { name: /Read check 2/ }).click();
  await expect.poll(() => items[1].read_at).not.toBeNull();
  releaseFailure();
  await expect(page.getByRole("button", { name: "Notifications, 1 unread" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Read check 1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Read check 2/ })).toHaveCount(0);
});

test("property prices and complete detail windows fit mobile and desktop", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "client", "real_estate");
  await page.route("**/api/v1/properties", (route) => route.fulfill({ json: { properties: [sample] } }));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/dashboard/explore/apartments");
      const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(details.project_name, { exact: true }) }).first();
      const price = card.getByText("₹1.16 Cr", { exact: true });
      await expect(price).toBeVisible();
      const box = (await card.boundingBox())!;
      const priceBox = (await price.boundingBox())!;
      expect(priceBox.y + priceBox.height).toBeLessThan(box.y + box.height);
      await card.getByRole("button", { name: "View details" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: details.project_name })).toBeVisible();
      await expect(dialog.getByText("4 towers · 160 units")).toBeAttached();
      await expect(dialog.getByText(details.about_project)).toBeAttached();
      await expect(dialog.getByRole("link", { name: "Open full listing" })).toHaveAttribute("href", `/dashboard/properties/${FIXTURE_ID}`);
      await noOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`property-${colorScheme}-${width}.png`) });
      if (colorScheme === "light" && width === 1440) {
        const html = await page.evaluate(() => {
          const clone = document.documentElement.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script").forEach((script) => script.remove());
          const base = document.createElement("base");
          base.href = location.origin;
          clone.querySelector("head")!.prepend(base);
          const title = clone.querySelector("title");
          if (title) title.textContent = "Sample property · static design preview";
          return `<!doctype html>${clone.outerHTML}`;
        });
        await writeFile(testInfo.outputPath("property-preview.html"), html);
      }
      await page.keyboard.press("Escape");
      await expect(card.getByRole("button", { name: "View details" })).toBeFocused();
    }
  }
});

test("sidebar logo and panel toggle sit side by side in both states", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "client");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  for (const name of ["Expand sidebar", "Collapse sidebar"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    await expect(toggle).toBeVisible();
    const brand = page.locator("[data-sidebar-brand]");
    const visibleLogo = brand.locator('img[class~="opacity-100"]');
    await expect(visibleLogo).toHaveCount(1);
    await expect.poll(() => visibleLogo.evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
    const logo = (await brand.getByRole("link").boundingBox())!;
    const button = (await toggle.boundingBox())!;
    expect(logo.x + logo.width).toBeLessThanOrEqual(button.x + 1);
    expect(Math.abs(logo.y - button.y)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath(`${name.replaceAll(" ", "-")}.png`) });
    await toggle.click();
  }
});

test("sub admin can inspect bonus rules and payout history without a payout action", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "sub_admin");
  await page.route("**/api/v1/referral-bonus-config", (route) => route.fulfill({ json: { configs: [{ id: FIXTURE_ID, bonus_amount: "2500", business_line: "loans", rule: { minimum_disbursal: 100000 }, active: true, is_referenced: true, created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-14T12:00:00Z" }] } }));
  await page.route("**/api/v1/referral-bonus-config/payout-activity/recent", (route) => route.fulfill({ json: { activity: [{ id: FIXTURE_ID, description: "Sample referral settlement", business_line: "loans", amount_paise: 250000, currency: "INR", status: "paid", created_at: "2026-09-14T12:00:00Z" }] } }));
  await page.goto("/dashboard/referral-rules");
  await page.getByRole("link").filter({ hasText: "minimum disbursal" }).click();
  await expect(page.getByRole("heading", { name: "Bonus rule details" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("bonus-rule.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("link").filter({ hasText: "Sample referral settlement" }).press("Enter");
  await expect(page.getByRole("heading", { name: "Payout activity details" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^(pay|approve)(\s|$)/i })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
});

test("media window has room for the artwork and editable details", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "sub_admin");
  const asset = { id: FIXTURE_ID, title: "Sample campaign artwork", alt_text: "Sample property illustration", image_url: property.image, usage_type: "dashboard_offer", business_line: "both", active: true, tags: ["sample"], source_type: "bundled", source_reference: "Repository illustration", mime_type: "image/png", width: 1600, height: 700, byte_size: 120000, usage_count: 0, usages: [] };
  await page.route("**/api/v1/campaign-media**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith(FIXTURE_ID) ? asset : { assets: [asset] } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/media-library");
  await page.getByRole("button", { name: /Sample campaign artwork/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Internal title")).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(900);
  await page.screenshot({ path: testInfo.outputPath("media-details.png") });
  for (const width of [320, 768]) { await page.setViewportSize({ width, height: 800 }); await noOverflow(page); }
});

test("telecaller can find a property beyond the first 1000 without rendering a giant menu", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "telecaller", "real_estate");
  await page.route(`**/api/v1/telecaller/leads/${FIXTURE_ID}`, (route) => route.fulfill({ json: { id: FIXTURE_ID, name: "Sample lead", mobile: "+919876543210", business_line: "real_estate", status: "new", created_at: "2026-09-01T12:00:00Z", activities: [], tasks: [], loan_applications: [], property_deals: [] } }));
  await page.route("**/api/v1/properties", (route) => route.fulfill({ json: { properties: Array.from({ length: 1200 }, (_, index) => ({ ...sample, id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: `Courtyard apartment ${index}`, location: index === 1199 ? "Unique Baner location" : "Pune" })) } }));
  await page.goto(`/dashboard/leads/${FIXTURE_ID}`);
  await page.getByRole("combobox", { name: /Property/ }).click();
  await expect(page.getByRole("option")).toHaveCount(50);
  await page.getByRole("combobox", { name: "Search properties" }).fill("Unique Baner");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: /Courtyard apartment 1199/ }).click();
  await expect(page.getByRole("combobox", { name: /Property/ })).toContainText("Courtyard apartment 1199");
});

test("WhatsApp referral sharing uses its original green", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client");
  await page.route("**/api/v1/referrals/me", (route) => route.fulfill({ json: { code: "AB12CD34", eligible: true, ineligible_reason: null, stats: { total: 0, accrued: 0, paid: 0, accrued_amount_paise: 0, paid_amount_paise: 0 } } }));
  await page.goto("/dashboard/referrals");
  await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toHaveCSS("background-color", "rgb(37, 211, 102)");
});

test("browser policy permits multipart uploads to the configured storage origin", async ({ page }) => {
  let posted = false;
  await page.route("http://localhost:9000/task-documents", async (route) => {
    posted = route.request().method() === "POST" && (await route.request().headerValue("content-type"))?.startsWith("multipart/form-data;") === true;
    await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await page.goto("/login");
  const status = await page.evaluate(async () => {
    const body = new FormData();
    body.append("key", "synthetic-upload-check");
    body.append("file", new File(["Synthetic document only"], "sample.txt", { type: "text/plain" }));
    return (await fetch("http://localhost:9000/task-documents", { method: "POST", body })).status;
  });
  expect(status).toBe(204);
  expect(posted).toBe(true);
});
