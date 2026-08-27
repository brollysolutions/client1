import { describe, expect, it, vi } from "vitest";

import {
  decimalError,
  emailError,
  e164PhoneError,
  apiIssuesToFieldErrors,
  boundedNumberFilter,
  fieldErrorProps,
  focusFirstInvalidField,
  integerError,
  piiFreeOperationalTextError,
  requiredTextError,
} from "./form-validation";

describe("shared form validation", () => {
  it("validates required text after trimming", () => {
    expect(requiredTextError("   ", "Name")).toBe("Name is required.");
    expect(requiredTextError("  Charan  ", "Name")).toBeUndefined();
  });

  it("validates optional email and maximum length", () => {
    expect(emailError("")).toBeUndefined();
    expect(emailError("person@example.com")).toBeUndefined();
    expect(emailError("not-an-email")).toBe("Enter a valid email address.");
    expect(emailError(`${"a".repeat(245)}@example.com`)).toBe(
      "Email address must be 254 characters or fewer.",
    );
  });

  it("validates international mobile numbers", () => {
    expect(e164PhoneError("+919876543210", { required: true })).toBeUndefined();
    expect(e164PhoneError("9876543210", { required: true })).toBe(
      "Enter a valid international mobile number, including country code.",
    );
  });

  it("rejects contact details in PII-free operational notes", () => {
    const options = { required: true, minLength: 3, maxLength: 300 };
    expect(
      piiFreeOperationalTextError("branch-visit-case-84", "Reference", options),
    ).toBeUndefined();
    expect(
      piiFreeOperationalTextError("call person@example.com", "Reference", options),
    ).toBe("Reference must not include contact or KYC details.");
    expect(
      piiFreeOperationalTextError("Aadhaar 1234 5678 9012", "Reference", options),
    ).toBe("Reference must not include contact or KYC details.");
  });

  it("validates bounded whole numbers and decimal precision", () => {
    expect(integerError("12", "Count", { min: 1, max: 20 })).toBeUndefined();
    expect(integerError("1.2", "Count", { min: 1, max: 20 })).toBe(
      "Count must be a whole number.",
    );
    expect(integerError("21", "Count", { min: 1, max: 20 })).toBe(
      "Count must be 20 or less.",
    );
    expect(decimalError("10.25", "Amount", { minExclusive: 0, max: 100 })).toBeUndefined();
    expect(decimalError("10.257", "Amount", { minExclusive: 0, max: 100 })).toBe(
      "Amount must use no more than 2 decimal places.",
    );
  });

  it("focuses the first invalid enabled field", () => {
    const focus = vi.fn();
    const form = {
      querySelector: vi.fn(() => ({ focus })),
    } as unknown as HTMLFormElement;

    focusFirstInvalidField(form);

    expect(focus).toHaveBeenCalledOnce();
  });

  it("builds accessible descriptions and allowlists API issue locations", () => {
    expect(fieldErrorProps("email-error", "Invalid", "email-help")).toEqual({
      "aria-invalid": true,
      "aria-describedby": "email-help email-error",
    });
    expect(
      apiIssuesToFieldErrors(
        [
          { field: "destination.ifsc", message: "Field required" },
          { field: "unknown", message: "Do not map this" },
        ],
        { "destination.ifsc": "ifsc" },
      ),
    ).toEqual({ ifsc: "Field required" });
  });

  it("drops malformed or out-of-range optional numeric filters", () => {
    expect(boundedNumberFilter("12.5", { min: 0, max: 100 })).toBe("12.5");
    expect(boundedNumberFilter("NaN", { min: 0, max: 100 })).toBeUndefined();
    expect(boundedNumberFilter("101", { min: 0, max: 100 })).toBeUndefined();
    expect(boundedNumberFilter("1.5", { min: 1, max: 600, integer: true })).toBeUndefined();
  });
});
