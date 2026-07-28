import { describe, expect, it } from "vitest";

import { isAvailable } from "@/lib/loan-config";

const BANK = "bank-1";
const LOAN_TYPE = "loan-type-1";

describe("isAvailable()", () => {
  it("is available when no entry exists for the pair", () => {
    expect(isAvailable([], BANK, LOAN_TYPE)).toBe(true);
  });

  it("is unavailable when an explicit available=false entry exists", () => {
    expect(
      isAvailable(
        [{ bank_id: BANK, loan_type_id: LOAN_TYPE, available: false }],
        BANK,
        LOAN_TYPE,
      ),
    ).toBe(false);
  });

  it("is available when an explicit available=true entry exists", () => {
    expect(
      isAvailable([{ bank_id: BANK, loan_type_id: LOAN_TYPE, available: true }], BANK, LOAN_TYPE),
    ).toBe(true);
  });

  it("ignores entries for a different bank", () => {
    expect(
      isAvailable(
        [{ bank_id: "other-bank", loan_type_id: LOAN_TYPE, available: false }],
        BANK,
        LOAN_TYPE,
      ),
    ).toBe(true);
  });

  it("ignores entries for a different loan type", () => {
    expect(
      isAvailable(
        [{ bank_id: BANK, loan_type_id: "other-loan-type", available: false }],
        BANK,
        LOAN_TYPE,
      ),
    ).toBe(true);
  });
});
