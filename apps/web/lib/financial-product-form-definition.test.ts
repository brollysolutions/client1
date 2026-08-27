import { describe, expect, it } from "vitest";

import type { ProductFormDefinition } from "@/lib/loan-config-api";

import { validateProductFormDefinition } from "./financial-product-form-definition";

const valid: ProductFormDefinition = {
  sections: [{
    key: "details",
    title: "Details",
    fields: [{
      key: "requested_amount",
      label: "Requested amount",
      input_type: "currency",
      required: true,
      options: [],
    }],
  }],
};

describe("validateProductFormDefinition", () => {
  it("accepts a bounded canonical loan form", () => {
    expect(validateProductFormDefinition("loan", valid)).toEqual({});
  });

  it("rejects duplicate keys and malformed choice options", () => {
    const definition: ProductFormDefinition = {
      sections: [{
        ...valid.sections[0],
        fields: [
          valid.sections[0].fields[0],
          { ...valid.sections[0].fields[0] },
          {
            key: "choice",
            label: "Choice",
            input_type: "select",
            required: false,
            options: [
              { value: "same", label: "One" },
              { value: "same", label: "Two" },
            ],
          },
        ],
      }],
    };
    const errors = validateProductFormDefinition("loan", definition);
    expect(errors["field.0.1.key"]).toBe("Field keys must be unique across the form.");
    expect(errors["field.0.2.options"]).toContain("unique option keys");
  });
});
