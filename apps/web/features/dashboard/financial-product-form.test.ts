import { describe, expect, it } from "vitest";

import type { FinancialProduct } from "@/lib/loans";

import { validateProductAnswers } from "./financial-product-form";

const product: FinancialProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "test-product",
  label: "Test Product",
  category: "loan",
  display_order: 1,
  form_version: 1,
  last_updated_at: "2026-08-21T00:00:00Z",
  form_schema: {
    sections: [
      {
        key: "details",
        title: "Details",
        fields: [
          {
            key: "income_source",
            label: "Income Source",
            input_type: "select",
            required: true,
            options: [
              { value: "salaried", label: "Salaried" },
              { value: "self_employed", label: "Self-employed" },
            ],
          },
          {
            key: "employer_name",
            label: "Employer Name",
            input_type: "text",
            required: true,
            condition: { field_key: "income_source", equals: "salaried" },
          },
          {
            key: "current_pincode",
            label: "Current PIN Code",
            input_type: "pincode",
            required: true,
          },
          {
            key: "requested_amount",
            label: "Requested Loan Amount",
            input_type: "currency",
            required: true,
          },
        ],
      },
    ],
  },
};

describe("validateProductAnswers", () => {
  it("reports required and format errors for active fields", () => {
    expect(
      validateProductAnswers(product, {
        income_source: "salaried",
        current_pincode: "01234",
        requested_amount: "0",
      }),
    ).toEqual({
      employer_name: "Employer Name is required.",
      current_pincode: "Enter a valid 6-digit PIN code.",
      requested_amount: "Enter a valid positive amount.",
    });
  });

  it("does not require a conditional field when its condition is not met", () => {
    expect(
      validateProductAnswers(product, {
        income_source: "self_employed",
        current_pincode: "411045",
        requested_amount: "500000",
      }),
    ).toEqual({});
  });
});
