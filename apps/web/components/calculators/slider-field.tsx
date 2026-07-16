"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { InfoHint } from "./info-hint";

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
  info,
  allowAboveMax = true,
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
  /** Plain-language explanation shown in an info tooltip next to the label. */
  info?: string;
  /**
   * Whether a typed number may exceed `max`. Default true: `max` is only the
   * slider's soft ceiling, so the thumb pins at `max` while the committed value
   * is whatever was typed (still floored at `min`). No numeric input is hard-
   * capped. Pass false to restore a hard cap at `max`.
   */
  allowAboveMax?: boolean;
  className?: string;
}) {
  function clamp(next: number): number {
    if (Number.isNaN(next)) return min;
    return Math.min(max, Math.max(min, next));
  }

  // Commit-time bound for the numeric field. When allowAboveMax, drop the upper
  // clamp so a typed value above `max` survives; the slider still visually pins.
  function boundCommit(next: number): number {
    if (Number.isNaN(next)) return min;
    return allowAboveMax ? Math.max(min, next) : clamp(next);
  }

  // Decoupled from `value` so the user can freely type (clear the field,
  // enter a number below `min` mid-edit, etc.) without every keystroke
  // being clamped out from under them. Clamping happens on blur/Enter.
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(raw: string) {
    const bounded = boundCommit(parseFloat(raw));
    setText(String(bounded));
    onChange(bounded);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Label htmlFor={id} className="text-sm text-[var(--nav-text)]">
            {label}
          </Label>
          {info ? <InfoHint label={label} text={info} /> : null}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-[var(--nav-border)] bg-white px-2 py-1">
          {prefix ? (
            <span className="text-sm text-text-secondary">{prefix}</span>
          ) : null}
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={text}
            min={min}
            step={step}
            onChange={(event) => setText(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(event.currentTarget.value);
            }}
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
