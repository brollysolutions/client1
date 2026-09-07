import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockMobileApi, FIXTURE_ID } from "./helpers/mobile-fixtures";
import { RESET_MOBILE_KEY, type UserRole } from "@/lib/auth";

test.setTimeout(120_000);

for (const route of ["/", "/login", "/register", "/forgot-password", "/change-mobile", `/staff-invite/${FIXTURE_ID}`, `/agent-invite/${FIXTURE_ID}`]) {
  test(`brand visible on ${route}`, async ({ page }) => {
    await mockMobileApi(page, undefined, "real_estate");
    await page.addInitScript((key) => sessionStorage.setItem(key, "+919876543210"), RESET_MOBILE_KEY);
    for (const width of [320, 1365]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(route);
      const logo = page.getByRole("img", { name: "Dhanadhara", exact: true }).first();
      await expect(logo).toBeVisible();
      await expect(logo).toHaveJSProperty("naturalWidth", 960);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await expect(page.locator("body")).not.toContainText("Grow Wealth");
    }
  });
}

for (const role of ["client", "admin", "sub_admin", "agent", "employee", "telecaller"] as UserRole[]) {
  test(`dashboard brand for ${role}`, async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await mockMobileApi(page, role, "real_estate");
    await page.setViewportSize({ width: 320, height: 850 });
    await page.goto("/dashboard");
    await expect(page.locator("header").getByRole("img", { name: "Dhanadhara" })).toBeVisible();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("img", { name: "Dhanadhara" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1365, height: 850 });
    await expect(page.locator("aside").getByRole("img", { name: "Dhanadhara" })).toBeVisible();
  });
}

for (const slug of ["emi", "loan-against-property", "rent-vs-buy"]) {
  test(`branded local Excel and CSV for ${slug}`, async ({ page }) => {
    await mockMobileApi(page, undefined, "real_estate");
    await page.goto(`/calculators/${slug}`);
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV", exact: true }).click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toMatch(/^dhanadhara-.*\.csv$/);
    const csvText = await readFile((await csv.path())!, "utf8");
    const excelDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Excel", exact: true }).click();
    const excel = await excelDownload;
    expect(excel.suggestedFilename()).toMatch(/^dhanadhara-.*\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile((await excel.path())!);
    const sheet = workbook.getWorksheet("Calculation")!;
    expect(sheet.getImages()).toHaveLength(1);
    const csvRows = csvText.replace(/^\uFEFF/, "").trim().split("\n");
    expect(sheet.getRow(7).values).toEqual([undefined, ...csvRows[0].split(",")]);
    for (const [index, line] of csvRows.slice(1).entries()) {
      expect(sheet.getRow(index + 8).values).toEqual([undefined, ...line.split(",").map(Number)]);
    }
  });
}

test("Excel asset failure keeps CSV available", async ({ page }) => {
  await mockMobileApi(page, undefined, "real_estate");
  await page.goto("/calculators/emi");
  await page.route("**/brand/logo-horizontal.png", (route) => route.fulfill({ status: 503 }));
  await page.getByRole("button", { name: "Download Excel", exact: true }).click();
  await expect(page.getByText("Couldn't create the Excel file")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV", exact: true })).toBeEnabled();
});
