// Indian number and currency formatting. There was no shared formatter in the
// repo before the calculators, so this is the single source. Rupees, en-IN
// grouping (lakh/crore), and a compact L/Cr helper for headline figures.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const updatedDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

export function formatLastUpdated(value: string): string {
  return `Last updated: ${updatedDate.format(new Date(value))}`;
}

/** e.g. 100000 -> "₹1,00,000". */
export function formatINR(value: number): string {
  return inr.format(Math.round(value));
}

/**
 * Compact rupees for big headline numbers: 1234567 -> "₹12.35 L", 12500000 ->
 * "₹1.25 Cr". Joins the amount and its unit with a non-breaking space so the
 * figure never wraps onto two lines inside a narrow result card.
 */
export function formatCompactINR(value: number): string {
  const abs = Math.abs(value);
  const nbsp = " ";
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}${nbsp}Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}${nbsp}L`;
  return formatINR(value);
}

/** e.g. 240 -> "240" with en-IN grouping. */
export function formatNumber(value: number): string {
  return num.format(Math.round(value));
}

/** e.g. 8.5 -> "8.50%". */
export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * Compact rupees from an integer paise amount: 500000000 -> "₹50 L",
 * 1250000000 -> "₹1.25 Cr". Whole values drop the decimals. Shared by the
 * review queue and the agent's my-submissions list (submissions carry
 * price_paise, not a display string).
 */
/**
 * Exact rupees from an integer paise amount: 12345 -> "₹123.45", 100000 ->
 * "₹1,000". Unlike formatPaiseCompact this never rounds to L/Cr, so it is the
 * one to use for a money ledger or a payout amount, not a headline figure.
 */
export function formatPaise(paise: number): string {
  return inrExact.format(paise / 100);
}

export function formatPaiseCompact(paise: number): string {
  const rupees = Math.floor(paise / 100);
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  const lakh = rupees / 100_000;
  return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(2)} L`;
}

const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * e.g. "5 Aug 2026", or "-" for a missing or unparseable value.
 *
 * This exact function was copy-pasted into the payouts, commissions,
 * fee-cashback, referral-payout, loan and property-deal views, each with its own
 * private copy of the same `Intl` options.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "-" : shortDate.format(date);
}

/**
 * How long something has been waiting, e.g. "3 days", "5 hours", "just now".
 *
 * A queue called "Waiting on you" is asking how *stale* an item is, which a
 * bare submission date answers only by making the reader do the arithmetic.
 * Deliberately coarse — the caller pairs it with the absolute date in a
 * `title`, so precision beyond a day is noise.
 */
export function formatAge(iso: string | null | undefined): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.floor(hours / 24);
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"}`;

  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "month" : "months"}`;
}
