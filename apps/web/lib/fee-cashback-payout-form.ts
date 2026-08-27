// Pure form-state -> FeeCashbackPayoutRequest builder + validator for the
// admin "pay cashback" dialog. Mirrors lib/commission-payout-form.ts exactly
// (destination-only form; amount and recipient come from the cashback row,
// and the idempotency key is derived server-side from the cashback id) —
// kept as its own file rather than shared, since the payout types are
// otherwise unrelated call sites and a shared base would obscure more than
// it saves for two fields.
import {
  DESTINATION_OPTIONS,
  validatePayoutDestinationForm,
  type PayoutDestination,
} from "@/lib/payout-form";
import type { FeeCashbackPayoutRequest } from "@/lib/admin-fee-cashbacks-api";

export { DESTINATION_OPTIONS };

export type FeeCashbackPayoutFormState = {
  destinationType: PayoutDestination | "";
  vpa: string;
  ifsc: string;
  accountNumber: string;
  accountName: string;
};

export const EMPTY_FEE_CASHBACK_PAYOUT_FORM: FeeCashbackPayoutFormState = {
  destinationType: "",
  vpa: "",
  ifsc: "",
  accountNumber: "",
  accountName: "",
};

export function validateFeeCashbackPayoutForm(
  form: FeeCashbackPayoutFormState,
): Record<string, string> {
  return validatePayoutDestinationForm(form);
}

export function buildFeeCashbackPayoutPayload(
  form: FeeCashbackPayoutFormState,
): FeeCashbackPayoutRequest {
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
