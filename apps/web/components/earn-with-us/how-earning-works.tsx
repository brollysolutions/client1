import Image from "next/image";

import { JourneyFootTrail } from "@/components/journey-foot-trail";
import { cn } from "@/lib/utils";

// Qualitative earning steps, no invented numbers or percentages. Commission is
// set per deal by Admin (SRS FR-8.1/8.2), not a fixed slab, so this stays
// deliberately general. Rendered as the loans-journey alternating illustrated
// timeline: text-only stacked steps below lg, illustrated bands + curvy
// footprint trail on lg+ (illustrations/decoration are desktop-only, locked
// rule). Blue accent + natural-color scenes, no white card.
type Step = { title: string; description: string; image: string };

const STEPS: Step[] = [
  {
    title: "Bring us a lead",
    description:
      "Introduce someone who needs a loan or is looking for a property, for the line you applied on.",
    image: "/illustrations/earn/commission-lead.svg",
  },
  {
    title: "We work the deal",
    description:
      "Our team takes it from there, working with your lead until the loan or property deal closes.",
    image: "/illustrations/earn/commission-work.svg",
  },
  {
    title: "Commission is set for that deal",
    description:
      "There is no fixed slab. Commission is agreed for each deal individually, based on that loan or property.",
    image: "/illustrations/earn/commission-deal.svg",
  },
  {
    title: "You get paid",
    description:
      "Once the deal is approved, your commission is paid out through Razorpay or by cheque.",
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
            How agent commission works
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            No slabs, no surprises. Here is the whole flow.
          </p>
        </div>

        {/* Below lg: text-only stacked steps (no illustrations, no trail). */}
        <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:hidden">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-lg font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 font-heading text-xl font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-lg text-text-secondary">{step.description}</p>
            </li>
          ))}
        </ol>

        {/* lg+: alternating illustrated bands with the curvy footprint trail
            overlaid behind them. Illustrations (alt="") and trail (aria-hidden)
            are decorative; the numbered badge + heading + text carry content. */}
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
                      {index + 1}
                    </span>
                    <h3 className="mt-5 font-heading text-2xl font-semibold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-lg text-text-secondary">
                      {step.description}
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
