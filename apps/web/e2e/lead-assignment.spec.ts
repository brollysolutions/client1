import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

test("registration requires explicit line intent and submits both selected journeys", async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/auth/register/initiate", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
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

  await page.goto("/register");
  await page.getByLabel("First name").fill("Browser");
  await page.getByLabel("Last name").fill("Client");
  await page.getByLabel("Phone number").fill("9876543210");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose at least one service.")).toBeVisible();
  expect(submitted).toBeUndefined();

  const loans = page.getByRole("button", { name: "Loans" });
  const realEstate = page.getByRole("button", { name: "Real Estate" });
  await loans.click();
  await realEstate.click();
  await expect(loans).toHaveAttribute("aria-pressed", "true");
  await expect(realEstate).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Verify your phone" })).toBeVisible();
  expect(submitted).toMatchObject({
    service_lines: ["loans", "real_estate"],
  });
});
