import { describe, expect, it } from "vitest";

import {
  fieldVisibilityConfigRecord,
  financialServiceEnquiryRecord,
} from "./operational-records-view";

describe("field visibility operational records", () => {
  it("projects policy metadata without adding an edit action", () => {
    const record = fieldVisibilityConfigRecord({
      id: "805ba7c0-d0f8-4461-8296-617fa19efbc7",
      target_role: "employee",
      entity: "lead",
      field_key: "name",
      mode: "deny",
      updated_at: "2026-09-01T09:30:00Z",
    });

    expect(record.id).toBe("805ba7c0-d0f8-4461-8296-617fa19efbc7");
    expect(record.title).toBe("Lead Name");
    expect(record.subtitle).toBe("Employee / Lead policy");
    expect(record.status).toBe("Deny");
    expect(record.fields.map((field) => field.label)).toEqual([
      "Field key",
      "Last updated",
    ]);
  });
});

describe("financial service enquiry operational records", () => {
  it("projects public workflow metadata without applicant or form details", () => {
    const record = financialServiceEnquiryRecord({
      id: "f04ceace-aa51-44b6-a7ee-8d52b7fe7b17",
      product_label: "Operations credit card",
      product_category: "credit_card",
      status: "submitted",
      form_version: 7,
      submitted_at: "2026-09-02T09:30:00Z",
    });

    expect(record.id).toBe("f04ceace-aa51-44b6-a7ee-8d52b7fe7b17");
    expect(record.title).toBe("Operations credit card");
    expect(record.subtitle).toBe("Credit Card enquiry");
    expect(record.status).toBe("Submitted");
    expect(record.fields.map((field) => field.label)).toEqual([
      "Form version",
      "Submitted",
    ]);
  });
});
