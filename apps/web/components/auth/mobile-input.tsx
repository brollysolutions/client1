import * as React from "react";

import { cn } from "@/lib/utils";
import { normalizeMobile } from "@/lib/phone";

// The Indian tricolour with the Ashoka Chakra, as an inline SVG. We avoid the
// 🇮🇳 flag emoji because Windows/Chrome render it as the letters "IN".
function IndiaFlag({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      className={cn("h-3.5 w-5 shrink-0 rounded-[2px]", className)}
      aria-hidden="true"
    >
      <rect width="30" height="20" rx="2" fill="#FFFFFF" />
      <rect width="30" height="6.667" rx="2" fill="#FF9933" />
      <rect y="13.333" width="30" height="6.667" rx="2" fill="#138808" />
      <circle
        cx="15"
        cy="10"
        r="2.4"
        fill="none"
        stroke="#0A3A8B"
        strokeWidth="0.6"
      />
    </svg>
  );
}

// Phone-number field for the auth flows: an India flag + fixed "+91" prefix in
// front of a bare input. The value is normalized to bare digits and hard-capped
// at 10 as the user types (reusing normalizeMobile so a pasted "+91"/leading-0
// number is handled), then still validated (isValidMobile) / formatted (toE164)
// at submit. Callers keep passing value + onChange unchanged — we intercept
// onChange, rewrite the event value, and call through, so the stored state is
// always a clean <=10-digit string.
type MobileInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "inputMode" | "className" | "size"
> & {
  /**
   * "default" matches the tall auth/public fields; "sm" matches the dashboard
   * `Input` (h-9), so this can sit in a staff form row without towering over the
   * fields beside it. Shadows the native (and here meaningless) input `size`.
   */
  size?: "default" | "sm";
};

function MobileInput({
  id,
  disabled,
  onChange,
  size = "default",
  "aria-invalid": ariaInvalid,
  ...props
}: MobileInputProps) {
  const compact = size === "sm";
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Digits only, strip a pasted +91 / leading 0, hard-cap at 10.
    const capped = normalizeMobile(e.target.value).slice(0, 10);
    if (capped !== e.target.value) e.target.value = capped;
    onChange?.(e);
  }

  return (
    <div
      data-slot="mobile-input"
      className={cn(
        "flex w-full min-w-0 items-center border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        compact ? "h-9 max-sm:min-h-11 rounded-md" : "h-12 rounded-lg",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:ring-destructive/40",
        "has-[input:disabled]:pointer-events-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 self-stretch border-r border-input text-text-primary select-none",
          compact ? "pr-2.5 pl-3 text-base md:text-sm" : "pr-3.5 pl-4 text-base",
        )}
      >
        <IndiaFlag />
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={handleChange}
        className={cn(
          "h-full w-full min-w-0 bg-transparent py-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
          compact ? "rounded-r-md px-3 text-base md:text-sm" : "rounded-r-lg px-3.5 text-base",
        )}
        {...props}
      />
    </div>
  );
}

export { MobileInput };
