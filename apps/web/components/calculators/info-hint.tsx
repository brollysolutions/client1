"use client";

import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A small "(i)" affordance placed next to a calculator label. On hover or
// keyboard focus (and on tap, since the trigger is a focusable button) it
// explains the value in plain language. Copy comes from lib/calculators/
// glossary.ts so the wording stays consistent across every calculator.
export function InfoHint({
  label,
  text,
  className,
}: {
  /** The value being explained, used only for the screen-reader label. */
  label: string;
  text: string;
  /** Override the icon colour, e.g. on the emphasised (blue) result card. */
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`What is ${label}?`}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-[var(--nav-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-1",
              className,
            )}
          >
            <Info className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[16rem] text-sm font-normal leading-snug">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
