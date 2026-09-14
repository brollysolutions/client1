import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_ID, mockMobileApi } from "./helpers/mobile-fixtures";
import { expectVisibleImagesLoaded } from "./helpers/visible-images";

test.use({ contextOptions: { reducedMotion: "reduce" } });
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });
test.setTimeout(120_000);

async function signIn(page: Page, baseURL: string, role: Parameters<typeof mockMobileApi>[1], line = "loans") {
  await mockMobileApi(page, role, line);
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL }]);
}

async function expectWindow(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("animation-name", "none");
  await expect.poll(async () => (await dialog.boundingBox())?.height ?? 0).toBeGreaterThan(page.viewportSize()!.height - 40);
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.width).toBeGreaterThan(viewport.width - 40);
  expect(box.height).toBeGreaterThan(viewport.height - 40);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  return dialog;
}

test("system appearance stays independent of dashboard Settings choices", async ({ page, baseURL }) => {
  await page.addInitScript(() => localStorage.setItem("dhanadhara:theme", "light"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/help-center", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  const announcement = page.getByRole("region", { name: "Site announcement" });
  await expect(announcement).toHaveCSS("background-color", "rgb(243, 187, 27)");
  await expect(announcement).toHaveCSS("color", "rgb(41, 54, 129)");
  await expect(announcement.getByRole("button", { name: "Dismiss announcement" })).toHaveCSS("color", "rgb(41, 54, 129)");
  await expect(page.getByRole("button", { name: "Change appearance" })).toHaveCount(0);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("button", { name: "Change appearance" })).toHaveCount(0);
  await signIn(page, baseURL!, "client");
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("#dashboard-main-content")).toBeVisible();
  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Light/ }).check();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("radio", { name: /^Light/ })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.goto("/help-center", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.getByRole("radio", { name: /^Light/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: /^Dark/ })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: /^System/ }).check();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("dhanadhara:dashboard-theme"))).toBe("system");
});

for (const role of ["admin", "sub_admin", "agent", "telecaller", "employee"] as const) {
  test(`${role}: appearance choices are available in Settings`, async ({ page, baseURL }) => {
    await signIn(page, baseURL!, role);
    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("radio", { name: /^System/ })).toBeChecked();
    await page.getByRole("radio", { name: /^Dark/ }).check();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("button", { name: "Change appearance" })).toHaveCount(0);
  });
}

test("footer branding stays white and closing CTA stays separate in both system themes", async ({ page }, testInfo) => {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/earn-with-us", { waitUntil: "domcontentloaded" });
      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      const logo = footer.getByRole("link", { name: "Dhanadhara home" });
      await expect(logo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(logo.locator("img")).toHaveCSS("filter", "brightness(0) invert(1)");
      const gap = await footer.evaluate((element) => element.getBoundingClientRect().top - document.querySelector("main")!.getBoundingClientRect().bottom);
      expect(gap).toBeGreaterThanOrEqual(40);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 1024) {
        await footer.locator("summary").filter({ hasText: "Company" }).click();
        await expect(footer.getByRole("link", { name: "Help Center" })).toBeVisible();
      }
      await footer.screenshot({ path: testInfo.outputPath(`footer-${colorScheme}-${width}.png`) });
    }
  }
});

test("dashboard legal and help pages retain their shell on a narrow viewport", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "client");
  await page.setViewportSize({ width: 320, height: 640 });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const slug of ["terms", "privacy", "cookies", "get-started", "help-center"]) {
      await page.goto(`/dashboard/${slug}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#dashboard-main-content h1")).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`help-${theme}-320.png`), fullPage: true });
  }
});

for (const line of ["loans", "real_estate"] as const) {
  test(`${line}: the introducing agent is shown before staff assignment`, async ({ page, baseURL }) => {
    await signIn(page, baseURL!, "client", line);
    await page.route(`**/api/v1/client/lead-details/${line}/contacts`, (route) => route.fulfill({ json: {
      business_line: line, introducing_agent: { name: "Introducing Agent", code: "AG-SYNTHETIC", role: "agent" }, assigned_staff: null,
    } }));
    await page.goto(`/dashboard/${line === "loans" ? "loan-officer" : "agent"}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Introducing Agent", { exact: true })).toBeVisible();
    await expect(page.getByText(/Staff assignment is pending/)).toBeVisible();
    await expect(page.getByText("Introduced by", { exact: true })).toBeVisible();
  });

  test(`${line}: an agent can open a lead with the keyboard and return to its list page`, async ({ page, baseURL }) => {
    await signIn(page, baseURL!, "agent", line);
    const leads = Array.from({ length: 26 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `Synthetic Lead ${index + 1}`, mobile: "+919876543210", business_line: line,
      status: "new", registered: true, editable: true, requirement: { notes: "Synthetic requirement" },
      expires_at: "2099-09-01T12:00:00Z", expired_at: null, created_at: "2026-09-01T12:00:00Z",
    }));
    await page.route("**/api/v1/agent/leads**", (route) => {
      const id = new URL(route.request().url()).pathname.split("/").pop();
      return route.fulfill({ json: id === "leads" ? leads : leads.find((lead) => lead.id === id) });
    });
    await page.goto("/dashboard/leads?page=2", { waitUntil: "domcontentloaded" });
    const lead = page.getByRole("link", { name: "Synthetic Lead 26", exact: true });
    await expect(lead).toBeVisible();
    await lead.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: "Synthetic Lead 26" })).toBeVisible();
    await expect(page.getByText(/Your introduction and staff assignment/)).toBeVisible();
    await page.getByRole("link", { name: "Back to leads" }).click();
    await expect(page).toHaveURL(/\/dashboard\/leads\?page=2$/);
    await expect(lead).toBeVisible();
  });
}

test("cancelled employee tasks require a reason to reopen and regain their actions", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "employee");
  let status = "cancelled";
  let submittedReason = "";
  const task = () => ({ id: FIXTURE_ID, lead_id: FIXTURE_ID, business_line: "loans", task_type: "document_collection", status,
    lead_name: "Synthetic Client", lead_mobile: "+919876543210", lead_contact_mode: "allow",
    notes: "Keep the existing task note", outcome: null, due_at: "2099-09-01T12:00:00Z", created_at: "2026-09-01T12:00:00Z" });
  await page.route(`**/api/v1/employee/tasks/${FIXTURE_ID}`, (route) => route.fulfill({ json: task() }));
  await page.route(`**/api/v1/employee/tasks/${FIXTURE_ID}/reopen`, (route) => {
    submittedReason = route.request().postDataJSON().reason;
    status = "assigned";
    return route.fulfill({ json: task() });
  });
  await page.goto(`/dashboard/tasks/${FIXTURE_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Call Synthetic Client" })).toHaveAttribute("href", "tel:+919876543210");
  await expect(page.getByRole("link", { name: "WhatsApp Synthetic Client" })).toHaveAttribute("href", /^https:\/\/wa.me\/919876543210/);
  await page.getByRole("button", { name: "Reopen task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reopen task", exact: true }).click();
  await expect(dialog.getByLabel("Reason for reopening")).toHaveAttribute("aria-invalid", "true");
  expect(submittedReason).toBe("");
  await dialog.getByLabel("Reason for reopening").fill("Cancelled by mistake; verification can continue");
  await dialog.getByRole("button", { name: "Reopen task", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reopen task", exact: true })).toHaveCount(0);
  await expect(page.getByText("Assigned", { exact: true })).toBeVisible();
  expect(submittedReason).toBe("Cancelled by mistake; verification can continue");
});

test("employees never receive call actions when the contact policy requires an invitation", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "employee");
  await page.route(`**/api/v1/employee/tasks/${FIXTURE_ID}`, (route) => route.fulfill({ json: {
    id: FIXTURE_ID, lead_id: FIXTURE_ID, task_type: "background_check", status: "assigned", lead_contact_mode: "share_link",
    lead_name: "Synthetic Client", lead_mobile: null, notes: null, outcome: null,
  } }));
  await page.goto(`/dashboard/tasks/${FIXTURE_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Create invitation" })).toBeVisible();
  await expect(page.locator('a[href^="tel:"], a[href*="wa.me"]')).toHaveCount(0);
});

test("own tickets return focus without opening the account menu after closing their workspace", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "client");
  await page.route("**/api/v1/support-tickets/tickets", (route) => route.fulfill({ json: { tickets: [{
    id: FIXTURE_ID, category: "general", subject: "Synthetic full ticket", status: "open",
    body: "A long synthetic ticket paragraph. ".repeat(120), created_at: "2026-09-01T12:00:00Z",
  }] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/support", { waitUntil: "domcontentloaded" });
  const ticket = page.getByRole("button", { name: "Synthetic full ticket" });
  await ticket.click();
  const dialog = await expectWindow(page);
  await page.screenshot({ path: testInfo.outputPath("own-ticket-mobile.png") });
  await dialog.getByRole("button", { name: "Close ticket" }).click();
  await expect(ticket).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("admin support tickets and mobile-number reviews have a full workspace", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "admin");
  await page.route("**/api/v1/admin/mobile-change-requests", (route) => route.fulfill({ json: { requests: [{
    id: FIXTURE_ID, requester_name: "Synthetic Number Review", requester_role: "client", status: "pending_review",
    current_mobile: "+919876543210", requested_mobile: "+919876543211", conflicts: [],
  }] } }));
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard/support-tickets", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Synthetic Number Review/ }).click();
    let dialog = await expectWindow(page);
    await expect(dialog.getByLabel(/Identity proof used/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`mobile-review-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await page.getByText(/Zebra request with a long subject/).click();
    dialog = await expectWindow(page);
    await expect(dialog.getByText("Synthetic support request for layout verification.")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("Real Estate home keeps an announced skeleton until its data arrives", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client", "real_estate");
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/api/v1/enquiries**", async (route) => { await pending; await route.fallback(); });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status", { name: "Loading Real Estate home" })).toBeVisible();
  finish();
  await expect(page.getByRole("status", { name: "Loading Real Estate home" })).toBeHidden();
});

test("admin queue tabs hide scrollbar chrome and remain keyboard navigable", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["property-review", "agents", "commissions"]) {
    await page.goto(`/dashboard/${path}`, { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("tablist").first();
    await expect(tabs).toBeVisible();
    await expect(tabs).toHaveCSS("scrollbar-width", "none");
    const triggers = tabs.getByRole("tab");
    await triggers.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(triggers.nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("slash destination suggestions select with the keyboard without submitting a campaign", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "sub_admin");
  await page.route("**/api/v1/banners/templates?**", (route) => route.fulfill({ json: { templates: [{
    id: FIXTURE_ID, placement: "homepage", business_line: "both", label: "Synthetic homepage artwork",
    image_url: "/banner-templates/homepage/general.webp", is_active: true, version: 1,
  }] } }));
  await page.goto("/dashboard/banners", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New banner", exact: true }).click();
  const workspace = page.getByRole("dialog").first();
  await workspace.getByRole("button", { name: "Next", exact: true }).click();
  await workspace.getByRole("radio", { name: /Synthetic homepage artwork/ }).click();
  await workspace.getByRole("button", { name: "Next", exact: true }).click();
  const destination = workspace.getByRole("combobox", { name: "Button destination", exact: true });
  await destination.fill("/");
  const options = page.getByRole("listbox", { name: "Button destinations" });
  await expect(options).toBeVisible();
  await expect(options.getByRole("option", { name: /Help Center/ })).toBeVisible();
  await destination.fill("/help-center");
  await page.keyboard.press("Enter");
  await expect(destination).toHaveValue("/help-center");
  await expect(options).toBeHidden();
  await expect(workspace).toBeVisible();
  await destination.fill("/");
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(workspace).toBeVisible();
});

test("provider logos retain their original artwork in both appearances", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "admin");
  const providers = [
    ["HDFC Bank", "hdfc.svg"], ["State Bank of India", "sbi.png"], ["ICICI Bank", "icici.png"],
    ["Axis Bank", "axis.svg"], ["Kotak Mahindra Bank", "kotak.svg"], ["Punjab National Bank", "pnb.png"],
    ["Bank of Baroda", "bob.png"], ["Canara Bank", "canara.webp"], ["IDFC First Bank", "idfc.svg"], ["YES Bank", "yes.png"],
  ];
  await page.route("**/api/v1/admin/banks", (route) => route.fulfill({ json: { banks: providers.map(([name, asset], index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, legal_name: name,
    provider_type: "bank", logo_url: `/provider-logos/${asset}`, logo_key: null, active: true,
    logo_source: "https://example.test/reviewed-source", logo_verified_at: "2026-09-14T00:00:00Z",
    application_count: 0, offer_count: 0, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  })) } }));
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.goto("/dashboard/loan-config", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Providers & logos" }).click();
  const logos = page.locator('#dashboard-main-content img[src*="provider-logos"]');
  await expect(logos).toHaveCount(10);
  await expect.poll(() => logos.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
    await expectVisibleImagesLoaded(page);
    await page.screenshot({ path: testInfo.outputPath(`providers-${colorScheme}.png`), fullPage: true });
  }
});

test("auth support offers recovery links and readable contact actions on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const support = page.getByRole("button", { name: "Support", exact: true });
  await support.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Help signing in" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Reset your password" })).toHaveAttribute("href", "/forgot-password");
  await expect(dialog.locator('a[href^="tel:"]')).toBeVisible();
  await expect(dialog.locator('a[href^="mailto:"]')).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("auth-support-dark.png") });
  await page.keyboard.press("Escape");
  await expect(support).toBeFocused();
});

test("fixed sky call-to-action surfaces retain navy text in both themes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const closing = page.locator('section[aria-labelledby="closing-cta-heading"]');
  const action = closing.getByRole("link", { name: "Get a callback" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
    await action.scrollIntoViewIfNeeded();
    await expect(action).toHaveCSS("color", "rgb(41, 54, 129)");
    await action.hover();
    await expect(action).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(action).toHaveCSS("color", "rgb(41, 54, 129)");
    await closing.screenshot({ path: testInfo.outputPath(`closing-${colorScheme}.png`) });
  }
});

test("published loan and insurance products form four desktop columns and reflow on mobile", async ({ page, baseURL }, testInfo) => {
  await signIn(page, baseURL!, "client");
  await page.emulateMedia({ colorScheme: "dark" });
  for (const category of ["loans", "insurance"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/dashboard/explore/${category}`, { waitUntil: "domcontentloaded" });
    const cards = page.locator(`#dashboard-main-content a[href^="/dashboard/explore/${category}/"]`);
    await expect(cards.nth(3)).toBeVisible();
    const rowPositions = await cards.evaluateAll((elements) => elements.slice(0, 4).map((element) => Math.round(element.getBoundingClientRect().top)));
    expect(new Set(rowPositions).size).toBe(1);
    await expectVisibleImagesLoaded(page);
    await page.screenshot({ path: testInfo.outputPath(`${category}-four-columns-dark.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => {
      const first = (await cards.first().boundingBox())!;
      const next = (await cards.nth(1).boundingBox())!;
      return next.y >= first.y + first.height;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("sidebar motion can reverse quickly while retaining its logo and keyboard focus", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, "client");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1365, height: 844 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const sidebar = page.locator("aside").getByRole("navigation", { name: "Workspace" });
  const toggle = sidebar.getByRole("button", { name: /(?:Expand|Collapse) sidebar/ });
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await toggle.press("Enter");
  await toggle.press("Enter");
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();
  const logo = sidebar.getByRole("link", { name: "Dhanadhara dashboard" });
  await expect(logo.locator("img")).toHaveCount(2);
  await expect(logo.locator('img[src*="logo-horizontal.png"]')).toHaveCSS("opacity", "1");
  await expect(logo.locator('img[src*="logo-horizontal.png"]')).toHaveCSS("transition-duration", "0.2s");
});
