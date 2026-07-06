"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { BusinessLine } from "@/lib/auth";

const OPTIONS: { value: BusinessLine; label: string; description: string }[] = [
  { value: "loans", label: "Loans", description: "Home, personal & business loans" },
  { value: "real_estate", label: "Real Estate", description: "Buy, rent or list property" },
];

// Business-line picker for registration — the user commits to exactly one line
// (loans OR real_estate, never both). Deliberately styled brand-neutral — navy
// selection, no green / amber accent — so the two line colours never co-occur on
// one screen. The value stays a BusinessLine[] (length 0 or 1) to match the
// backend's array-of-lines contract; selecting a card replaces the array.
export function LineSelect({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: BusinessLine[];
  onChange: (next: BusinessLine[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const selected = value[0] ?? "";

  return (
    <RadioGroup
      value={selected}
      onValueChange={(next) => onChange([next as BusinessLine])}
      disabled={disabled}
      aria-invalid={invalid}
      className="grid grid-cols-2 gap-3"
    >
      {OPTIONS.map((opt) => {
        const checked = selected === opt.value;
        const id = `line-${opt.value}`;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-card p-3 transition-colors",
              checked
                ? "border-brand-navy ring-1 ring-brand-navy"
                : "border-input hover:border-brand-navy/40",
              invalid && !checked && "border-destructive/60",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-primary">
                {opt.label}
              </span>
              <RadioGroupItem id={id} value={opt.value} disabled={disabled} />
            </div>
            <span className="text-xs leading-snug text-text-secondary">
              {opt.description}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
