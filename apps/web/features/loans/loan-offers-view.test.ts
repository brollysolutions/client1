import { describe, expect, it } from "vitest";

import { banksForDisplay, selectLoanComparisonTypes } from "./loan-offers-view";
import type { Bank, LoanTypeOption } from "@/lib/loans";

function product(category: LoanTypeOption["category"], index: number): LoanTypeOption {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `product-${index}`,
    label: `Product ${index}`,
    category,
    display_order: index,
    form_version: 1,
    form_schema: { sections: [] },
    last_updated_at: "2026-08-21T00:00:00Z",
  };
}

describe("selectLoanComparisonTypes()", () => {
  it("requests participating lenders only for lending products", () => {
    const selected = selectLoanComparisonTypes([
      product("loan", 1),
      product("credit_card", 2),
      product("insurance", 3),
      product("loan", 4),
    ]);

    expect(selected.map((item) => item.category)).toEqual(["loan", "loan"]);
  });

  it("keeps the bank-request fan-out bounded", () => {
    const selected = selectLoanComparisonTypes(
      Array.from({ length: 15 }, (_, index) => product("loan", index)),
    );

    expect(selected).toHaveLength(12);
  });
});

describe("banksForDisplay()", () => {
  const banks = Array.from({ length: 15 }, (_, index) => ({
    id: `00000000-0000-4000-8001-${String(index).padStart(12, "0")}`,
    name: `Bank ${index}`,
    last_updated_at: "2026-08-21T00:00:00Z",
  })) satisfies Bank[];

  it("bounds the initial lender-card DOM without hiding expanded results", () => {
    expect(banksForDisplay(banks, false)).toHaveLength(12);
    expect(banksForDisplay(banks, true)).toHaveLength(15);
  });
});
