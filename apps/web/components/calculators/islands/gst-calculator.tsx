"use client";

import { useMemo } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// GST on property. Under-construction homes attract GST on two-thirds of the
// price (the other third is treated as land value). Ready to move homes with a
// completion certificate are outside GST, so figures fall to zero.
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
          <ResultCard emphasis label="GST payable" value={formatINR(result.gst)} />
          <ResultCard label="GST rate" value={formatPercent(result.rate * 100)} />
          <ResultCard
            label="Taxable value"
            value={formatCompactINR(result.taxableValue)}
            sub="Two-thirds of price (one-third is land)"
          />
        </div>
      </div>
    </div>
  );
}
