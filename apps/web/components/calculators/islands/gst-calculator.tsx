"use client";

import { useMemo } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INFO } from "@/lib/calculators/glossary";
import { gstOnProperty } from "@/lib/finance";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/format";
import { ResultCard } from "../result-card";
import { SliderField } from "../slider-field";

const TYPES = ["affordable", "non-affordable", "ready"] as const;
type PropertyType = (typeof TYPES)[number];
const TYPE_LABELS: Record<PropertyType, string> = {
  affordable: "Affordable",
  "non-affordable": "Other under-construction",
  ready: "Ready to move",
};

const VALUE_MIN = 500000;
const VALUE_MAX = 200000000;
const VALUE_STEP = 100000;

function clamp(value: number, min: number, _max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value); // `max` is a soft slider ceiling, not a hard cap
}

// GST on property. Under-construction homes attract GST at an effective 1% or
// 5% on the full sale value (the one-third land abatement is already built into
// those rates). Ready to move homes with a completion certificate are outside
// GST, so figures fall to zero.
export function GstCalculator() {
  const [state, setState] = useQueryStates(
    {
      type: parseAsStringLiteral(TYPES).withDefault("non-affordable"),
      value: parseAsInteger.withDefault(5000000),
    },
    { history: "replace", clearOnDefault: true },
  );

  const type = state.type;
  const value = clamp(state.value, VALUE_MIN, VALUE_MAX);

  const result = useMemo(() => gstOnProperty(value, type), [value, type]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Inputs */}
      <div className="grid content-start gap-6">
        <Tabs value={type} onValueChange={(next) => setState({ type: next as PropertyType })}>
          <TabsList className="w-full">
            {TYPES.map((t) => (
              <TabsTrigger key={t} value={t} className="flex-1">
                {TYPE_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <SliderField
          id="gst-value"
          label="Property value"
          info={INFO.propertyValue}
          prefix="₹"
          value={value}
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={VALUE_STEP}
          onChange={(v) => setState({ value: Math.round(v) })}
          helper={formatCompactINR(value)}
        />

        {type === "ready" ? (
          <p className="rounded-xl border border-[var(--nav-border)] bg-white p-4 text-sm text-text-secondary">
            Ready to move homes with a completion certificate do not attract GST, so the figures
            below stay at zero.
          </p>
        ) : null}
      </div>

      {/* Results */}
      <div className="grid content-start gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultCard
            emphasis
            label="GST payable"
            info={INFO.gstPayable}
            value={formatINR(result.gst)}
          />
          <ResultCard
            label="GST rate"
            info={INFO.gstRate}
            value={formatPercent(result.rate * 100)}
            sub="Effective, on full value"
          />
          <ResultCard
            label="Total incl. GST"
            info={INFO.totalInclGst}
            value={formatCompactINR(value + result.gst)}
            sub="Property value plus GST"
          />
        </div>
      </div>
    </div>
  );
}
