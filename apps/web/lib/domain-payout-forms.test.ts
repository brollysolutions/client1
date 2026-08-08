import { describe, expect, it } from "vitest";

import {
  buildCommissionPayoutPayload,
  EMPTY_COMMISSION_PAYOUT_FORM,
  validateCommissionPayoutForm,
} from "@/lib/commission-payout-form";
import {
  buildFeeCashbackPayoutPayload,
  EMPTY_FEE_CASHBACK_PAYOUT_FORM,
  validateFeeCashbackPayoutForm,
} from "@/lib/fee-cashback-payout-form";

describe("domain cheque payout forms", () => {
  it("builds a credential-free commission cheque request", () => {
    const form = {
      ...EMPTY_COMMISSION_PAYOUT_FORM,
      destinationType: "cheque" as const,
      vpa: "stale@bank",
      accountNumber: "1234567890",
    };
    expect(validateCommissionPayoutForm(form)).toEqual({});
    expect(buildCommissionPayoutPayload(form)).toEqual({
      destination_type: "cheque",
      destination: {},
    });
  });

  it("builds a credential-free fee-cashback cheque request", () => {
    const form = {
      ...EMPTY_FEE_CASHBACK_PAYOUT_FORM,
      destinationType: "cheque" as const,
      ifsc: "STALE000001",
      accountNumber: "1234567890",
    };
    expect(validateFeeCashbackPayoutForm(form)).toEqual({});
    expect(buildFeeCashbackPayoutPayload(form)).toEqual({
      destination_type: "cheque",
      destination: {},
    });
  });
});
