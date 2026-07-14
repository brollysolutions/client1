"use client";

import { usePathname } from "next/navigation";
import { Building2, Landmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { BusinessLine } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { useLine } from "./line-provider";

const OPTIONS: { value: BusinessLine; label: string; icon: LucideIcon; activeClass: string }[] = [
  { value: "loans", label: "Loans", icon: Landmark, activeClass: "text-loans-accent" },
  { value: "real_estate", label: "Real Estate", icon: Building2, activeClass: "text-realestate-accent" },
];

// Toggle group (not a tabs widget: it swaps a whole route, not an inline panel)
// that flips the workspace between the client's lines. Shown only for multi-line
// clients and only on the workspace home, so its accent never lands on a
// loans-only sub-page where it would clash with that page's green.
export function LineSwitcher() {
  const { activeLine, setActiveLine, canSwitch } = useLine();
  const pathname = usePathname();
  if (!canSwitch || pathname !== "/dashboard") return null;

  return (
    <div
      role="group"
      aria-label="Switch business line"
      className="inline-flex items-center gap-1 rounded-full border border-dash-border bg-surface p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon, activeClass }) => {
        const selected = activeLine === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={() => setActiveLine(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              selected
                ? cn("bg-background shadow-sm", activeClass)
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
