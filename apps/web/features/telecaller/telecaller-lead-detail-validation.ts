import {
  dateError,
  decimalError,
  requiredTextError,
  type FieldErrors,
  type ValidationError,
} from "@/lib/form-validation";

export type LoanTransactionField = "bankName" | "amount" | "interestRate" | "txnDate";

export type LoanTransactionValues = {
  bankName: string;
  amount: string;
  interestRate: string;
  txnDate: string;
};

export function validateLoanTransaction(
  values: LoanTransactionValues,
): FieldErrors<LoanTransactionField> {
  const errors: FieldErrors<LoanTransactionField> = {
    bankName: requiredTextError(values.bankName, "Bank", 200),
    amount: decimalError(values.amount, "Amount", {
      required: true,
      minExclusive: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    interestRate: decimalError(values.interestRate, "Interest rate", {
      required: true,
      min: 0,
      max: 100,
      decimalPlaces: 3,
    }),
    txnDate: dateError(values.txnDate, "Transaction date", { required: true }),
  };

  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [LoanTransactionField, string] =>
      Boolean(entry[1]),
    ),
  );
}

export function futureLocalDateTimeError(
  value: string,
  label: string,
  { required = false, now = new Date() }: { required?: boolean; now?: Date } = {},
): ValidationError {
  const normalized = value.trim();
  if (!normalized) return required ? `${label} is required.` : undefined;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return `Enter a valid ${label.toLowerCase()}.`;
  return parsed <= now ? `${label} must be in the future.` : undefined;
}

export type FieldTaskField = "notes" | "dueAt";

export function validateFieldTask(
  values: { notes: string; dueAt: string },
  now = new Date(),
): FieldErrors<FieldTaskField> {
  const errors: FieldErrors<FieldTaskField> = {
    notes: requiredTextError(values.notes, "Task description", 1000),
    dueAt: futureLocalDateTimeError(values.dueAt, "Due date and time", { now }),
  };

  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [FieldTaskField, string] => Boolean(entry[1])),
  );
}

export type CallLogField = "followUpAt" | "notes";

export function validateCallLog(
  values: { followUpAt: string; notes: string },
  now = new Date(),
): FieldErrors<CallLogField> {
  const errors: FieldErrors<CallLogField> = {
    followUpAt: futureLocalDateTimeError(values.followUpAt, "Follow-up date and time", { now }),
    notes:
      values.notes.length > 1000 ? "Notes must be 1000 characters or fewer." : undefined,
  };

  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [CallLogField, string] => Boolean(entry[1])),
  );
}

export type LoanProgressTermsField = "amountSanctioned" | "interestRate" | "processingFee";

export function validateLoanProgressTerms(values: {
  amountSanctioned: string;
  interestRate: string;
  processingFee: string;
}): FieldErrors<LoanProgressTermsField> {
  const errors: FieldErrors<LoanProgressTermsField> = {
    amountSanctioned: decimalError(values.amountSanctioned, "Sanctioned amount", {
      minExclusive: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    interestRate: decimalError(values.interestRate, "Interest rate", {
      min: 0,
      max: 100,
      decimalPlaces: 3,
    }),
    processingFee: decimalError(values.processingFee, "Processing fee", {
      min: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
  };

  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [LoanProgressTermsField, string] =>
      Boolean(entry[1]),
    ),
  );
}

export type PropertyDealTermsField = "priceQuoted" | "bookingAmount" | "form";

export function validatePropertyDealTerms(values: {
  priceQuoted: string;
  bookingAmount: string;
}): FieldErrors<PropertyDealTermsField> {
  const errors: FieldErrors<PropertyDealTermsField> = {
    priceQuoted: decimalError(values.priceQuoted, "Price quoted", {
      minExclusive: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    bookingAmount: decimalError(values.bookingAmount, "Booking amount", {
      minExclusive: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    form:
      !values.priceQuoted.trim() && !values.bookingAmount.trim()
        ? "Enter a quoted price or booking amount before saving."
        : undefined,
  };

  return Object.fromEntries(
    Object.entries(errors).filter((entry): entry is [PropertyDealTermsField, string] =>
      Boolean(entry[1]),
    ),
  );
}
