import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { UserRole } from "@/lib/auth";
import mobileProperty from "../fixtures/mobile-property.json";

// Layout fixtures only. No request is forwarded to a live account or backend.
type Schema = {
  $ref?: string;
  type?: string;
  format?: string;
  default?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  properties?: Record<string, Schema>;
};
const contract = JSON.parse(readFileSync(path.resolve(process.cwd(), "../../packages/contracts/openapi/openapi.json"), "utf8"));
export const FIXTURE_ID = "10000000-0000-4000-8000-000000000001";

function example(schema: Schema, depth = 0): unknown {
  if (depth > 12) return null;
  if (schema.$ref) return example(contract.components.schemas[schema.$ref.split("/").pop()!], depth + 1);
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return example(schema.anyOf.find((item) => item.type !== "null") ?? {}, depth + 1);
  if (schema.type === "array") return [];
  if (schema.type === "object" || schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => [key, example(value, depth + 1)]));
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.format === "uuid") return FIXTURE_ID;
  if (schema.format === "date-time") return "2026-09-01T12:00:00Z";
  if (schema.format === "date") return "2026-09-01";
  if (schema.type === "string") return "Mobile layout fixture";
  return null;
}

export async function mockMobileApi(page: Page, role?: UserRole, line = "loans") {
  if (role) {
    // The test sets the hint cookie for its configured origin before navigation.
    await page.addInitScript(({ line }) => {
      localStorage.setItem("auth.session_hint", "1");
      localStorage.setItem("dashboard:active-line", line);
      document.cookie = "session_hint=1; path=/";
    }, { line });
  }
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/refresh") {
      const payload = Buffer.from(JSON.stringify({ sub: FIXTURE_ID, role, business_line: role === "agent" ? line : "both", staff_features: ["payout_requests"], exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
      await route.fulfill({ json: { access_token: `fixture.${payload}.fixture`, token_type: "bearer", expires_in: 3600, phone_verified: true, email_verified: true } });
      return;
    }
    if (url.pathname === "/api/v1/auth/me") {
      await route.fulfill({ json: { first_name: "Mobile", last_name: "Reviewer", mobile: "+919876543210", email: "mobile@example.test", email_verified: true, profiles: ["loans", "real_estate"].map((business_line) => ({ business_line, customer_code: "MOBILE-0001" })) } });
      return;
    }
    if (url.pathname === "/api/v1/loans/loan-types") {
      const product = example(contract.components.schemas.LoanTypeRead) as Record<string, unknown>;
      Object.assign(product, {
        id: FIXTURE_ID, name: "personal-loan", label: "Personal Loan", category: "loan", form_version: 1,
        form_schema: { sections: [{ key: "details", title: "Application details", fields: [
          { key: "requested_amount", label: "Requested amount", input_type: "currency", required: true, options: [] },
          { key: "employment_type", label: "Employment type", input_type: "select", required: true, options: [{ value: "salaried", label: "Salaried" }] },
          { key: "notes", label: "Additional details", input_type: "textarea", required: false, options: [] },
        ] }] },
      });
      await route.fulfill({ json: { loan_types: [product] } });
      return;
    }
    if (url.pathname === `/api/v1/properties/${FIXTURE_ID}`) {
      await route.fulfill({ json: {
        ...example(contract.components.schemas.PropertyRead) as Record<string, unknown>,
        ...mobileProperty,
        price_paise: 780000000,
        media_urls: [mobileProperty.image],
        media: [],
        security_deposit_paise: null,
      } });
      return;
    }
    if (url.pathname === "/api/v1/admin/support-tickets") {
      await route.fulfill({ json: { tickets: ["Zebra", "Alpine"].map((name, index) => ({
        id: `10000000-0000-4000-8000-00000000000${index + 1}`,
        subject: `${name} request with a long subject for the mobile review queue`,
        body: "Synthetic support request for layout verification.",
        category: "general", status: "open", resolution_note: null,
        requester_name: "Mobile Reviewer", requester_mobile: "+919876543210",
        created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z",
      })) } });
      return;
    }
    const entry = Object.entries(contract.paths).find(([template]) => new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(url.pathname));
    const operation = entry?.[1] as Record<string, { responses?: Record<string, { content?: Record<string, { schema: Schema }> }> }> | undefined;
    const response = Object.entries(operation?.[route.request().method().toLowerCase()]?.responses ?? {}).find(([status]) => /^2/.test(status));
    const schema = response?.[1].content?.["application/json"]?.schema;
    if (!schema) {
      await route.fulfill({ status: 404, json: { detail: "Synthetic record not found" } });
      return;
    }
    const data = example(schema);
    if (url.pathname === "/api/v1/admin/home" && data && typeof data === "object") {
      Object.assign(data, { pending_agent_applications_count: 1, pending_review: [{ id: FIXTURE_ID, kind: "agent_application", title: "Mobile review with a long application title for narrow screens", business_line: "real_estate", submitted_at: "2026-09-01T12:00:00Z" }] });
    }
    await route.fulfill({ json: data });
  });
}
