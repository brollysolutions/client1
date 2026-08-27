import { describe, expect, it } from "vitest";

import {
  validateCallLog,
  validateFieldTask,
  validateLoanProgressTerms,
  validateLoanTransaction,
  validatePropertyDealTerms,
} from "./telecaller-lead-detail-validation";

describe("Lead Details validation", () => {
  it("requires every loan transaction field", () => {
    expect(
      validateLoanTransaction({ bankName: "", amount: "", interestRate: "", txnDate: "" }),
    ).toEqual({
      bankName: "Bank is required.",
      amount: "Amount is required.",
      interestRate: "Interest rate is required.",
      txnDate: "Transaction date is required.",
    });
  });

  it("enforces the loan transaction numeric storage contract", () => {
    expect(
      validateLoanTransaction({
        bankName: "HDFC",
        amount: "0",
        interestRate: "100.001",
        txnDate: "2026-02-30",
      }),
    ).toEqual({
      amount: "Amount must be greater than 0.",
      interestRate: "Interest rate must be 100 or less.",
      txnDate: "Enter a valid transaction date.",
    });

    expect(
      validateLoanTransaction({
        bankName: "HDFC",
        amount: "1.001",
        interestRate: "8.1234",
        txnDate: "2026-08-27",
      }),
    ).toEqual({
      amount: "Amount must use no more than 2 decimal places.",
      interestRate: "Interest rate must use no more than 3 decimal places.",
    });
  });

  it("accepts a complete loan transaction", () => {
    expect(
      validateLoanTransaction({
        bankName: "HDFC Bank",
        amount: "500000.25",
        interestRate: "8.125",
        txnDate: "2026-08-27",
      }),
    ).toEqual({});
  });

  it("requires meaningful field-task instructions and a valid future due time", () => {
    const now = new Date(2026, 7, 27, 10, 0);

    expect(validateFieldTask({ notes: "", dueAt: "" }, now)).toEqual({
      notes: "Task description is required.",
    });
    expect(
      validateFieldTask({ notes: "Collect documents", dueAt: "2026-08-27T09:00" }, now),
    ).toEqual({ dueAt: "Due date and time must be in the future." });
    expect(
      validateFieldTask({ notes: "Collect documents", dueAt: "2026-08-27T11:00" }, now),
    ).toEqual({});
  });

  it("rejects past call follow-ups", () => {
    const now = new Date(2026, 7, 27, 10, 0);

    expect(validateCallLog({ notes: "", followUpAt: "2026-08-27T09:00" }, now)).toEqual({
      followUpAt: "Follow-up date and time must be in the future.",
    });
    expect(validateCallLog({ notes: "Spoke to the customer", followUpAt: "" }, now)).toEqual({});
  });

  it("validates optional loan progress terms when entered", () => {
    expect(
      validateLoanProgressTerms({
        amountSanctioned: "-1",
        interestRate: "100.001",
        processingFee: "1.001",
      }),
    ).toEqual({
      amountSanctioned: "Sanctioned amount must be greater than 0.",
      interestRate: "Interest rate must be 100 or less.",
      processingFee: "Processing fee must use no more than 2 decimal places.",
    });
  });

  it("requires at least one valid property term", () => {
    expect(validatePropertyDealTerms({ priceQuoted: "", bookingAmount: "" })).toEqual({
      form: "Enter a quoted price or booking amount before saving.",
    });
    expect(validatePropertyDealTerms({ priceQuoted: "8000000.001", bookingAmount: "0" })).toEqual({
      priceQuoted: "Price quoted must use no more than 2 decimal places.",
      bookingAmount: "Booking amount must be greater than 0.",
    });
  });
});
