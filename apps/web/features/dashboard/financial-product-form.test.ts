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

const productWithPhone: FinancialProduct = {
  ...product,
  form_schema: {
    sections: [
      {
        ...product.form_schema.sections[0],
        fields: [
          ...product.form_schema.sections[0].fields,
          {
            key: "contact_number",
            label: "Contact Number",
            input_type: "phone",
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

  it("validates a phone field, tolerating a pasted number with internal spaces", () => {
    expect(
      validateProductAnswers(productWithPhone, {
        income_source: "self_employed",
        current_pincode: "411045",
        requested_amount: "500000",
        contact_number: "98765 43210",
      }),
    ).toEqual({});
  });

  it("rejects a phone field that is still invalid after normalization", () => {
    expect(
      validateProductAnswers(productWithPhone, {
        income_source: "self_employed",
        current_pincode: "411045",
        requested_amount: "500000",
        contact_number: "12345",
      }).contact_number,
    ).toBe("Enter a valid 10-digit mobile number.");
  });

  it("mirrors the server bounds for text, integer, currency, and option fields", () => {
    const boundedProduct: FinancialProduct = {
      ...product,
      form_schema: {
        sections: [{
          key: "bounded",
          title: "Bounded",
          fields: [
            { key: "short_text", label: "Short Text", input_type: "text", required: true },
            { key: "count", label: "Count", input_type: "integer", required: true },
            { key: "amount", label: "Amount", input_type: "currency", required: true },
            {
              key: "choice",
              label: "Choice",
              input_type: "select",
              required: true,
              options: [{ value: "allowed", label: "Allowed" }],
            },
            {
              key: "choices",
              label: "Choices",
              input_type: "multi_select",
              required: true,
              options: [{ value: "allowed", label: "Allowed" }],
            },
          ],
        }],
      },
    };

    expect(validateProductAnswers(boundedProduct, {
      short_text: "x".repeat(201),
      count: "1000000000",
      amount: "1000000000000.001",
      choice: "forged",
      choices: ["forged"],
    })).toEqual({
      short_text: "Short Text must be 200 characters or fewer.",
      count: "Count must be a whole number no greater than 999999999.",
      amount: "Amount must be a positive amount no greater than 999999999999.99 with up to 2 decimal places.",
      choice: "Choose a valid option for Choice.",
      choices: "Choose valid options for Choices.",
    });
  });

  it("validates dates, date-of-birth age, and travel date order", () => {
    const dateProduct: FinancialProduct = {
      ...product,
      form_schema: {
        sections: [{
          key: "dates",
          title: "Dates",
          fields: [
            { key: "applicant_date_of_birth", label: "Date of Birth", input_type: "date", required: true },
            { key: "departure_date", label: "Departure Date", input_type: "date", required: true },
            { key: "return_date", label: "Return Date", input_type: "date", required: true },
          ],
        }],
      },
    };

    const errors = validateProductAnswers(dateProduct, {
      applicant_date_of_birth: "2020-01-01",
      departure_date: "2026-08-30",
      return_date: "2026-08-29",
    }, new Date("2026-08-26T12:00:00Z"));

    expect(errors.applicant_date_of_birth).toBe(
      "Date of Birth must correspond to an age between 18 and 100.",
    );
    expect(errors.return_date).toBe("Return Date must be on or after Departure Date.");
  });
});
