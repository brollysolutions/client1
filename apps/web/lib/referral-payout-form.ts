// Pure form-state -> ReferralPayoutRequest builder + validator for the admin
// "pay bonus" dialog. Unlike lib/payout-form.ts's full PayoutCreate form, this
// carries no recipient/type/amount/idempotency-key fields at all — recipient
// and amount come from the referral row, and the idempotency key is derived
// server-side from the referral id (a client-chosen key let two concurrent
// "Pay bonus" clicks each dodge the dedupe guard and create a second,
// orphaned payout — review fix, 2026-07-27). Only the destination the
// referrer actually receives money at is caller-supplied, so this reuses
// payout-form.ts's destination options rather than duplicating them.
import { DESTINATION_OPTIONS, type PayoutDestination } from "@/lib/payout-form";
import type { ReferralPayoutRequest } from "@/lib/admin-referrals-api";

export { DESTINATION_OPTIONS };

export type ReferralPayoutFormState = {
  destinationType: PayoutDestination | "";
  vpa: string;
  ifsc: string;
  accountNumber: string;
  accountName: string;
};

export const EMPTY_REFERRAL_PAYOUT_FORM: ReferralPayoutFormState = {
  destinationType: "",
  vpa: "",
  ifsc: "",
  accountNumber: "",
  accountName: "",
};

export function validateReferralPayoutForm(
  form: ReferralPayoutFormState,
): Record<string, string> {
  const errs: Record<string, string> = {};

  if (form.destinationType === "") {
    errs.destinationType = "Choose a destination.";
  } else if (form.destinationType === "vpa") {
    if (!form.vpa.trim() || !form.vpa.includes("@")) {
      errs.vpa = "Enter a valid UPI VPA (name@bank).";
    }
  } else {
    if (!form.ifsc.trim()) errs.ifsc = "IFSC is required.";
    if (form.accountNumber.trim().length < 6) {
      errs.accountNumber = "Account number must be at least 6 digits.";
    }
  }

  return errs;
}

export function buildReferralPayoutPayload(
  form: ReferralPayoutFormState,
): ReferralPayoutRequest {
  const destination =
    form.destinationType === "bank_account"
      ? {
          ifsc: form.ifsc.trim(),
          account_number: form.accountNumber.trim(),
          name: form.accountName.trim() || null,
        }
      : { vpa: form.vpa.trim() };

  return {
    destination_type: form.destinationType as PayoutDestination,
    destination,
  };
}
