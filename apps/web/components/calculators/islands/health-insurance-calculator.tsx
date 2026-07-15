"use client";

import { useMemo } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INFO } from "@/lib/calculators/glossary";
import { HEALTH_COVER_DEFAULTS as D, INSURANCE_DISCLAIMER } from "@/lib/calculators/rates";
import { healthCover, type CityTier } from "@/lib/finance";
import { formatCompactINR, formatINR } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { InfoHint } from "../info-hint";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

const TIERS = ["metro", "tier2", "tier3"] as const;
const TIER_LABELS: Record<CityTier, string> = {
  metro: "Metro",
  tier2: "Tier 2",
  tier3: "Tier 3",
};
const SENIOR = ["no", "yes"] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function Row({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="text-sm text-text-secondary">{label}</p>
        {info ? <InfoHint label={label} text={info} /> : null}
      </div>
      <p className="whitespace-nowrap font-heading text-base font-semibold tabular-nums text-[var(--nav-text)]">
        {value}
      </p>
    </div>
  );
}

// Health insurance cover: suggested family-floater size from city tier, adults
// covered, and senior membership. A sizing heuristic, clearly labelled, never a
// premium quote.
export function HealthInsuranceCalculator() {
  const [state, setState] = useQueryStates(
    {
      tier: parseAsStringLiteral(TIERS).withDefault("metro"),
      adults: parseAsInteger.withDefault(D.adults),
      senior: parseAsStringLiteral(SENIOR).withDefault("no"),
    },
    { history: "replace", clearOnDefault: true },
  );

  const adults = clamp(state.adults, D.adultsMin, D.adultsMax);

  const result = useMemo(
    () =>
      healthCover({
        cityTier: state.tier,
        adults,
        hasSeniorMember: state.senior === "yes",
      }),
    [state.tier, adults, state.senior],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm text-[var(--nav-text)]">Your city</Label>
            <InfoHint label="Your city" text={INFO.cityTier} />
          </div>
          <Tabs value={state.tier} onValueChange={(t) => setState({ tier: t as CityTier })}>
            <TabsList className="w-full">
              {TIERS.map((t) => (
                <TabsTrigger key={t} value={t} className="flex-1">
                  {TIER_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-right text-sm text-text-secondary">
            Metro means Mumbai, Delhi NCR, Bengaluru and peers
          </p>
        </div>

        <SliderField
          id="health-adults"
          label="Adults covered"
          info={INFO.adultsCovered}
          value={adults}
          min={D.adultsMin}
          max={D.adultsMax}
          step={1}
          onChange={(v) => setState({ adults: Math.round(v) })}
          helper={`${adults} adult${adults > 1 ? "s" : ""} on the floater, children ride along`}
        />

        <div className="grid gap-2">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm text-[var(--nav-text)]">Any member 60 or older?</Label>
            <InfoHint label="Any member 60 or older" text={INFO.seniorMember} />
          </div>
          <Tabs
            value={state.senior}
            onValueChange={(s) => setState({ senior: s as (typeof SENIOR)[number] })}
          >
            <TabsList className="w-full">
              <TabsTrigger value="no" className="flex-1">
                No
              </TabsTrigger>
              <TabsTrigger value="yes" className="flex-1">
                Yes
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <RateDisclaimer text={INSURANCE_DISCLAIMER} />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <ResultCard
          emphasis
          label="Suggested cover"
          info={INFO.suggestedHealthCover}
          value={formatCompactINR(result.suggested)}
          sub={`Comfortable band ${formatCompactINR(result.suggested)} to ${formatCompactINR(result.suggestedUpper)}`}
        />

        <div className="rounded-xl border border-[var(--nav-border)] bg-white px-5 py-3">
          <Row
            label={`Base for a ${TIER_LABELS[state.tier]} city`}
            value={formatINR(result.baseCover)}
            info={INFO.cityTier}
          />
          <Row
            label="Extra adults"
            value={formatINR(result.extraAdultLoading)}
            info={INFO.adultsCovered}
          />
          <Row
            label="Senior loading"
            value={formatINR(result.seniorLoading)}
            info={INFO.seniorMember}
          />
          <div className="border-t border-[var(--nav-border)]">
            <Row
              label="Suggested floater"
              value={formatINR(result.suggested)}
              info={INFO.suggestedHealthCover}
            />
          </div>
        </div>

        {result.seniorSeparatePolicyAdvised ? (
          <div className="rounded-xl border border-[var(--nav-border)] bg-white p-5">
            <p className="font-heading text-base font-semibold text-[var(--nav-text)]">
              Consider a separate senior policy
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              A family floater is priced on its eldest member, so one senior raises the premium for
              everyone. A separate senior-citizen policy for them usually costs the family less
              overall.
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            Pick the higher end of the band if the premium fits your budget. A top-up plan over a
            base floater is a cheap way to reach it.
          </p>
        )}
      </div>
    </div>
  );
}
