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
    expected: ["Apply for a loan", "Loan media", "Compare Loan Offers", "Referrals"],
    excluded: ["Leads", "Tasks", "Website content"],
    deniedPath: "/dashboard/admin-leads",
  },
  {
    name: "Agent",
    agent: true,
    expected: ["Leads", "Listings", "Earnings", "Transactions"],
    excluded: ["Apply for a loan", "Tasks", "Referrals"],
    deniedPath: "/dashboard/referrals",
  },
  {
    name: "Telecaller",
    promote: ["telecaller", "loans"],
    expected: ["Leads"],
    excluded: ["Apply for a loan", "Tasks", "Earnings"],
    deniedPath: "/dashboard/leads/new",
  },
  {
    name: "Employee",
    promote: ["employee", "real_estate"],
    expected: ["Tasks", "Vehicle arrangements"],
    excluded: ["Apply for a loan", "Leads", "Earnings"],
    deniedPath: "/dashboard/leads",
  },
  {
    name: "Sub Admin",
    promote: ["sub_admin"],
    expected: ["Property listings", "Referral rules", "Banners", "Offers", "Website content"],
    excluded: ["Apply for a loan", "Leads", "Tasks"],
    deniedPath: "/dashboard/admin-leads",
  },
  {
    name: "Admin",
    promote: ["admin"],
    expected: [
      "Lead assignments",
      "Users & staff",
      "Payouts",
      "Website content",
      "Audit log",
    ],
    excluded: ["Apply for a loan", "Leads", "Tasks"],
    deniedPath: "/dashboard/banners/new",
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

test.describe("role-aware dashboard navigation", () => {
  // A cold local Next.js dev container can spend more than a minute compiling
  // the login and dashboard routes before the role assertions begin.
  test.setTimeout(180_000);

  for (const [index, scenario] of scenarios.entries()) {
    test(`${scenario.name} sees only its dashboard capabilities`, async ({ page, request }) => {
      const account = await registerClient(request, index + 100);
      try {
        promoteAccount(account, scenario);
        await logIn(page, account);

        const expandSidebar = page.getByRole("button", { name: "Expand sidebar" });
        if (scenario.name === "Client") {
          await expect(expandSidebar).toBeVisible();
          await expandSidebar.click();
          await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
          await page.reload();
          await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
        } else {
          await expect(expandSidebar).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);
        }
        const navigation = page.locator('nav[aria-label="Workspace"]:visible');
        await expect(navigation).toBeVisible();

        for (const label of scenario.expected) {
          await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(1);
        }
        for (const label of scenario.excluded) {
          await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveCount(0);
        }

        if (scenario.name === "Employee") {
          await expect(
            page
              .locator('main a[href="/dashboard/vehicle-arrangements"]')
              .filter({ hasText: "Review assigned pickups" }),
          ).toBeVisible();
        }

        if (scenario.name === "Admin") {
          await page.goto("/dashboard/users");
          await expect(page.getByRole("heading", { name: "Users & staff" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Create staff account" })).toBeVisible();
          await expect(page.getByRole("heading", { name: "Staff access" })).toBeVisible();
          await expect(page.locator("main form")).toBeVisible();
        }

        await page.goto(scenario.deniedPath);
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
      } finally {
        await deleteAccount(request, account);
      }
    });
  }

  test("Sub Admin retains every authoring route", async ({ page, request }) => {
    const account = await registerClient(request, 200);
    try {
      promoteAccount(account, scenarios[4]);
      await logIn(page, account);
      for (const authoringRoute of [
        { path: "/dashboard/banners/new", heading: "New banner" },
        { path: "/dashboard/offers/new", heading: "New offer" },
        { path: "/dashboard/content/new", heading: "New content block" },
        { path: "/dashboard/property-submit", heading: "Submit a property" },
        { path: "/dashboard/referral-rules", heading: "Referral bonus rules" },
      ]) {
        await page.goto(authoringRoute.path);
        await expect(page.getByRole("heading", { name: authoringRoute.heading })).toBeVisible();
        await expect(page.locator("main form")).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${authoringRoute.path}$`));
      }
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
      await expect(navigation.getByRole("link", { name: "Apply for a loan" })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Loan media" })).toBeVisible();
      await expect(navigation.getByRole("link", { name: "Leads", exact: true })).toHaveCount(0);
      await expect(navigation.getByRole("link", { name: "Tasks", exact: true })).toHaveCount(0);
    } finally {
      await deleteAccount(request, account);
    }
  });
});
