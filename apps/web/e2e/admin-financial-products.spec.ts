import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { AdminLoanType, ProductCategory, ProductFormDefinition } from "@/lib/loan-config-api";
import { LOAN_PRODUCTS } from "@/lib/products";
import seeds from "./fixtures/financial-product-forms.json";
import { mockMobileApi } from "./helpers/mobile-fixtures";

// Frozen, product-specific seed forms only. Every request is intercepted and no
// real configuration, applicant, provider or account is read or changed.
async function mockCatalogue(page: Page) {
  await mockMobileApi(page, "admin");
  const products: AdminLoanType[] = seeds.map((seed, index) => ({
    ...seed,
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    category: seed.category as ProductCategory,
    form_schema: structuredClone(seed.form_schema) as ProductFormDefinition,
    active: true,
    form_version: 1,
    application_count: 0,
    enquiry_count: 0,
    public_visible: seed.name !== "od-and-dod",
    public_summary: "Synthetic service configuration preview.",
    public_description: "Synthetic catalogue copy for local Admin form verification.",
    public_highlights: [], public_eligibility: [], public_documents: [], public_faq: [],
    homepage_featured: false,
    homepage_feature_order: 1000,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
  }));
  const patches: { id: string; payload: Partial<AdminLoanType> }[] = [];
  await page.route("**/api/v1/admin/loan-types{,/*}", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: { loan_types: products } });
      return;
    }
    const id = new URL(request.url()).pathname.split("/").pop()!;
    const product = products.find((item) => item.id === id)!;
    const payload = request.postDataJSON() as Partial<AdminLoanType>;
    patches.push({ id, payload });
    Object.assign(product, payload, {
      form_version: product.form_version + (payload.form_schema ? 1 : 0),
      updated_at: "2026-09-13T01:00:00Z",
    });
    await route.fulfill({ json: product });
  });
  return { products, patches };
}

async function openProduct(page: Page, label: string) {
  await page.getByRole("textbox", { name: "Search financial products" }).fill(label);
  const row = page.locator("tbody tr").filter({ has: page.getByText(label, { exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const workspace = page.getByRole("dialog", { name: label, exact: true });
  await expect(workspace).toBeVisible();
  return workspace;
}

test.use({ contextOptions: { reducedMotion: "reduce" } });

test("every public service and Equipment Financing expose editable Admin fields and settings", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1365, height: 900 });
  const { products, patches } = await mockCatalogue(page);
  expect(products.map((item) => item.name)).toEqual(expect.arrayContaining(LOAN_PRODUCTS.map((item) => item.id)));
  expect(products.some((item) => item.name === "equipment-financing")).toBe(true);
  await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
  await page.goto("/dashboard/loan-config", { waitUntil: "networkidle" });
  for (const [index, product] of products.entries()) {
    const workspace = await openProduct(page, product.label);
    await expect(workspace.getByLabel("Active for new client submissions")).toBeChecked();
    await workspace.getByLabel(/^Display order/).fill(String(100 + index));
    await workspace.getByRole("tab", { name: "Application form", exact: true }).click();
    const fields = product.form_schema.sections.flatMap((section) => section.fields);
    await expect(workspace.getByLabel(/^Field label/)).toHaveCount(fields.length);
    for (const [fieldIndex, field] of fields.entries()) {
      await expect(workspace.getByLabel(/^Field label/).nth(fieldIndex)).toHaveValue(field.label);
    }
    await workspace.getByLabel(/^Field label/).first().fill(`${fields[0].label} (reviewed)`);
    await workspace.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(workspace.getByText(/Form v2/)).toBeVisible();
    expect(patches.at(-1)?.payload.display_order).toBe(100 + index);
    expect(patches.at(-1)?.payload.form_schema?.sections[0].fields[0].label).toBe(`${fields[0].label} (reviewed)`);
    await workspace.getByRole("button", { name: "Close financial product workspace" }).click();
    await expect(page.getByText(`${fields.length} fields`, { exact: true })).toBeVisible();
  }
  expect(patches).toHaveLength(17);
});

for (const width of [320, 390, 768, 1365]) {
  test(`OD/DOD configuration is usable at ${width}px and retains unsaved fields after a save error`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await mockCatalogue(page);
    await page.context().addCookies([{ name: "session_hint", value: "1", url: baseURL! }]);
    await page.goto("/dashboard/loan-config", { waitUntil: "networkidle" });
    const workspace = await openProduct(page, "OD and DOD");
    await expect(workspace.getByLabel("Visible on Financial Services")).not.toBeChecked();
    await workspace.getByRole("tab", { name: "Application form", exact: true }).click();
    if (width < 640) {
      expect((await workspace.locator("#section-title-0").boundingBox())?.width).toBeGreaterThan(180);
    }
    await expect(workspace.locator("#field-options-facility_type")).toHaveValue("overdraft | Overdraft (OD)\ndrop_line_overdraft | Drop-line Overdraft (DOD)");
    await expect(workspace.locator("#field-key-2-1")).toBeDisabled();
    await workspace.getByLabel(/^Field label/).first().fill("Applicant date of birth");
    await page.route("**/api/v1/admin/loan-types/*", (route) => route.fulfill({ status: 503, json: { detail: "Synthetic save failure. Try again." } }));
    await workspace.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(page.getByText("Couldn't update financial product", { exact: true })).toBeVisible();
    await expect(workspace.getByLabel(/^Field label/).first()).toHaveValue("Applicant date of birth");
    const overflow = await workspace.evaluate((element) => {
      const panel = element.querySelector('[role="tabpanel"][data-state="active"]')!;
      return { page: document.documentElement.scrollWidth > innerWidth, panel: panel.scrollWidth > panel.clientWidth + 1 };
    });
    if (overflow.page || overflow.panel) {
      const layout = JSON.stringify(await page.evaluate(() => ({
        innerWidth, html: document.documentElement.scrollWidth,
        bodyWidth: document.body.clientWidth, bodyStyle: document.body.getAttribute("style"),
        offenders: [...document.querySelectorAll("body *")].map((element) => ({
          tag: element.tagName, className: String(element.className), right: element.getBoundingClientRect().right,
          width: element.getBoundingClientRect().width,
        })).filter((item) => item.right > innerWidth + 1).slice(0, 20),
      })), null, 2);
      const path = testInfo.outputPath("layout-overflow.json");
      await writeFile(path, layout);
      await testInfo.attach("layout-overflow", { contentType: "application/json", path });
    }
    expect(overflow).toEqual({ page: false, panel: false });
    await page.screenshot({ path: testInfo.outputPath(`admin-overdraft-${width}.png`), animations: "disabled" });
    await workspace.getByRole("button", { name: "Close financial product workspace" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
