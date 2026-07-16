"use client";

import { useMemo } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_STATE_CODE,
  getStampDutyState,
  stampDutyRateFor,
  STAMP_DUTY_STATES,
  type StampDutyBuyer,
} from "@/lib/calculators/stamp-duty-rates";
import { INFO } from "@/lib/calculators/glossary";
import { stampDuty } from "@/lib/finance";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/format";
import { InfoHint } from "../info-hint";
import { RateDisclaimer } from "../rate-disclaimer";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

const STATE_CODES = STAMP_DUTY_STATES.map((s) => s.code) as [string, ...string[]];
const BUYERS = ["male", "female"] as const;

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

const VALUE_MIN = 500000;
const VALUE_MAX = 200000000;

// Stamp duty and registration estimator for real estate. State plus buyer
// resolve an indicative stamp duty rate; the pure engine turns that into rupee
// charges. All state lives in the URL through nuqs, so results are shareable.
export function StampDutyCalculator() {
  const [state, setState] = useQueryStates(
    {
      state: parseAsStringLiteral(STATE_CODES).withDefault(DEFAULT_STATE_CODE),
      buyer: parseAsStringLiteral(BUYERS).withDefault("male"),
      value: parseAsInteger.withDefault(5000000),
    },
    { history: "replace", clearOnDefault: true },
  );

  const st = getStampDutyState(state.state) ?? getStampDutyState(DEFAULT_STATE_CODE)!;
  const buyer = state.buyer as StampDutyBuyer;
  const value = clamp(state.value, VALUE_MIN, VALUE_MAX);
  const rate = stampDutyRateFor(st, buyer);
  const hasWomenConcession = st.stampDutyFemale < st.stampDutyMale;

  const result = useMemo(
    () => stampDuty(value, rate, st.registration),
    [value, rate, st.registration],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <div className="grid gap-2">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="stamp-state"
              className="text-sm text-[var(--nav-text)]"
            >
              State
            </label>
            <InfoHint label="State" text={INFO.stampState} />
          </div>
          <Select
            value={state.state}
            onValueChange={(next) => setState({ state: next })}
          >
            <SelectTrigger id="stamp-state" className="w-full">
              <SelectValue placeholder="Select a state" />
            </SelectTrigger>
            <SelectContent>
              {STAMP_DUTY_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <span className="flex items-center gap-1.5">
            <span className="text-sm text-[var(--nav-text)]">Buyer</span>
            <InfoHint label="Buyer" text={INFO.stampBuyer} />
          </span>
          <Tabs value={buyer} onValueChange={(next) => setState({ buyer: next as "male" | "female" })}>
            <TabsList className="w-full">
              <TabsTrigger value="male" className="flex-1">
                Male / Other
              </TabsTrigger>
              <TabsTrigger value="female" className="flex-1">
                Female
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <SliderField
          id="stamp-value"
          label="Property value"
          info={INFO.propertyValue}
          prefix="₹"
          value={value}
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={100000}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />

        {hasWomenConcession ? (
          <p className="text-sm text-text-secondary">
            {st.name} offers female buyers a lower stamp duty rate of{" "}
            {formatPercent(st.stampDutyFemale)}, against {formatPercent(st.stampDutyMale)} for
            others.
          </p>
        ) : null}

        <RateDisclaimer text="Stamp duty and registration rates vary by state and change over time. Figures shown are indicative estimates, not legal advice." />
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            label="Stamp duty"
            info={INFO.stampDuty}
            value={formatINR(result.stampDuty)}
            sub={formatPercent(rate)}
          />
          <ResultCard
            label="Registration"
            info={INFO.registration}
            value={formatINR(result.registration)}
            sub={formatPercent(st.registration)}
          />
          <ResultCard
            emphasis
            label="Total charges"
            info={INFO.totalCharges}
            value={formatINR(result.total)}
          />
        </div>
      </div>
    </div>
  );
}
