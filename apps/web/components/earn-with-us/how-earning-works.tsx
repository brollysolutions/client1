import { BadgeIndianRupee, Briefcase, Handshake, UserPlus } from "lucide-react";
import Image from "next/image";

import { JourneyFootTrail } from "@/components/journey-foot-trail";
import { StepBadge, StepFlow, type FlowStep } from "@/components/step-flow";
import { cn } from "@/lib/utils";

// Qualitative earning steps, no invented numbers or percentages. Commission is
// set per deal by Admin (SRS FR-8.1/8.2), not a fixed slab, so this stays
// deliberately general.
//
// Three renders of the same four steps, one live at a time:
//   below md  the shared StepFlow, identical to the home "How it works" flow
//   md - lg   the house benefit card (same anatomy as the home "Why choose us"
//             cards) on a tight 2x2 grid — at tablet widths the airy StepFlow
//             left too much dead vertical space
//   lg+       alternating illustrated bands over the curvy footprint trail,
//             the same snake walk as the loans journey (illustrations and
//             decoration stay desktop-only, locked rule)
// Blue accent + natural-color scenes.
type Step = FlowStep & { image: string };

const STEPS: Step[] = [
  {
    n: 1,
    title: "Bring us a lead",
    copy: "Introduce someone who needs a loan or is looking for a property, for the line you applied on.",
    icon: UserPlus,
    image: "/illustrations/earn/commission-lead.svg",
  },
  {
    n: 2,
    title: "We work the deal",
    copy: "Our team takes it from there, working with your lead until the loan or property deal closes.",
    icon: Briefcase,
    image: "/illustrations/earn/commission-work.svg",
  },
  {
    n: 3,
    title: "Commission is set for that deal",
    copy: "There is no fixed slab. Commission is agreed for each deal individually, based on that loan or property.",
    icon: Handshake,
    image: "/illustrations/earn/commission-deal.svg",
  },
  {
    n: 4,
    title: "You get paid",
    copy: "Once the deal is approved, your commission is paid out through Razorpay or by cheque.",
    icon: BadgeIndianRupee,
    image: "/illustrations/earn/commission-payout.svg",
  },
];

export function EarnHowItWorks() {
  return (
    <section
      id="how-earning-works"
      aria-labelledby="how-earning-works-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="how-earning-works-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            How partner commission works
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            No slabs, no surprises. Here is the whole flow.
          </p>
        </div>

        {/* Below md: stacked on phone, 2x2 from sm. Four steps wrap onto two
            rows, which a single horizontal connector cannot span, so it is
            dropped here — the numbered nodes still carry the sequence. */}
        <StepFlow
          steps={STEPS}
          className="md:hidden"
          gridClassName="sm:grid-cols-2 sm:gap-10"
          connectorClassName="hidden"
          satellite="sm"
        />

        {/* md to lg: the home "Why choose us" card, same class string, on a
            tight 2x2. The badge is the same StepBadge the flow branch above
            uses — white numeral on the primary fill with the icon on its
            bottom-right corner — dropped to the `chip` variant so it keeps a
            card's 44px rounded-xl geometry rather than the flow's 64px circle.
            The number leads because this section is a sequence. The hover lift
            is dropped, this branch only ever renders in a touch-width band.
            mt-6 (not the card's usual mt-5) pays back the ~4px the satellite
            hangs below the frame. */}
        <ol className="mt-12 hidden auto-rows-fr grid-cols-2 gap-5 md:grid lg:hidden">
          {STEPS.map((step) => (
            <li key={step.n}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm">
                <StepBadge
                  n={step.n}
                  icon={step.icon}
                  variant="chip"
                  satellite="xs"
                />
                <h3 className="mt-6 font-heading text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {step.copy}
                </p>
              </article>
            </li>
          ))}
        </ol>

        {/* lg+: alternating illustrated bands with the curvy footprint trail
            overlaid behind them (the same snake walk as the loans journey).
            Illustrations (alt="") and trail (aria-hidden) are decorative; the
            numbered badge + heading + text carry content. */}
        <ol className="relative mt-12 hidden lg:block">
          <JourneyFootTrail />
          {STEPS.map((step, index) => {
            const imageOnRight = index % 2 === 1;
            return (
              <li
                key={step.title}
                className="relative z-10 py-8 first:pt-0 last:pb-0"
              >
                <div className="grid grid-cols-2 items-center gap-x-8">
                  <div
                    className={cn(
                      "mx-auto w-full max-w-[460px]",
                      imageOnRight ? "order-2" : "order-1",
                    )}
                  >
                    <Image
                      src={step.image}
                      alt=""
                      aria-hidden
                      width={480}
                      height={360}
                      sizes="460px"
                      className="h-auto w-full"
                    />
                  </div>
                  <div
                    className={cn(
                      "w-full max-w-[460px]",
                      imageOnRight
                        ? "order-1 ml-auto xl:-mr-16"
                        : "order-2 mx-auto",
                    )}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-xl font-semibold text-white">
                      {step.n}
                    </span>
                    <h3 className="mt-5 font-heading text-2xl font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-lg text-text-secondary">
                      {step.copy}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
