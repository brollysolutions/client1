export type CityTier = "metro" | "tier2" | "tier3";

export interface HealthCoverConfig {
  /** Base family-floater cover by city tier, driven by hospitalization costs. */
  baseByTier: Record<CityTier, number>;
  /** Added cover per adult beyond the first two on the floater. */
  perExtraAdult: number;
  /** Percent uplift when any covered member is 60 or older. */
  seniorLoadingPct: number;
  /** The suggested band's upper end, as a multiple of the suggestion. */
  upperBandMultiplier: number;
  /** Health covers sell in 2.5 lakh steps; suggestions round up to one. */
  roundStep: number;
}

/**
 * Heuristic sizing table (reviewed with the rates runbook, not actuarial):
 * a serious metro hospitalization now runs into 8 figures of rupees, hence
 * the "10 lakh is the new 5 lakh" baseline.
 */
export const HEALTH_COVER_CONFIG: HealthCoverConfig = {
  baseByTier: { metro: 1_000_000, tier2: 750_000, tier3: 500_000 },
  perExtraAdult: 250_000,
  seniorLoadingPct: 50,
  upperBandMultiplier: 1.5,
  roundStep: 250_000,
};

export interface HealthCoverInputs {
  cityTier: CityTier;
  /** Adults on the floater. Children add marginal premium and are handled in copy. */
  adults: number;
  /** Any covered member aged 60 or above. */
  hasSeniorMember?: boolean;
}

export interface HealthCoverResult {
  baseCover: number;
  extraAdultLoading: number;
  /** Rupee amount added by the senior loading. */
  seniorLoading: number;
  /** Suggested floater size, rounded up to the step. */
  suggested: number;
  /** Upper end of the suggested band. */
  suggestedUpper: number;
  /**
   * True when a senior member is on the floater. A floater prices on the
   * eldest member, so a separate senior-citizen policy usually costs the
   * family less; the island shows an advice panel off this flag.
   */
  seniorSeparatePolicyAdvised: boolean;
}

function ceilToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/**
 * Suggested family-floater health cover from city tier, adults covered, and
 * senior membership. A sizing heuristic against hospitalization costs, not a
 * premium quote: premiums are actuarial and vary by insurer, age, and health.
 */
export function healthCover(
  { cityTier, adults, hasSeniorMember = false }: HealthCoverInputs,
  config: HealthCoverConfig = HEALTH_COVER_CONFIG,
): HealthCoverResult {
  const baseCover = config.baseByTier[cityTier];
  const extraAdultLoading = Math.max(0, adults - 2) * config.perExtraAdult;
  const beforeLoading = baseCover + extraAdultLoading;
  const seniorLoading = hasSeniorMember
    ? Math.round((beforeLoading * config.seniorLoadingPct) / 100)
    : 0;

  const suggested = ceilToStep(beforeLoading + seniorLoading, config.roundStep);
  const suggestedUpper = ceilToStep(suggested * config.upperBandMultiplier, config.roundStep);

  return {
    baseCover,
    extraAdultLoading,
    seniorLoading,
    suggested,
    suggestedUpper,
    seniorSeparatePolicyAdvised: hasSeniorMember,
  };
}
