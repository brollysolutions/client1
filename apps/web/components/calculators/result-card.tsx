import { cn } from "@/lib/utils";

// A single headline result (EMI, total interest, eligible loan, ...). Set
// `emphasis` on the primary figure to render it on the blue surface.
export function ResultCard({
  label,
  value,
  sub,
  emphasis = false,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        emphasis
          ? "border-transparent bg-[var(--nav-primary)] text-white shadow-sm"
          : "border-[var(--nav-border)] bg-white",
        className,
      )}
    >
      <p className={cn("text-sm", emphasis ? "text-white/85" : "text-text-secondary")}>
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-heading text-2xl font-semibold sm:text-3xl",
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
