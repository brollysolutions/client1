// Pure form-state -> CommissionPayoutRequest builder + validator for the
// admin "pay commission" dialog. Mirrors lib/referral-payout-form.ts exactly
// (destination-only form; amount and recipient come from the commission
// row, and the idempotency key is derived server-side from the commission
// id) — kept as its own file rather than shared, since the two payout types
// are otherwise unrelated call sites and a shared base would obscure more
// than it saves for two fields.
import {
  DESTINATION_OPTIONS,
  validatePayoutDestinationForm,
  type PayoutDestination,
} from "@/lib/payout-form";
import type { CommissionPayoutRequest } from "@/lib/admin-commissions-api";

export { DESTINATION_OPTIONS };

export type CommissionPayoutFormState = {
  destinationType: PayoutDestination | "";
  vpa: string;
  ifsc: string;
  accountNumber: string;
  accountName: string;
};

export const EMPTY_COMMISSION_PAYOUT_FORM: CommissionPayoutFormState = {
  destinationType: "",
  vpa: "",
  ifsc: "",
  accountNumber: "",
  accountName: "",
};

export function validateCommissionPayoutForm(
  form: CommissionPayoutFormState,
): Record<string, string> {
  return validatePayoutDestinationForm(form);
}

export function buildCommissionPayoutPayload(
  form: CommissionPayoutFormState,
): CommissionPayoutRequest {
  const destination =
    form.destinationType === "bank_account"
      ? {
          ifsc: form.ifsc.trim(),
          account_number: form.accountNumber.trim(),
          name: form.accountName.trim() || null,
        }
      : form.destinationType === "vpa"
        ? { vpa: form.vpa.trim() }
        : {};

  return {
    destination_type: form.destinationType as PayoutDestination,
    destination,
  };
}
