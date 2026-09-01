import {
  dateError,
  decimalError,
  integerError,
  optionalTextError,
  requiredTextError,
  type FieldErrors,
} from "@/lib/form-validation";

export type ProviderOfferDraftValues = {
  productId: string;
  providerId: string;
  name: string;
  summary: string;
  order: string;
  minAmount: string;
  maxAmount: string;
  minRate: string;
  maxRate: string;
  minTenure: string;
  maxTenure: string;
  processingFee: string;
  eligibility: string;
  verifiedOn: string;
  published: boolean;
};

export type ProviderOfferField = Exclude<keyof ProviderOfferDraftValues, "published">;

function orderedRangeError(
  minimum: string,
  maximum: string,
  label: string,
): string | undefined {
  if (!minimum.trim() || !maximum.trim()) return undefined;
  return Number(maximum) < Number(minimum)
    ? `Maximum ${label} cannot be below minimum ${label}.`
    : undefined;
}

export function validateProviderOfferDraft(
  draft: ProviderOfferDraftValues,
  today = new Date(),
): FieldErrors<ProviderOfferField> {
  const errors: FieldErrors<ProviderOfferField> = {
    productId: requiredTextError(draft.productId, "Financial product"),
    providerId: requiredTextError(draft.providerId, "Provider"),
    name: requiredTextError(draft.name, "Offer label", 160),
    summary: optionalTextError(draft.summary, "Public summary", 500),
    order: integerError(draft.order, "Display order", { required: true, min: 0, max: 10000 }),
    minAmount: decimalError(draft.minAmount, "Minimum amount", {
      min: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    maxAmount: decimalError(draft.maxAmount, "Maximum amount", {
      min: 0,
      max: 999_999_999_999.99,
      decimalPlaces: 2,
    }),
    minRate: decimalError(draft.minRate, "Minimum interest rate", {
      min: 0,
      max: 100,
      decimalPlaces: 3,
    }),
    maxRate: decimalError(draft.maxRate, "Maximum interest rate", {
      min: 0,
      max: 100,
      decimalPlaces: 3,
    }),
    minTenure: integerError(draft.minTenure, "Minimum tenure", { min: 1, max: 600 }),
    maxTenure: integerError(draft.maxTenure, "Maximum tenure", { min: 1, max: 600 }),
    processingFee: optionalTextError(draft.processingFee, "Processing fee", 240),
    eligibility: optionalTextError(draft.eligibility, "Eligibility note", 500),
    verifiedOn: dateError(draft.verifiedOn, "Verification date", {
      required: draft.published,
    }),
  };

  if (!errors.maxAmount) {
    errors.maxAmount = orderedRangeError(draft.minAmount, draft.maxAmount, "amount");
  }
  if (!errors.maxRate) {
    errors.maxRate = orderedRangeError(draft.minRate, draft.maxRate, "interest rate");
  }
  if (!errors.maxTenure) {
    errors.maxTenure = orderedRangeError(draft.minTenure, draft.maxTenure, "tenure");
  }
  if (!errors.verifiedOn && draft.verifiedOn) {
    const endOfToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999),
    );
    const verified = new Date(`${draft.verifiedOn}T00:00:00.000Z`);
    if (verified > endOfToday) errors.verifiedOn = "Verification date cannot be in the future.";
  }

  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error)) as FieldErrors<ProviderOfferField>;
}
