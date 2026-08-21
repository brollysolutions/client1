import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8000";
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";

test.setTimeout(90_000);

type RegisteredAccount = {
  mobile: string;
  password: string;
  accessToken: string;
};

async function registerLoansClient(request: APIRequestContext): Promise<RegisteredAccount> {
  const suffix = String(Date.now() % 1_000_000_000).padStart(9, "0");
  const mobile = `+917${suffix}`;
  const password = `Codex#M9${Date.now()}`;
  const initiate = await request.post(`${API_BASE_URL}/api/v1/auth/register/initiate`, {
    data: {
      first_name: "Media",
      last_name: "Browser",
      mobile,
      service_lines: ["loans"],
    },
  });
  expect(initiate.ok(), await initiate.text()).toBeTruthy();
  const initiation = (await initiate.json()) as { otp_hint?: string | null };
  expect(initiation.otp_hint).toMatch(/^\d{6}$/);

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

async function logIn(page: Page, account: RegisteredAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(account.mobile.slice(3));
  await page.locator("input#password").fill(account.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Dashboard highlights" })).toBeVisible();
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

test("Loans media is grouped, previewable, downloadable, and camera-ready", async ({
  page,
  request,
}) => {
  const account = await registerLoansClient(request);
  try {
    await logIn(page, account);
    await page.route("**/api/v1/loans/applications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          applications: [
            {
              id: APPLICATION_ID,
              loan_type: { id: "22222222-2222-4222-8222-222222222222", label: "Home loan" },
              status: "submitted_to_bank",
              status_reason: null,
              amount_requested: "5000000",
              amount_sanctioned: null,
              interest_rate: null,
              processing_fee: null,
              fee_outcome: null,
              opened_at: "2026-08-01T10:00:00Z",
              closed_at: null,
              form_version: 1,
              form_schema_snapshot: null,
              form_answers: null,
            },
          ],
        }),
      });
    });
    await page.route("**/api/v1/loans/documents", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          documents: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              loan_application_uuid: APPLICATION_ID,
              doc_type: "photo",
              verified: true,
              review_note: null,
              uploaded_at: "2026-08-09T10:00:00Z",
              content_type: "image/png",
              size_bytes: 1024,
              processing_status: "ready",
              preview_url: PIXEL,
              download_url: PIXEL,
            },
            {
              id: "44444444-4444-4444-8444-444444444444",
              loan_application_uuid: APPLICATION_ID,
              doc_type: "bank_statement",
              verified: false,
              review_note: "Upload a complete statement.",
              uploaded_at: "2026-08-08T10:00:00Z",
              content_type: "application/pdf",
              size_bytes: 2048,
              processing_status: "ready",
              preview_url: null,
              download_url: "data:application/pdf;base64,JVBERi0xLjQK",
            },
          ],
        }),
      });
    });

    await page.goto("/dashboard/documents");

    await expect(page.getByRole("heading", { name: "Loan media" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Home loan" })).toBeVisible();
    await expect(page.getByAltText("Photo preview")).toBeVisible();
    await expect(page.getByText("Bank statement")).toBeVisible();
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
    await expect(page.getByText("Needs attention", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download" })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
    const cameraInput = page.locator('input[type="file"][capture="environment"]');
    await expect(cameraInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  } finally {
    await deleteAccount(request, account);
  }
});
