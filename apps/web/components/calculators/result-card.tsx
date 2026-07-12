import { cn } from "@/lib/utils";
import { InfoHint } from "./info-hint";

// A single headline result (EMI, total interest, eligible loan, ...). Set
// `emphasis` on the primary figure to render it on the blue surface.
export function ResultCard({
  label,
  value,
  sub,
  info,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Plain-language explanation shown in an info tooltip next to the label. */
  info?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-5",
        emphasis
          ? "border-transparent bg-[var(--nav-primary)] text-white shadow-sm"
          : "border-[var(--nav-border)] bg-white",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className={cn("text-sm", emphasis ? "text-white/85" : "text-text-secondary")}>
          {label}
        </p>
        {info ? (
          <InfoHint
            label={label}
            text={info}
            className={emphasis ? "text-white/70 hover:text-white" : undefined}
          />
        ) : null}
      </div>
      <p
        className={cn(
          // Keep the figure on one line so long amounts (₹19,47,758 / ₹14.00 Cr)
          // never break mid-number or drop their unit. tabular-nums keeps digits
          // aligned; font caps at xl so even a max ₹20 Cr value fits the tightest
          // (lg two-column) card.
          "mt-1 whitespace-nowrap font-heading text-lg font-semibold tabular-nums sm:text-xl",
          emphasis ? "text-white" : "text-[var(--nav-text)]",
        )}
      >
        {value}
      </p>
      {sub ? (
        <p className={cn("mt-1 text-sm", emphasis ? "text-white/85" : "text-text-secondary")}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
