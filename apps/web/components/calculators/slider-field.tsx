"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// The shared calculator input: a slider for quick adjustment paired with a
// numeric field for precise entry, kept in sync. The winning pattern across
// every good EMI calculator, and the numeric field is the keyboard-friendly
// fallback for the slider.
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  helper,
  className,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Adornment before the number, e.g. "₹". */
  prefix?: string;
  /** Adornment after the number, e.g. "months" or "% p.a.". */
  suffix?: string;
  /** Formatted read-out under the slider, e.g. "₹30,00,000". */
  helper?: string;
  className?: string;
}) {
  function clamp(next: number): number {
    if (Number.isNaN(next)) return min;
    return Math.min(max, Math.max(min, next));
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm text-[var(--nav-text)]">
          {label}
        </Label>
        <div className="flex items-center gap-1 rounded-md border border-[var(--nav-border)] bg-white px-2 py-1">
          {prefix ? (
            <span className="text-sm text-text-secondary">{prefix}</span>
          ) : null}
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={String(value)}
            min={min}
            max={max}
            step={step}
            onChange={(event) => onChange(clamp(parseFloat(event.target.value)))}
            className="h-6 w-24 border-0 p-0 text-right font-heading text-base font-semibold shadow-none focus-visible:ring-0"
          />
          {suffix ? (
            <span className="whitespace-nowrap text-sm text-text-secondary">{suffix}</span>
          ) : null}
        </div>
      </div>
      <Slider
        value={[Math.min(max, Math.max(min, value))]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(clamp(next[0]))}
        aria-label={label}
        aria-valuetext={helper ?? String(value)}
      />
      {helper ? (
        <p className="text-right text-sm text-text-secondary" aria-hidden>
          {helper}
        </p>
      ) : null}
    </div>
  );
}
