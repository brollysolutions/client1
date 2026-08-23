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

function syntheticMobile(sequence: number): string {
  const suffix = String((Date.now() + sequence) % 1_000_000_000).padStart(9, "0");
  return `+917${suffix}`;
}

async function registerClient(
  request: APIRequestContext,
  sequence: number,
): Promise<RegisteredAccount> {
  const mobile = syntheticMobile(sequence);
  const password = `Codex#P9${Date.now()}${sequence}`;
  const initiate = await request.post(`${API_BASE_URL}/api/v1/auth/register/initiate`, {
    data: {
      first_name: "Browser",
      last_name: "Test",
      mobile,
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

async function logInThroughBrowser(page: Page, account: RegisteredAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(account.mobile.slice(3));
  await page.locator("input#password").fill(account.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
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

function promoteToAgent(mobile: string): void {
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "api", "uv", "run", "python", "-m", "app.scripts.seed_agent", mobile],
    { cwd: REPOSITORY_ROOT, stdio: "pipe" },
  );
}

test.describe("authenticated personalization", () => {
  test.setTimeout(60_000);

  test("Client can consent without browser-location capture", async ({ page, request }) => {
    const account = await registerClient(request, 1);
    try {
      await logInThroughBrowser(page, account);

      // The loans client home no longer shows the highlights banner/offers.
      await expect(page.getByRole("heading", { name: "Your loan journey" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Dashboard highlights" })).toHaveCount(0);
      await page.goto("/dashboard/settings");
      await expect(page.getByRole("heading", { name: "Personalized dashboard" })).toBeVisible();

      const consent = page.getByRole("checkbox", {
        name: "Enable personalized dashboard content",
      });
      await expect(consent).not.toBeChecked();
      await consent.click();
      await expect(consent).toBeChecked();

      await expect(page.getByRole("button", { name: /use my location/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /refresh location/i })).toHaveCount(0);
    } finally {
      await deleteAccount(request, account);
    }
  });

  test("Agent receives the line-scoped dashboard and personalization setting", async ({
    page,
    request,
  }) => {
    const account = await registerClient(request, 2);
    try {
      promoteToAgent(account.mobile);
      await logInThroughBrowser(page, account);

      await expect(page.getByRole("heading", { name: "Registration status" })).toBeVisible();
      await expect(page.getByText("Agent code", { exact: true })).toBeVisible();
      await page.goto("/dashboard/settings");
      await expect(page.getByRole("heading", { name: "Personalized dashboard" })).toBeVisible();
    } finally {
      await deleteAccount(request, account);
    }
  });
});
