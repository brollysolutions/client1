import type { ApiValidationIssue } from "@/lib/api/client";

export type ValidationError = string | undefined;
export type FieldErrors<Field extends string = string> = Partial<Record<Field, string>>;

type NumericOptions = {
  required?: boolean;
  min?: number;
  minExclusive?: number;
  max?: number;
};

type DecimalOptions = NumericOptions & {
  decimalPlaces?: number;
};

function empty(value: string): boolean {
  return value.trim().length === 0;
}

export function requiredTextError(
  value: string,
  label: string,
  maxLength?: number,
): ValidationError {
  const normalized = value.trim();
  if (!normalized) return `${label} is required.`;
  if (maxLength !== undefined && normalized.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  return undefined;
}

export function optionalTextError(
  value: string,
  label: string,
  maxLength: number,
): ValidationError {
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength
    ? `${label} must be ${maxLength} characters or fewer.`
    : undefined;
}

export function emailError(
  value: string,
  { required = false }: { required?: boolean } = {},
): ValidationError {
  const normalized = value.trim();
  if (!normalized) return required ? "Email address is required." : undefined;
  if (normalized.length > 254) return "Email address must be 254 characters or fewer.";

  // Deliberately modest: reject malformed input without pretending to fully
  // implement the email RFCs. The API remains authoritative.
  const at = normalized.indexOf("@");
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (
    at <= 0 ||
    at !== normalized.lastIndexOf("@") ||
    local.length > 64 ||
    domain.length > 253 ||
    !domain.includes(".") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    /\s/.test(normalized)
  ) {
    return "Enter a valid email address.";
  }
  return undefined;
}

export function e164PhoneError(value: string, { required = false } = {}): ValidationError {
  const normalized = value.trim();
  if (!normalized) return required ? "Mobile number is required." : undefined;
  return /^\+[1-9]\d{6,14}$/.test(normalized)
    ? undefined
    : "Enter a valid international mobile number, including country code.";
}

export function piiFreeOperationalTextError(
  value: string,
  label: string,
  {
    required = false,
    minLength = 1,
    maxLength,
  }: { required?: boolean; minLength?: number; maxLength: number },
): ValidationError {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return required ? `${label} is required.` : undefined;
  if (normalized.length < minLength) {
    return `${label} must be at least ${minLength} characters.`;
  }
  if (normalized.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  if (/\+?\d[\d\s-]{6,}/.test(normalized) || normalized.includes("@")) {
    return `${label} must not include contact or KYC details.`;
  }
  return undefined;
}

function numberRequiredError(value: string, label: string, required: boolean): ValidationError {
  if (!empty(value)) return undefined;
  return required ? `${label} is required.` : undefined;
}

export function integerError(
  value: string,
  label: string,
  { required = false, min, minExclusive, max }: NumericOptions = {},
): ValidationError {
  const missing = numberRequiredError(value, label, required);
  if (missing || empty(value)) return missing;

  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return `${label} must be a whole number.`;
  const numeric = Number(normalized);
  if (!Number.isSafeInteger(numeric)) return `${label} must be a whole number.`;
  if (min !== undefined && numeric < min) return `${label} must be ${min} or more.`;
  if (minExclusive !== undefined && numeric <= minExclusive) {
    return `${label} must be greater than ${minExclusive}.`;
  }
  if (max !== undefined && numeric > max) return `${label} must be ${max} or less.`;
  return undefined;
}

export function decimalError(
  value: string,
  label: string,
  {
    required = false,
    min,
    minExclusive,
    max,
    decimalPlaces = 2,
  }: DecimalOptions = {},
): ValidationError {
  const missing = numberRequiredError(value, label, required);
  if (missing || empty(value)) return missing;

  const normalized = value.trim();
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(normalized)) return `${label} must be a number.`;
  const fractionalPart = normalized.split(".")[1];
  if (fractionalPart && fractionalPart.length > decimalPlaces) {
    return `${label} must use no more than ${decimalPlaces} decimal places.`;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return `${label} must be a number.`;
  if (min !== undefined && numeric < min) return `${label} must be ${min} or more.`;
  if (minExclusive !== undefined && numeric <= minExclusive) {
    return `${label} must be greater than ${minExclusive}.`;
  }
  if (max !== undefined && numeric > max) return `${label} must be ${max} or less.`;
  return undefined;
}

export function dateError(
  value: string,
  label: string,
  { required = false }: { required?: boolean } = {},
): ValidationError {
  const normalized = value.trim();
  if (!normalized) return required ? `${label} is required.` : undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `Enter a valid ${label.toLowerCase()}.`;
  const [year, month, day] = normalized.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
  return undefined;
}

export function focusFirstInvalidField(
  form: Pick<HTMLFormElement, "querySelector">,
): void {
  const field = form.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])');
  field?.focus();
}

export function boundedNumberFilter(
  value: string | undefined,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!(integer ? /^\d+$/.test(normalized) : /^\d+(?:\.\d+)?$/.test(normalized))) {
    return undefined;
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return undefined;
  return normalized;
}

export function fieldErrorProps(
  errorId: string,
  error: ValidationError,
  descriptionId?: string,
): React.AriaAttributes {
  const describedBy = [descriptionId, error ? errorId : undefined].filter(Boolean).join(" ");
  return {
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy || undefined,
  };
}

/**
 * Maps only explicitly allowlisted API locations to local field keys. Unknown
 * locations stay in the form-level error so a future API field cannot mutate
 * arbitrary client state or accidentally expose rejected values.
 */
export function apiIssuesToFieldErrors<Field extends string>(
  issues: ApiValidationIssue[] | undefined,
  fields: Readonly<Record<string, Field>>,
): FieldErrors<Field> {
  const errors: FieldErrors<Field> = {};
  for (const issue of issues ?? []) {
    const field = fields[issue.field];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
