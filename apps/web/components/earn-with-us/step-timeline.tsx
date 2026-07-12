type Step = { n: string; title: string; text: string };

// Vertical numbered timeline for the Earn page process sections
// (refer-and-earn, how-earning-works). A connecting spine runs down through the
// numbered badges; the last node has no line below it. Server Component,
// blue-only, no illustrations or doodles, no invented numbers. Shared so both
// sections stay visually identical.
export function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="mx-auto mt-12 max-w-xl rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm sm:p-8">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.n} className="relative flex gap-5 pb-8 last:pb-0">
            {/* Spine: from this badge's center down to the next badge. Anchored
                at the badge's center-x (left-5 = 1.25rem) and covered by the
                opaque badges (z-10), so it reads as one line threading through. */}
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-5 top-5 h-full w-px -translate-x-1/2 bg-[var(--nav-border)]"
              />
            ) : null}
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-sm font-semibold text-white shadow-sm">
              {step.n}
            </span>
            <div className="pt-2">
              <h3 className="font-heading text-base font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {step.text}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
