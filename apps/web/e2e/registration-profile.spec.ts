import { expect, test } from "@playwright/test";

function tokenWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

test.setTimeout(150_000);

test("registration saves Salaried and an explicitly requested coarse current location", async ({
  context,
  page,
}) => {
  const mobile = "+919876543210";
  const password = `Browser#Pass9${Date.now()}`;
  let savedProfile: Record<string, unknown> | undefined;

  await page.route("**/api/v1/auth/register/initiate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "sent",
        delivery_channel: "none",
        otp_hint: "123456",
      }),
    });
  });
  await page.route("**/api/v1/auth/register/verify-otp", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ registration_token: "registration-token" }),
    });
  });
  await page.route("**/api/v1/auth/register/set-password", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: tokenWith({
          sub: "00000000-0000-4000-8000-000000000001",
          role: "client",
          business_line: "both",
          exp: Math.floor(Date.now() / 1000) + 1800,
          force_reset: false,
        }),
        token_type: "bearer",
        expires_in: 1800,
        phone_verified: true,
        email_verified: false,
      }),
    });
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    if (route.request().method() === "PATCH") {
      savedProfile = route.request().postDataJSON() as Record<string, unknown>;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        first_name: "Browser",
        last_name: "Profile",
        mobile,
        email: null,
        email_verified: false,
        gender: null,
        gender_self_description: null,
        income_source: savedProfile?.income_source ?? null,
        income_amount_minor: savedProfile?.income_amount_minor ?? null,
        income_period: savedProfile?.income_period ?? null,
        occupation: null,
        location: savedProfile?.location ?? null,
        profiles: [],
      }),
    });
  });

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 17.3851, longitude: 78.4867 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          window.setTimeout(() => {
            success({
              coords: { latitude: 17.3851, longitude: 78.4867 },
              timestamp: Date.now(),
            } as GeolocationPosition);
          }, 2_000);
        },
      },
    });
  });

  await page.goto("/register");
  await page.getByLabel("First name").fill("Browser");
  await page.getByLabel("Last name").fill("Profile");
  await page.getByLabel("Phone number").fill(mobile.slice(3));
  await page.getByRole("button", { name: "Loans" }).click();

  const initiateResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/register/initiate"),
  );
  await page.getByRole("button", { name: "Continue" }).click();
  const initiateResponse = await initiateResponsePromise;
  expect(initiateResponse.ok(), await initiateResponse.text()).toBeTruthy();
  const initiation = (await initiateResponse.json()) as { otp_hint?: string | null };
  expect(initiation.otp_hint).toMatch(/^\d{6}$/);

  await page.getByLabel("Enter OTP").fill(initiation.otp_hint ?? "");
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page.getByRole("heading", { name: "Create a password" })).toBeVisible();

  await page.getByLabel("Create password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const completeResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/register/set-password"),
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const completeResponse = await completeResponsePromise;
  expect(completeResponse.ok(), await completeResponse.text()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Complete your profile" })).toBeVisible();
  await expect(page.getByLabel("Postal address")).toHaveCount(0);

  await page.getByLabel("Income source").click();
  await expect(page.getByRole("option", { name: "Net salary" })).toHaveCount(0);
  await page.getByRole("option", { name: "Salaried" }).click();
  await page.getByLabel("Income amount (₹)").fill("50000");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Location")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use current location" })).toBeVisible();
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(page.getByRole("button", { name: "Save and continue" })).toBeDisabled();
  await expect(page.getByLabel("Location")).toHaveValue("17.39° N, 78.49° E");
  await expect(page.getByRole("status")).toContainText("Approximate current location added");

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/me") && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save and continue" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
  expect(await saveResponse.json()).toMatchObject({
    income_source: "salaried",
    location: "17.39° N, 78.49° E",
  });
  expect(savedProfile).toMatchObject({
    income_source: "salaried",
    income_amount_minor: 5_000_000,
    income_period: "monthly",
    location: "17.39° N, 78.49° E",
  });
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
});
