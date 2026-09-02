import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8000";
const REPOSITORY_ROOT = path.resolve(process.cwd(), "../..");

type RegisteredAccount = {
  mobile: string;
  password: string;
  accessToken: string;
};

type RoleScenario = {
  name: string;
  promote?: readonly [role: "admin" | "sub_admin" | "telecaller" | "employee", line?: "loans" | "real_estate"];
  agent?: boolean;
  expected: readonly string[];
  excluded: readonly string[];
  deniedPath: string;
};

const scenarios: readonly RoleScenario[] = [
  {
    name: "Client",
    expected: ["Explore", "Loan media", "Compare Loan Offers", "Referrals"],
    excluded: ["Leads", "Tasks", "Website content"],
    deniedPath: "/dashboard/property-submit",
  },
  {
    name: "Agent",
    agent: true,
    expected: ["Leads", "Listings", "Earnings", "Transactions"],
    excluded: ["Financial products", "Tasks", "Referrals"],
    deniedPath: "/dashboard/referrals",
  },
  {
    name: "Telecaller",
    promote: ["telecaller", "loans"],
    expected: ["Leads"],
    excluded: ["Financial products", "Tasks", "Earnings"],
    deniedPath: "/dashboard/leads/new",
  },
  {
    name: "Employee",
    promote: ["employee", "real_estate"],
    expected: ["Tasks", "Vehicle arrangements"],
    excluded: ["Financial products", "Leads", "Earnings"],
    deniedPath: "/dashboard/leads",
  },
  {
    name: "Sub Admin",
    promote: ["sub_admin"],
    expected: [
      "Property listings",
      "Finance overview",
      "Referral rules",
      "Banners",
      "Dashboard offers",
      "Media library",
    ],
    excluded: ["Financial products", "Leads", "Tasks", "Website content"],
    deniedPath: "/dashboard/admin-leads",
  },
  {
    name: "Admin",
    promote: ["admin"],
    expected: [
      "Lead assignments",
      "Financial products",
      "Users & staff",
      "Payouts",
      "Referral rules",
      "Campaign approvals",
    ],
    excluded: ["Leads", "Tasks", "Website content", "Audit log"],
    deniedPath: "/dashboard/leads",
  },
];

function syntheticMobile(sequence: number): string {
  const suffix = String((Date.now() + sequence) % 1_000_000_000).padStart(9, "0");
  return `+917${suffix}`;
}

async function registerClient(
  request: APIRequestContext,
  sequence: number,
): Promise<RegisteredAccount> {
  const mobile = syntheticMobile(sequence);
  const password = `Codex#N9${Date.now()}${sequence}`;
  const initiate = await request.post(`${API_BASE_URL}/api/v1/auth/register/initiate`, {
    data: {
      first_name: "Navigation",
      last_name: "Browser",
      mobile,
      service_lines: ["loans", "real_estate"],
    },
  });
  expect(initiate.ok(), await initiate.text()).toBeTruthy();
  const initiation = (await initiate.json()) as { otp_hint?: string | null };
  expect(
    initiation.otp_hint,
    "Local browser tests require the API's explicitly enabled dev-only OTP_EXPOSE_HINT setting.",
  ).toMatch(/^\d{6}$/);

  const verify = await request.post(`${API_BASE_URL}/api/v1/auth/register/verify-otp`, {
    data: { mobile, otp: initiation.otp_hint },
  });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const verified = (await verify.json()) as { registration_token: string };

  const complete = await request.post(`${API_BASE_URL}/api/v1/auth/register/set-password`, {
    data: {
      registration_token: verified.registration_token,
      password,
      confirm_password: password,
    },
  });
  expect(complete.ok(), await complete.text()).toBeTruthy();
  const tokens = (await complete.json()) as { access_token: string };
  return { mobile, password, accessToken: tokens.access_token };
}

function promoteAccount(account: RegisteredAccount, scenario: RoleScenario): void {
  if (scenario.agent) {
    execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "api",
        "uv",
        "run",
        "python",
        "-m",
        "app.scripts.seed_agent",
        account.mobile,
      ],
      { cwd: REPOSITORY_ROOT, stdio: "pipe" },
    );
    return;
  }

  if (!scenario.promote) return;
  const [role, line] = scenario.promote;
  const args = [
    "compose",
    "exec",
    "-T",
    "api",
    "uv",
    "run",
    "python",
    "-m",
    "app.scripts.seed_staff",
    account.mobile,
    role,
  ];
  if (line) args.push(line);
  execFileSync("docker", args, { cwd: REPOSITORY_ROOT, stdio: "pipe" });
}

async function logIn(page: Page, account: RegisteredAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(account.mobile.slice(3));
  await page.locator("input#password").fill(account.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
}

async function deleteAccount(
  request: APIRequestContext,
  account: RegisteredAccount,
): Promise<void> {
  const response = await request.delete(`${API_BASE_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
    data: { current_password: account.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createClientLoanApplication(
  request: APIRequestContext,
  account: RegisteredAccount,
): Promise<{ id: string; label: string }> {
  const headers = { Authorization: `Bearer ${account.accessToken}` };
  const typesResponse = await request.get(`${API_BASE_URL}/api/v1/loans/loan-types`, {
    headers,
  });
  expect(typesResponse.ok(), await typesResponse.text()).toBeTruthy();
  const types = (await typesResponse.json()) as {
    loan_types: { id: string; label: string; name: string; form_version: number }[];
  };
  expect(types.loan_types.length).toBeGreaterThan(0);
  const loanType = types.loan_types.find((product) => product.name === "personal-loan");
  expect(loanType).toBeDefined();
  const applicationResponse = await request.post(
    `${API_BASE_URL}/api/v1/loans/applications`,
    {
      headers,
      data: {
        loan_type_id: loanType!.id,
        form_version: loanType!.form_version,
        answers: {
          date_of_birth: "1990-01-01",
          current_location: "Pune",
          current_pincode: "411045",
          employment_type: "salaried",
          net_monthly_salary: "75000",
          work_experience_years: "8",
          requested_amount: "500000",
        },
      },
    },
  );
  expect(applicationResponse.ok(), await applicationResponse.text()).toBeTruthy();
  const application = (await applicationResponse.json()) as { id: string };
  return { id: application.id, label: loanType!.label };
}

// /dashboard/apply no longer accepts a bare visit (it redirects to Explore
// once no product resolves from `?product=`), so tests that need to land on
// the apply form directly look up a real product id first.
async function getLoanTypeId(
  request: APIRequestContext,
  account: RegisteredAccount,
  name: string,
): Promise<string> {
  const headers = { Authorization: `Bearer ${account.accessToken}` };
  const typesResponse = await request.get(`${API_BASE_URL}/api/v1/loans/loan-types`, {
    headers,
  });
  expect(typesResponse.ok(), await typesResponse.text()).toBeTruthy();
  const types = (await typesResponse.json()) as { loan_types: { id: string; name: string }[] };
  const loanType = types.loan_types.find((product) => product.name === name);
  expect(loanType).toBeDefined();
  return loanType!.id;
}

test.describe("role-aware dashboard navigation", () => {
  // A cold local Next.js dev container can spend more than a minute compiling
  // the login and dashboard routes before the role assertions begin.
  test.setTimeout(180_000);

  test("Client dashboard supports bypass navigation and reduced motion", async ({ page, request }) => {
    const account = await registerClient(request, 50);
    try {
      await logIn(page, account);

      // The local Next.js dev toolbar owns a shadow-DOM Tab stop ahead of the
      // application. Focus the app's source-ordered first link directly, then
      // verify its visible state and destination behavior.
      await page.goto("/dashboard");
      const skipLink = page.getByRole("link", { name: "Skip to main content" });
      await skipLink.focus();
      await expect(skipLink).toBeFocused();
      await expect
        .poll(() => skipLink.evaluate((element) => element.getBoundingClientRect().top >= 0))
        .toBe(true);
      await page.keyboard.press("Enter");
      await expect(page.locator("#dashboard-main-content")).toBeFocused();

      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect
        .poll(() =>
          page
            .locator("aside")
            .first()
            .evaluate((element) => getComputedStyle(element).transitionProperty),
        )
        .toBe("none");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Open menu" }).click();
      const mobileWorkspace = page.getByRole("dialog", { name: "Workspace" });
      await expect(mobileWorkspace).toBeVisible();
      await expect(mobileWorkspace.getByRole("navigation", { name: "Workspace" })).toBeVisible();
      await mobileWorkspace.getByRole("button", { name: "Close" }).click();
      await expect(mobileWorkspace).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
        true,
      );
    } finally {
      await deleteAccount(request, account);
    }
  });

  for (const [index, scenario] of scenarios.entries()) {
    test(`${scenario.name} sees only its dashboard capabilities`, async ({ page, request }) => {
      const account = await registerClient(request, index + 100);
      try {
        promoteAccount(account, scenario);
        await logIn(page, account);

        const expandSidebar = page.getByRole("button", { name: "Expand sidebar" });
        if (scenario.name === "Client") {
          // The rail always starts collapsed; it only expands within the
          // current session and does not persist across reloads.
          await expect(expandSidebar).toBeVisible();
          await expandSidebar.click();
          await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
          await page.reload();
          await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

          // The loans client home is decluttered: no highlights banner/offers,
          // no workspace eyebrow, and no zero-count metric row.
          await expect(page.getByRole("region", { name: "Dashboard highlights" })).toHaveCount(0);
          await expect(page.getByText("Loans workspace")).toHaveCount(0);
          await expect(page.getByText("Needs attention")).toHaveCount(0);
        } else {
          await expect(expandSidebar).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);
        }
        const navigation = page.locator('nav[aria-label="Workspace"]:visible');
        await expect(navigation).toBeVisible();

        await page.getByRole("button", { name: /Notifications/ }).click();
        await expect(page.getByRole("link", { name: "View all notifications" })).toBeVisible();

        for (const label of scenario.expected) {
          await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(1);
        }
        for (const label of scenario.excluded) {
          await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(0);
        }
        await expect(navigation.getByRole("link", { name: "Operational records" })).toHaveCount(0);

        if (scenario.name === "Employee") {
          await expect(
            page
              .locator('main a[href="/dashboard/vehicle-arrangements"]')
              .filter({ hasText: "Review assigned pickups" }),
          ).toBeVisible();
        }

        await page.goto("/dashboard/settings");
        await expect(
          page.getByRole("heading", {
            name: scenario.name === "Client" ? "Profile" : "Account settings",
            exact: true,
          }),
        ).toBeVisible();

        if (scenario.name === "Admin") {
          await page.goto("/dashboard/operations");
          await expect(page.getByRole("heading", { name: "Operational records", exact: true })).toBeVisible();
          await expect(page.getByRole("searchbox", { name: "Search operational records on this page" })).toBeVisible();

          await page.goto("/dashboard/users");
          await expect(page.getByRole("heading", { name: "Users & staff" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Staff access" })).toBeVisible();
          await page.getByRole("button", { name: "Create staff account", exact: true }).click();
          const createStaffDialog = page.getByRole("dialog", { name: "Create staff account" });
          await expect(createStaffDialog.locator("form")).toBeVisible();
          await createStaffDialog.getByRole("button", { name: "Close staff creation" }).click();
          await expect(createStaffDialog).toBeHidden();

          await page.goto("/dashboard/campaign-approvals");
          await expect(
            page.getByRole("heading", { name: "Campaign approvals", exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("button", { name: "New banner", exact: true })).toHaveCount(0);
          await expect(page.getByRole("button", { name: "New offer", exact: true })).toHaveCount(0);
          await page.goto("/dashboard/media-library");
          await expect(page).toHaveURL(/\/dashboard$/);
        }

        await page.goto(scenario.deniedPath);
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      } finally {
        await deleteAccount(request, account);
      }
    });
  }

  test("Admin can review field visibility policy metadata", async ({ page, request }) => {
    const account = await registerClient(request, 160);
    const adminScenario = scenarios.find((scenario) => scenario.name === "Admin");
    if (!adminScenario) {
      throw new Error("Admin navigation scenario is missing");
    }

    try {
      promoteAccount(account, adminScenario);
      await logIn(page, account);
      await page.goto("/dashboard/operations");

      await expect(page.getByRole("heading", { name: "Operational records", exact: true })).toBeVisible();
      const fieldVisibilityTab = page.getByRole("tab", { name: "Field visibility" });
      await expect(fieldVisibilityTab).toBeVisible();
      const policyResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname ===
            "/api/v1/admin/operations/field-visibility-config",
      );
      await fieldVisibilityTab.click();
      const policyResponse = await policyResponsePromise;
      expect(policyResponse.status()).toBe(200);
      expect(policyResponse.headers()["cache-control"]).toBe("private, no-store");

      const policyPage = (await policyResponse.json()) as {
        configs: Array<{ field_key: string; [key: string]: unknown }>;
        total: number;
      };
      expect(policyPage.configs).toHaveLength(Math.min(policyPage.total, 25));
      expect(policyPage.configs.every((config) => !("updated_by_uuid" in config))).toBe(true);
      if (policyPage.configs.length === 0) {
        await expect(page.getByText("No persisted field visibility overrides.")).toBeVisible();
      } else {
        await expect(
          page.getByText(policyPage.configs[0].field_key, { exact: true }).first(),
        ).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Admin can review minimized card and insurance enquiries", async ({ page, request }) => {
    const account = await registerClient(request, 170);
    const adminScenario = scenarios.find((scenario) => scenario.name === "Admin");
    if (!adminScenario) {
      throw new Error("Admin navigation scenario is missing");
    }

    try {
      promoteAccount(account, adminScenario);
      await logIn(page, account);
      await page.goto("/dashboard/operations");

      await expect(
        page.getByRole("heading", { name: "Operational records", exact: true }),
      ).toBeVisible();
      const financialEnquiriesTab = page.getByRole("tab", { name: "Card & insurance" });
      await expect(financialEnquiriesTab).toBeVisible();
      const enquiryResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname ===
            "/api/v1/admin/operations/financial-service-enquiries",
      );
      await financialEnquiriesTab.click();
      const enquiryResponse = await enquiryResponsePromise;
      expect(enquiryResponse.status()).toBe(200);
      expect(enquiryResponse.headers()["cache-control"]).toBe("private, no-store");

      const enquiryPage = (await enquiryResponse.json()) as {
        enquiries: Array<{
          id: string;
          product_label: string;
          [key: string]: unknown;
        }>;
        total: number;
      };
      expect(enquiryPage.enquiries).toHaveLength(Math.min(enquiryPage.total, 25));
      const safeFields = [
        "form_version",
        "id",
        "product_category",
        "product_label",
        "status",
        "submitted_at",
      ];
      for (const enquiry of enquiryPage.enquiries) {
        expect(Object.keys(enquiry).sort()).toEqual(safeFields);
      }
      if (enquiryPage.enquiries.length === 0) {
        await expect(page.getByText("No card or insurance enquiries yet.")).toBeVisible();
      } else {
        await expect(
          page.getByText(enquiryPage.enquiries[0].product_label, { exact: true }).first(),
        ).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(financialEnquiriesTab).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Sub Admin retains supported authoring routes and retires duplicate pages", async ({ page, request }) => {
    const account = await registerClient(request, 200);
    try {
      promoteAccount(account, scenarios[4]);
      await logIn(page, account);
      for (const authoringRoute of [
        { path: "/dashboard/property-submit", heading: "Submit a property", hasBackLink: true },
        {
          path: "/dashboard/referral-rules",
          heading: "Referral bonus rules",
          hasBackLink: false,
          hasForm: false,
        },
      ]) {
        await page.goto(authoringRoute.path);
        await expect(page.getByRole("heading", { name: authoringRoute.heading })).toBeVisible();
        if (authoringRoute.hasForm !== false) {
          await expect(page.locator("main form")).toBeVisible();
        }
        if (authoringRoute.hasBackLink) {
          await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();
        }
        await expect(page).toHaveURL(new RegExp(`${authoringRoute.path}$`));
      }
      for (const retiredPath of ["/dashboard/banners/new", "/dashboard/offers/new"]) {
        await page.goto(retiredPath);
        await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
      }
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Sub Admin CMS pages open accessible floating authoring workspaces", async ({ page, request }) => {
    const account = await registerClient(request, 250);
    try {
      promoteAccount(account, scenarios[4]);
      await logIn(page, account);

      for (const workspace of [
        { path: "/dashboard/banners", button: "New banner", heading: "New banner", close: "Close workspace" },
        { path: "/dashboard/offers", button: "New offer", heading: "New dashboard offer", close: "Close workspace" },
        { path: "/dashboard/referral-rules", button: "New rule", heading: "New bonus rule", close: "Close referral rule workspace" },
      ]) {
        await page.goto(workspace.path);
        await page.getByRole("button", { name: workspace.button, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: workspace.heading, exact: true }).first()).toBeVisible();
        await expect(dialog.locator("form")).toBeVisible();
        await dialog.getByRole("button", { name: workspace.close }).first().click();
        await expect(dialog).toBeHidden();
      }

      await page.goto("/dashboard/media-library");
      await expect(
        page.getByRole("heading", { name: "Campaign Media Library", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Upload artwork", exact: true })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Search media" })).toBeVisible();

      await page.goto("/dashboard/banner-media");
      await expect(page).toHaveURL(/\/dashboard\/media-library$/);
      await expect(
        page.getByRole("heading", { name: "Campaign Media Library", exact: true }),
      ).toBeVisible();

      // Notification links written before banners and offers became separate
      // pages still point at /dashboard/campaigns; they must keep resolving.
      await page.goto("/dashboard/campaigns?type=offers");
      await expect(page).toHaveURL(/\/dashboard\/offers$/);
      await page.goto("/dashboard/campaigns?type=banners");
      await expect(page).toHaveURL(/\/dashboard\/banners$/);
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Client mobile drawer keeps staff capabilities hidden", async ({ page, request }) => {
    const account = await registerClient(request, 300);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await logIn(page, account);
      await page.getByRole("button", { name: "Open menu" }).click();

      const navigation = page.locator('nav[aria-label="Workspace"]:visible');
      await expect(navigation.getByRole("link", { name: "Explore" })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Loan media" })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Leads", exact: true })).toHaveCount(0);
      await expect(navigation.getByRole("link", { name: "Tasks", exact: true })).toHaveCount(0);
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Client retains the redesigned Loans and Real Estate workspaces", async ({
    context,
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const account = await registerClient(request, 400);
    try {
      const application = await createClientLoanApplication(request, account);
      const personalLoanId = await getLoanTypeId(request, account, "personal-loan");
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: "http://localhost:3000",
      });
      await logIn(page, account);

      for (const surface of [
        { path: "/dashboard", heading: "Your loan journey" },
        { path: `/dashboard/loans/${application.id}`, heading: application.label },
        { path: "/dashboard/explore", heading: "Explore" },
        { path: `/dashboard/apply?product=${personalLoanId}`, heading: "Apply for a financial product" },
        { path: "/dashboard/documents", heading: "Loan media" },
        { path: "/dashboard/loan-offers", heading: "Compare Loan Offers" },
        { path: "/dashboard/loan-officer", heading: "My Loan Officer" },
        { path: "/dashboard/transactions", heading: "Transactions" },
        { path: "/dashboard/referrals", heading: "Referrals" },
        { path: "/dashboard/notifications", heading: "Notifications" },
      ]) {
        await page.goto(surface.path);
        await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
        await expect(page.locator("main header")).toBeVisible();
      }

      await page.goto("/dashboard/referrals");
      const copyButton = page.getByRole("button", { name: "Copy referral code" });
      await expect(copyButton).toBeVisible();
      await copyButton.click();
      await expect(page.getByText("Copied", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Referral code copied" })).toBeVisible();
      const whatsapp = page.getByRole("link", { name: "Share on WhatsApp" });
      await expect(whatsapp).toBeVisible();
      await expect(whatsapp.locator("svg")).toBeVisible();

      await page.getByRole("button", { name: "Switch to Real Estate" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.route("**/api/v1/properties", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            properties: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                active: true,
                age_years: 2,
                amenities: ["parking"],
                area_sqft: 1100,
                bhk: 2,
                category: "apartments",
                city: "Pune",
                construction_status: "ready_to_move",
                created_at: "2026-08-10T08:00:00Z",
                furnishing: "semi_furnished",
                image: null,
                locality: "Baner",
                location: "Baner, Pune",
                media: [],
                media_urls: [],
                meta: "2 bed · 1,100 sqft",
                pincode: "411045",
                price_display: "₹75 L",
                price_paise: 750000000,
                rera_number: "P52100000001",
                title: "Baner Heights",
                type: "Apartment",
              },
            ],
          }),
        });
      });

      await page.goto("/dashboard/explore");
      await expect(page.getByRole("heading", { name: "Explore properties" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
      await page.getByPlaceholder(/Search by locality/).fill("Baner");
      await page.getByRole("option", { name: "Baner", exact: true }).click();
      await expect(page.getByPlaceholder(/Search by locality/)).toHaveValue("Baner");

      for (const surface of [
        { path: "/dashboard/bookmarks", heading: "Bookmarks" },
        { path: "/dashboard/enquiries", heading: "My Enquiries" },
        { path: "/dashboard/site-visits", heading: "Site Visits" },
        { path: "/dashboard/compare", heading: "Compare properties" },
        { path: "/dashboard/agent", heading: "My Agent" },
        { path: "/dashboard/transactions", heading: "Transactions" },
        { path: "/dashboard/referrals", heading: "Referrals" },
      ]) {
        await page.goto(surface.path);
        await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
        await expect(page.locator("main header")).toBeVisible();
      }
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Client submits a product-specific loan form without inline KYC uploads", async ({
    page,
    request,
  }) => {
    const account = await registerClient(request, 450);
    try {
      await logIn(page, account);
      // The apply page has no standalone product picker anymore -- reach it
      // the way a real user now does, via the Explore product page's Apply CTA.
      await page.goto("/dashboard/explore/loans");
      await page.getByRole("link", { name: /^Personal Loan/ }).click();
      await page.getByRole("link", { name: "Apply", exact: true }).click();

      await expect(
        page.getByRole("heading", { name: "Apply for a financial product", exact: true }),
      ).toBeVisible();

      await expect(page.getByLabel("Full Name")).toHaveValue("Navigation Browser");
      await expect(page.getByLabel("Registered Mobile Number")).toHaveValue(account.mobile);
      await page.getByLabel(/Date of Birth/).fill("1990-01-01");
      await page.getByLabel(/Current Location/).fill("Pune");
      await page.getByLabel(/Current PIN Code/).fill("411045");
      await page.getByRole("combobox", { name: /Employment Type/ }).click();
      await page.getByRole("option", { name: "Salaried", exact: true }).click();
      await page.getByLabel(/Net Monthly Salary/).fill("75000");
      await page.getByLabel(/Total Work Experience/).fill("8");
      await page.getByLabel(/Requested Loan Amount/).fill("500000");

      await expect(page.getByText("KYC documents", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel(/Aadhaar|PAN card/)).toHaveCount(0);
      await page.getByRole("button", { name: "Submit application", exact: true }).click();

      await expect(page).toHaveURL(/\/dashboard\/loans\/[0-9a-f-]+$/, { timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Submitted application details", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Pune", { exact: true })).toBeVisible();
      await expect(
        page.getByText("₹5,00,000", { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Client can search locations manually across dashboard property surfaces", async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const account = await registerClient(request, 401);
    try {
      await logIn(page, account);
      await page.getByRole("button", { name: "Switch to Real Estate" }).click();
      await page.setViewportSize({ width: 390, height: 844 });

      await page.route("**/api/v1/properties", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            properties: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                active: true,
                age_years: 2,
                amenities: ["parking"],
                area_sqft: 1100,
                bhk: 2,
                category: "apartments",
                city: "Pune",
                construction_status: "ready_to_move",
                created_at: "2026-08-10T08:00:00Z",
                furnishing: "semi_furnished",
                image: null,
                locality: "Baner",
                location: "Baner, Pune",
                media: [],
                media_urls: [],
                meta: "2 bed · 1,100 sqft",
                pincode: "411045",
                price_display: "₹75 L",
                price_paise: 750000000,
                rera_number: "P52100000001",
                title: "Baner Heights",
                type: "Apartment",
                property_subtype: "standalone_apartment",
              },
              {
                id: "22222222-2222-4222-8222-222222222222",
                active: true,
                age_years: 1,
                amenities: ["parking"],
                area_sqft: 2400,
                bhk: 4,
                category: "apartments",
                city: "Pune",
                construction_status: "ready_to_move",
                created_at: "2026-08-11T08:00:00Z",
                furnishing: "semi_furnished",
                image: null,
                locality: "Wakad",
                location: "Wakad, Pune",
                media: [],
                media_urls: [],
                meta: "4 bed · 2,400 sqft",
                pincode: "411057",
                price_display: "₹1.6 Cr",
                price_paise: 1600000000,
                rera_number: "P52100000002",
                title: "Wakad Gardens",
                type: "Apartment",
                property_subtype: "gated_community_apartment",
              },
            ],
          }),
        });
      });

      // Home is a personal status view now, not a second catalog browser: a
      // freshly registered account has zero bookmarks/enquiries/site-visits,
      // so this exercises the real empty-state path against the live API
      // (only /api/v1/properties is stubbed, for the Explore assertions below).
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "Your property journey" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Find your next property" })).toHaveCount(0);
      // The real-estate client home no longer carries a placement banner, so the
      // seeded demo campaign must not reach this screen.
      await expect(page.getByText("Demo Real Estate workspace")).toHaveCount(0);
      // Scoped to <main>: the sidebar already has its own "Bookmarks" /
      // "My Enquiries" / "Site Visits" nav links, which would otherwise
      // collide with these same-ish names on the Metric cards.
      const homeMain = page.getByRole("main");
      await expect(homeMain.getByRole("link", { name: "Browse properties" })).toBeVisible();
      await expect(homeMain.getByRole("link", { name: "Bookmarks" })).toBeVisible();
      await expect(homeMain.getByRole("link", { name: "Enquiries" })).toBeVisible();
      await expect(homeMain.getByRole("link", { name: "Site visits" })).toBeVisible();
      await expect(homeMain.getByText("Save properties you like")).toBeVisible();
      await expect(homeMain.getByText("No open enquiries")).toBeVisible();
      await expect(homeMain.getByText("No visits scheduled")).toBeVisible();
      // Category quick-links stay lightweight (illustrated cards, no live
      // counts -- those belong to Explore's own per-category rows) but every
      // category is still reachable, including the ones with zero listings.
      await expect(homeMain.getByRole("link", { name: /Residential Houses/ })).toBeVisible();
      await expect(homeMain.getByRole("link", { name: /Commercial/ })).toBeVisible();
      // Home no longer fetches the property catalog at all, so none of its
      // former catalog-browsing UI should appear here.
      await expect(page.getByPlaceholder(/Search by locality, city, PIN code/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
      await expect(page.getByText("No listings yet")).toHaveCount(0);

      // The quick search hands off to Explore rather than filtering in place.
      // It now shares Explore's omnibox (cmdk's Command input renders role
      // "combobox", not "textbox") for the location/property suggestions.
      await page.getByRole("combobox", { name: "Search properties" }).fill("Wakad");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard\/explore\?q=Wakad/);
      await expect(page.getByText("Wakad Gardens").first()).toBeVisible();
      await expect(page.getByText("Baner Heights")).toHaveCount(0);

      // Explore is where the live catalog-browsing surface lives: no separate
      // Browse-by-type grid and no empty category bands. Home still carries
      // the permanent category navigation cards, while Explore shows only
      // categories represented by the live response.
      await page.goto("/dashboard/explore");
      await expect(page.getByRole("heading", { name: "Explore properties" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Residential Houses" })).toHaveCount(0);
      await expect(page.getByText("No listings yet")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "View details" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Add to compare" }).first()).toBeVisible();
      await expect(page.getByText("Property preview")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enquire" })).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "Choose property location" }),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: /current location/i })).toHaveCount(0);
      await page.getByPlaceholder(/Search by locality/).fill("Baner");
      await page.getByRole("option", { name: "Baner", exact: true }).click();
      await expect(page.getByPlaceholder(/Search by locality/)).toHaveValue("Baner");
      await expect(page).toHaveURL(/locality=Baner/);

      await page.getByRole("button", { name: /^Filters/ }).click();
      const filterDialog = page.getByRole("dialog");
      await expect(filterDialog.getByRole("button", { name: /current location/i })).toHaveCount(0);
      await expect(filterDialog.getByText("City", { exact: true })).toBeVisible();
      await expect(filterDialog.getByText("Area / Locality", { exact: true })).toBeVisible();

      // Subtype narrows further than category: both stubbed listings are
      // apartments, only one is a gated community. Drop the locality first so
      // the subtype is doing the narrowing on its own.
      await expect(filterDialog.getByText("Property subtype", { exact: true })).toBeVisible();
      await filterDialog.getByRole("button", { name: "Clear all", exact: true }).click();
      await expect(page).not.toHaveURL(/locality=Baner/);
      await filterDialog
        .getByRole("button", { name: "Gated community apartments", exact: true })
        .click();
      await expect(page).toHaveURL(/subtypes=gated_community_apartment/);
      await filterDialog.getByRole("button", { name: /^Show 1 home/ }).click();
      await expect(page.getByText("1 property found")).toBeVisible();
      await expect(page.getByText("Wakad Gardens").first()).toBeVisible();
      await expect(page.getByText("Baner Heights")).toHaveCount(0);
    } finally {
      await deleteAccount(request, account);
    }
  });
});
