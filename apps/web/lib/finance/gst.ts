export type GstCategory = "affordable" | "non-affordable" | "ready";

export interface GstResult {
  rate: number;
  gst: number;
}

/**
 * GST on a property purchase. Only under-construction homes attract GST:
 *   affordable      -> 1% (no ITC)
 *   non-affordable  -> 5% (no ITC)
 *   ready-to-move   -> 0% (no GST once the completion certificate is issued)
 *
 * The 1% and 5% figures are the effective rates under the post-April-2019
 * scheme, applied to the full sale consideration. The one-third land abatement
 * is already built into these rates, so it must not be deducted again: GST is
 * simply rate x property value.
 */
export function gstOnProperty(propertyValue: number, category: GstCategory): GstResult {
  if (category === "ready") return { rate: 0, gst: 0 };
  const rate = category === "affordable" ? 0.01 : 0.05;
  return { rate, gst: Math.round(propertyValue * rate) };
}
