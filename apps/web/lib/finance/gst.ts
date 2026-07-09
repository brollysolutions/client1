export type GstCategory = "affordable" | "non-affordable" | "ready";

export interface GstResult {
  rate: number;
  /** Value GST is charged on: 2/3 of price (1/3 is a deemed land deduction). */
  taxableValue: number;
  gst: number;
}

/**
 * GST on a property purchase. Only under-construction homes attract GST:
 *   affordable      -> 1% (no ITC)
 *   non-affordable  -> 5% (no ITC)
 *   ready-to-move   -> 0% (no GST once the completion certificate is issued)
 * The 1/3 land deduction means GST applies to two-thirds of the price.
 */
export function gstOnProperty(propertyValue: number, category: GstCategory): GstResult {
  if (category === "ready") return { rate: 0, taxableValue: 0, gst: 0 };
  const rate = category === "affordable" ? 0.01 : 0.05;
  const taxableValue = Math.round((propertyValue * 2) / 3);
  return { rate, taxableValue, gst: Math.round(taxableValue * rate) };
}
