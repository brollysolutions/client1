export interface StampDutyResult {
  stampDuty: number;
  registration: number;
  total: number;
}

/**
 * Stamp duty and registration on a property purchase. Rates vary by state (and
 * often by buyer gender), so the caller resolves the applicable percentages from
 * the state-wise table (lib/calculators/stamp-duty-rates.ts) and passes them in;
 * this stays a pure number cruncher.
 */
export function stampDuty(
  propertyValue: number,
  stampDutyRatePct: number,
  registrationRatePct: number,
): StampDutyResult {
  const stamp = Math.round((propertyValue * stampDutyRatePct) / 100);
  const registration = Math.round((propertyValue * registrationRatePct) / 100);
  return { stampDuty: stamp, registration, total: stamp + registration };
}
