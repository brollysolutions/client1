// Indian number and currency formatting. There was no shared formatter in the
// repo before the calculators, so this is the single source. Rupees, en-IN
// grouping (lakh/crore), and a compact L/Cr helper for headline figures.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

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
export function formatPaiseCompact(paise: number): string {
  const rupees = Math.floor(paise / 100);
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  const lakh = rupees / 100_000;
  return `₹${Number.isInteger(lakh) ? lakh : lakh.toFixed(2)} L`;
}
