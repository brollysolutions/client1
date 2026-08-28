import { cn } from "@/lib/utils";

/**
 * One status pill for every workflow in the staff dashboards.
 *
 * The tone vocabulary was already consistent across payouts, commissions,
 * fee cashbacks, referral payouts, document verification and the audit log —
 * warning for "waiting on someone", success for terminal-good, destructive for
 * terminal-bad, info for in-flight, neutral for inert. What was duplicated was
 * the class strings, as a private `STATUS_STYLE: Record<string, string>` in each
 * of those files. Surfaces keep owning their own status *labels* (they are
 * domain vocabulary) and map them onto a tone here.
 */
export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-text-secondary",
  info: "bg-brand-cta-tint text-brand-cta",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
