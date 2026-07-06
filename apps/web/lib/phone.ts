// Indian mobile number helpers, shared across the auth flows and the landing
// lead form. One number, one account (`mobile` is UNIQUE on the backend), so
// normalization has to be consistent everywhere a number is collected.

// Strip a +91 / leading-0 prefix and all non-digits, leaving the bare 10-digit
// subscriber number. A pasted number in any common form still normalizes.
export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

// Indian mobile: 10 digits, leading 6-9.
export function isValidMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(raw));
}

// E.164 form the backend auth contract expects (`^\+[1-9]\d{6,14}$`), e.g.
// "9876543210" -> "+919876543210". Assumes a valid Indian mobile; callers
// validate with isValidMobile() first.
export function toE164(raw: string): string {
  return `+91${normalizeMobile(raw)}`;
}

// Display form for confirmation copy ("we sent a code to …"): "+91 98765 43210".
export function formatMobile(raw: string): string {
  const d = normalizeMobile(raw);
  if (d.length !== 10) return raw;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}
