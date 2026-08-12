import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

// The house chip that heads a benefit card: a rounded tinted square holding one
// glyph. Two sizes — `large` for an anchor card, the default for supporting
// cards.
//
// `IconChip` is the common case and what callers want; `Chip` is the frame on
// its own, for the rare card that needs different contents inside the same
// frame. Numbered process steps do NOT use this — they use StepBadge in
// components/step-flow.tsx, which is white-on-primary and carries its icon on
// the corner.
export function Chip({
  large = false,
  children,
}: {
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={
        large
          ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--nav-primary)]/10 text-[var(--nav-primary)] ring-1 ring-[var(--nav-primary)]/20"
          : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]"
      }
    >
      {children}
    </span>
  );
}

export function IconChip({
  icon: Icon,
  large = false,
}: {
  icon: LucideIcon;
  large?: boolean;
}) {
  return (
    <Chip large={large}>
      <Icon className={large ? "h-7 w-7" : "h-5 w-5"} aria-hidden />
    </Chip>
  );
}
