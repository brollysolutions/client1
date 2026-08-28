import { describe, expect, it } from "vitest";

import { getMoneyPayoutRequestState } from "@/lib/money-ledger";

describe("getMoneyPayoutRequestState()", () => {
  it("allows one payout request only while the row is payable and unclaimed", () => {
    expect(
      getMoneyPayoutRequestState({
        status: "pending",
        payableStatus: "pending",
        payoutId: null,
      }),
    ).toBe("payable");
  });

  it("blocks a second click while the linked payout awaits approval", () => {
    expect(
      getMoneyPayoutRequestState({
        status: "pending",
        payableStatus: "pending",
        payoutId: "payout-1",
      }),
    ).toBe("awaiting_approval");
  });

  it("treats terminal ledger rows as settled regardless of payout linkage", () => {
    expect(
      getMoneyPayoutRequestState({
        status: "paid",
        payableStatus: "pending",
        payoutId: null,
      }),
    ).toBe("settled");
    expect(
      getMoneyPayoutRequestState({
        status: "cancelled",
        payableStatus: "pending",
        payoutId: "payout-1",
      }),
    ).toBe("settled");
  });
});
