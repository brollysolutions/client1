import { describe, expect, it } from "vitest";

import {
  buildReferralPayoutPayload,
  EMPTY_REFERRAL_PAYOUT_FORM,
  validateReferralPayoutForm,
  type ReferralPayoutFormState,
} from "@/lib/referral-payout-form";

function form(overrides: Partial<ReferralPayoutFormState>): ReferralPayoutFormState {
  return { ...EMPTY_REFERRAL_PAYOUT_FORM, ...overrides };
}

describe("buildReferralPayoutPayload()", () => {
  it("builds a vpa destination with no amount, recipient, or idempotency-key fields", () => {
    const payload = buildReferralPayoutPayload(
      form({ destinationType: "vpa", vpa: "payee@okhdfc" }),
    );
    expect(payload).toEqual({
      destination_type: "vpa",
      destination: { vpa: "payee@okhdfc" },
    });
    expect(payload).not.toHaveProperty("amount_paise");
    expect(payload).not.toHaveProperty("recipient_user_uuid");
    expect(payload).not.toHaveProperty("idempotency_key");
  });

  it("builds a bank_account destination", () => {
    const payload = buildReferralPayoutPayload(
      form({
        destinationType: "bank_account",
        ifsc: "HDFC0000123",
        accountNumber: "1234567890",
        accountName: "Test User",
      }),
    );
    expect(payload.destination).toEqual({
      ifsc: "HDFC0000123",
      account_number: "1234567890",
      name: "Test User",
    });
  });

  it("trims destination fields", () => {
    const payload = buildReferralPayoutPayload(
      form({ destinationType: "vpa", vpa: "  payee@okhdfc  " }),
    );
    expect(payload.destination).toEqual({ vpa: "payee@okhdfc" });
  });
});

describe("validateReferralPayoutForm()", () => {
  it("requires a destination on the empty form", () => {
    const errs = validateReferralPayoutForm(EMPTY_REFERRAL_PAYOUT_FORM);
    expect(errs.destinationType).toBeTruthy();
  });

  it("validates a vpa destination requires an @", () => {
    const errs = validateReferralPayoutForm(form({ destinationType: "vpa", vpa: "not-a-vpa" }));
    expect(errs.vpa).toBeTruthy();
  });

  it("validates a bank_account destination requires ifsc and a 6+ digit account number", () => {
    const errs = validateReferralPayoutForm(
      form({ destinationType: "bank_account", ifsc: "", accountNumber: "123" }),
    );
    expect(errs.ifsc).toBeTruthy();
    expect(errs.accountNumber).toBeTruthy();
  });

  it("passes for a fully valid vpa form", () => {
    const errs = validateReferralPayoutForm(
      form({ destinationType: "vpa", vpa: "payee@okhdfc" }),
    );
    expect(errs).toEqual({});
  });

  it("passes for a fully valid bank_account form", () => {
    const errs = validateReferralPayoutForm(
      form({ destinationType: "bank_account", ifsc: "HDFC0000123", accountNumber: "1234567890" }),
    );
    expect(errs).toEqual({});
  });
});
