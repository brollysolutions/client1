// Pure form-state -> PayoutCreate builder + validator for the admin payout
// create form. Kept separate from the component so the ₹->paise conversion and
// idempotency-key generation are unit-tested (the one place a bug moves money
// to the wrong place or duplicates a payout).
import type { components } from "@contracts/generated/schema";

type Schemas = components["schemas"];
export type PayoutType = Schemas["PayoutType"];
export type PayoutDestination = Schemas["PayoutDestination"];
export type PayoutCreate = Schemas["PayoutCreate"];

export const TYPE_OPTIONS = [
  { value: "cashback", label: "Cashback" },
  { value: "referral_bonus", label: "Referral bonus" },
  { value: "commission", label: "Commission" },
] as const satisfies readonly { value: PayoutType; label: string }[];

export const DESTINATION_OPTIONS = [
  { value: "vpa", label: "UPI VPA" },
  { value: "bank_account", label: "Bank account" },
  { value: "cheque", label: "Cheque" },
] as const satisfies readonly { value: PayoutDestination; label: string }[];

export const BUSINESS_LINE_OPTIONS = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
] as const;

export type PayoutRecipientChoice = {
  authUserUuid: string;
  name: string;
  code: string | null;
};

export type PayoutFormState = {
  recipient: PayoutRecipientChoice | null;
  type: PayoutType | "";
  businessLine: "" | "loans" | "real_estate";
  amountRupees: string;
  destinationType: PayoutDestination | "";
  vpa: string;
  ifsc: string;
  accountNumber: string;
  accountName: string;
};

export type PayoutDestinationFormState = Pick<
  PayoutFormState,
  "destinationType" | "vpa" | "ifsc" | "accountNumber" | "accountName"
>;

export const EMPTY_PAYOUT_FORM: PayoutFormState = {
  recipient: null,
  type: "",
  businessLine: "",
  amountRupees: "",
  destinationType: "",
  vpa: "",
  ifsc: "",
  accountNumber: "",
  accountName: "",
};

const AMOUNT_PATTERN = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
const MAX_AMOUNT_PAISE = 10_000_000_000;

/**
 * Strict ₹ -> paise: rejects anything the pattern doesn't match outright
 * (unlike lib/property-submit.ts's bare parseFloat, which silently rounds
 * "1.234"). Math.round is load-bearing: 1234.56 * 100 === 123455.99999999999
 * in IEEE 754, so a plain cast would corrupt the amount by a paisa.
 */
export function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) return null;
  const paise = Math.round(Number.parseFloat(trimmed) * 100);
  return paise > 0 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

/**
 * Builds the create payload. Throws if the amount doesn't parse, rather than
 * silently defaulting to 0 paise — this is a pure, exported function and a
 * future caller must not be able to skip validatePayoutForm and money-move a
 * ₹0 payout by accident. The dialog always validates first, so this path is
 * unreachable there.
 */
export function buildPayoutPayload(form: PayoutFormState, idempotencyKey: string): PayoutCreate {
  const amountPaise = rupeesToPaise(form.amountRupees);
  if (amountPaise === null) {
    throw new Error("buildPayoutPayload: amountRupees did not pass validation.");
  }
  if (form.businessLine === "") {
    throw new Error("buildPayoutPayload: businessLine did not pass validation.");
  }

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
    recipient_user_uuid: form.recipient?.authUserUuid ?? "",
    type: form.type as PayoutType,
    business_line: form.businessLine,
    amount_paise: amountPaise,
    destination_type: form.destinationType as PayoutDestination,
    destination,
    idempotency_key: idempotencyKey,
  };
}

export function validatePayoutForm(form: PayoutFormState): Record<string, string> {
  const errs = validatePayoutDestinationForm(form);

  if (form.recipient === null) errs.recipient = "Choose a recipient.";
  if (form.type === "") errs.type = "Choose a payout type.";
  if (form.businessLine === "") errs.businessLine = "Choose a business line.";

  if (rupeesToPaise(form.amountRupees) === null) {
    errs.amountRupees = "Enter an amount greater than 0 (up to two decimals).";
  }

  return errs;
}

export function validatePayoutDestinationForm(
  form: PayoutDestinationFormState,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (form.destinationType === "") {
    errs.destinationType = "Choose a destination.";
  } else if (form.destinationType === "vpa") {
    const vpa = form.vpa.trim();
    if (!vpa || !vpa.includes("@")) {
      errs.vpa = "Enter a valid UPI VPA (name@bank).";
    } else if (vpa.length > 100) {
      errs.vpa = "UPI VPA must be 100 characters or fewer.";
    }
  } else if (form.destinationType === "bank_account") {
    const ifsc = form.ifsc.trim();
    const accountNumber = form.accountNumber.trim();
    if (!ifsc) {
      errs.ifsc = "IFSC is required.";
    } else if (ifsc.length > 20) {
      errs.ifsc = "IFSC must be 20 characters or fewer.";
    }
    if (accountNumber.length < 6) {
      errs.accountNumber = "Account number must be at least 6 characters.";
    } else if (accountNumber.length > 40) {
      errs.accountNumber = "Account number must be 40 characters or fewer.";
    }
    if (form.accountName.trim().length > 120) {
      errs.accountName = "Account name must be 120 characters or fewer.";
    }
  }
  return errs;
}

/** The one impure export here, kept out of the tested pure path above. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
