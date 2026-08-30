import { BadgeCheck, HeartHandshake, MessageSquareText } from "lucide-react";

import { StepFlow, type FlowStep } from "@/components/step-flow";

// Home "How it works": platform-level 3-step flow that covers both business
// lines (loans + real estate) in one voice. Blue-only like the rest of the
// public site (loans-green / realestate-amber stay reserved for authenticated
// dashboards, per docs/design/ui-principles.md).
//
// lg+: the three numbered nodes sit on a horizontal connector line to read as a
// process. The line is masked behind each circle by a bg-colored ring, so
// it joins node to node instead of running through them. Below lg the steps
// stack into a single centered column and the connector is hidden. The step
// markup itself lives in components/step-flow.tsx, shared with the two
// /earn-with-us process sections.
const STEPS: FlowStep[] = [
  {
    n: 1,
    title: "Tell us what you need",
    copy: "Share what you're after, a loan or a home, in a couple of minutes.",
    icon: MessageSquareText,
  },
  {
    n: 2,
    title: "We match verified partners",
    copy: "We connect you to KYC-checked lenders or partners suited to you.",
    icon: BadgeCheck,
  },
  {
    n: 3,
    title: "We stay with you till it's done",
    copy: "One person guides you from first call to money in the bank or keys in hand.",
    icon: HeartHandshake,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="how-it-works-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            How it works
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            From your first question to done, in three simple steps.
          </p>
        </div>

        {/* Connector spans between the first and last node centers (columns sit
            at 1/6, 1/2, 5/6 of the row width) and is lg+ only. */}
        <StepFlow
          steps={STEPS}
          gridClassName="lg:grid-cols-3 lg:gap-8"
          connectorClassName="left-[16.6667%] right-[16.6667%] top-8 hidden lg:block"
        />
      </div>
    </section>
  );
}
