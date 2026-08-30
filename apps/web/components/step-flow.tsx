import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// The house step-flow pattern, first written for the home "How it works"
// section and now shared by the two /earn-with-us process sections so all
// three read as one design language instead of three lookalikes.
//
// Anatomy per step: a StepBadge (below), then a centered heading and copy. No
// card surface — the steps sit directly on the section wash. The optional
// connector line runs behind the row and is masked where each badge sits by
// `ring-8 ring-[var(--nav-bg)]`, so it reads as joining node to node rather
// than running through them.
//
// That mask is why every StepFlow consumer must sit on `bg-[var(--nav-bg)]`;
// on any other background the ring shows as a halo. Pass
// connectorClassName="hidden" when the steps wrap onto multiple rows (a
// horizontal rule cannot span a 2x2 grid) — the numbered badges still carry
// the sequence.
export type FlowStep = {
  n: number;
  title: string;
  copy: string;
  icon: LucideIcon;
};

// The numbered badge itself: a white numeral on a solid `--nav-primary` fill
// with the step's lucide glyph riding the bottom-right corner as a small
// tinted satellite. White-on-primary and the corner-mounted glyph are the two
// traits that make every process section on the site recognisably the same
// pattern; only the size and corner radius change per surface.
//
//   node  the 64px round flow node used inside StepFlow
//   chip  the 44px squared badge used by the /earn-with-us commission cards,
//         which keep a card's rounded-xl geometry
//
// The connector mask is deliberately NOT baked in — it belongs to whoever owns
// a connector line, and would read as a halo anywhere else. StepFlow passes it
// through `className`.
const VARIANTS = {
  node: { frame: "h-16 w-16 rounded-full text-2xl", satellite: "md" },
  chip: { frame: "h-11 w-11 rounded-xl text-lg", satellite: "sm" },
} as const;

// Satellite scale, one step apart. Each variant has a default (above), but a
// surface can drop a step where the corner glyph reads heavier than the numeral
// it rides on — the commission steps on /earn-with-us do, their glyphs sit next
// to full-width illustrated bands.
const SATELLITES = {
  md: { ring: "h-7 w-7", glyph: "h-4 w-4" },
  sm: { ring: "h-6 w-6", glyph: "h-3.5 w-3.5" },
  xs: { ring: "h-5 w-5", glyph: "h-3 w-3" },
} as const;

export type SatelliteSize = keyof typeof SATELLITES;

export function StepBadge({
  n,
  icon: Icon,
  variant = "node",
  satellite,
  className,
}: {
  n: number;
  icon: LucideIcon;
  /** `node` = the 64px round flow node; `chip` = the 44px squared card badge. */
  variant?: keyof typeof VARIANTS;
  /** Corner-glyph size. Defaults to the variant's own step. */
  satellite?: SatelliteSize;
  /** Extra classes on the outer frame (e.g. StepFlow's connector mask). */
  className?: string;
}) {
  const v = VARIANTS[variant];
  const s = SATELLITES[satellite ?? v.satellite];
  return (
    <span
      className={cn(
        "relative z-10 flex shrink-0 items-center justify-center bg-[var(--nav-primary)] font-heading font-semibold text-white",
        v.frame,
        className,
      )}
    >
      {n}
      <span
        className={cn(
          "absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]",
          s.ring,
        )}
      >
        <Icon className={s.glyph} aria-hidden />
      </span>
    </span>
  );
}

export function StepFlow({
  steps,
  className,
  gridClassName,
  connectorClassName,
  satellite,
}: {
  steps: FlowStep[];
  /** Wrapper spacing / visibility. Defaults to the standard `mt-14` rhythm. */
  className?: string;
  /** Per-breakpoint column count and gap override. */
  gridClassName?: string;
  /** Connector inset (`left-*`/`right-*`/`top-*`) plus its visibility. */
  connectorClassName?: string;
  /** Corner-glyph size on each node. Defaults to the `node` step. */
  satellite?: SatelliteSize;
}) {
  return (
    <div className={cn("relative mt-14", className)}>
      {/* Connector line. The caller sets the horizontal insets to land on the
          first and last node centres for its column count (1/6 and 5/6 for a
          3-up, and so on) and `top-8` to hit the 64px circle's midline. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute h-px bg-[var(--nav-border)]",
          connectorClassName,
        )}
      />
      <ol className={cn("grid gap-12", gridClassName)}>
        {steps.map((step) => (
          <li key={step.n} className="flex flex-col items-center text-center">
            <StepBadge
              n={step.n}
              icon={step.icon}
              satellite={satellite}
              className="ring-8 ring-[var(--nav-bg)]"
            />
            <h3 className="mt-6 font-heading text-xl font-semibold text-foreground">
              {step.title}
            </h3>
            <p className="mt-2 max-w-xs text-base text-text-secondary">
              {step.copy}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
