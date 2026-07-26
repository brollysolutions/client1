import { describe, expect, it } from "vitest";

import {
  buildPayoutPayload,
  EMPTY_PAYOUT_FORM,
  rupeesToPaise,
  validatePayoutForm,
  type PayoutFormState,
} from "@/lib/payout-form";

describe("rupeesToPaise()", () => {
  it("converts valid rupee strings to integer paise", () => {
    expect(rupeesToPaise("0.01")).toBe(1);
    expect(rupeesToPaise("1234.56")).toBe(123456);
    expect(rupeesToPaise("1000")).toBe(100_000);
  });

  it("rejects grouped, over-precision, non-positive, and out-of-range input", () => {
    expect(rupeesToPaise("1,000")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("0")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("100000000.01")).toBeNull();
  });
});

function form(overrides: Partial<PayoutFormState>): PayoutFormState {
  return { ...EMPTY_PAYOUT_FORM, ...overrides };
}

describe("buildPayoutPayload()", () => {
  it("emits business_line: null when the select is empty", () => {
    const payload = buildPayoutPayload(
      form({
        recipient: { authUserUuid: "u1", name: "Test User", code: "CL-X" },
        type: "cashback",
        businessLine: "",
        amountRupees: "100",
        destinationType: "vpa",
        vpa: "payee@okhdfc",
      }),
      "idem-key-12345",
    );
    expect(payload.business_line).toBeNull();
    expect(payload.recipient_user_uuid).toBe("u1");
    expect(payload.amount_paise).toBe(10_000);
    expect(payload.destination).toEqual({ vpa: "payee@okhdfc" });
  });

  it("builds a bank_account destination", () => {
    const payload = buildPayoutPayload(
      form({
        recipient: { authUserUuid: "u2", name: "Test User", code: null },
        type: "commission",
        businessLine: "loans",
        amountRupees: "50",
        destinationType: "bank_account",
        ifsc: "HDFC0000123",
        accountNumber: "1234567890",
        accountName: "Test User",
      }),
      "idem-key-67890",
    );
    expect(payload.business_line).toBe("loans");
    expect(payload.destination).toEqual({
      ifsc: "HDFC0000123",
      account_number: "1234567890",
      name: "Test User",
    });
  });
});

describe("validatePayoutForm()", () => {
  it("requires a recipient, type, amount, and destination", () => {
    const errs = validatePayoutForm(EMPTY_PAYOUT_FORM);
    expect(errs.recipient).toBeTruthy();
    expect(errs.type).toBeTruthy();
    expect(errs.amountRupees).toBeTruthy();
    expect(errs.destinationType).toBeTruthy();
  });

  it("validates a vpa destination requires an @", () => {
    const errs = validatePayoutForm(
      form({
        recipient: { authUserUuid: "u1", name: "Test User", code: null },
        type: "cashback",
        amountRupees: "10",
        destinationType: "vpa",
        vpa: "not-a-vpa",
      }),
    );
    expect(errs.vpa).toBeTruthy();
  });

  it("validates a bank_account destination requires ifsc and a 6+ digit account number", () => {
    const errs = validatePayoutForm(
      form({
        recipient: { authUserUuid: "u1", name: "Test User", code: null },
        type: "cashback",
        amountRupees: "10",
        destinationType: "bank_account",
        ifsc: "",
        accountNumber: "123",
      }),
    );
    expect(errs.ifsc).toBeTruthy();
    expect(errs.accountNumber).toBeTruthy();
  });

  it("passes for a fully valid form", () => {
    const errs = validatePayoutForm(
      form({
        recipient: { authUserUuid: "u1", name: "Test User", code: "CL-X" },
        type: "cashback",
        amountRupees: "10",
        destinationType: "vpa",
        vpa: "payee@okhdfc",
      }),
    );
    expect(errs).toEqual({});
  });
});
