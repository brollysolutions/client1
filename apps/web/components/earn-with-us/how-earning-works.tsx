// Qualitative earning steps, no invented numbers or percentages. Commission is
// set per deal by Admin (SRS FR-8.1/8.2), not a fixed slab, so this stays
// deliberately general.
type Step = { n: string; title: string; text: string };

const STEPS: Step[] = [
  {
    n: "1",
    title: "Bring us a lead",
    text: "Introduce someone who needs a loan or is looking for a property, for the line you applied on.",
  },
  {
    n: "2",
    title: "We work the deal",
    text: "Our team takes it from there, working with your lead until the loan or property deal closes.",
  },
  {
    n: "3",
    title: "Commission is set for that deal",
    text: "There is no fixed slab. Commission is agreed for each deal individually, based on that loan or property.",
  },
  {
    n: "4",
    title: "You get paid",
    text: "Once the deal is approved, your commission is paid out through Razorpay or by cheque.",
  },
];

export function EarnHowItWorks() {
  return (
    <section
      id="how-earning-works"
      aria-labelledby="how-earning-works-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-surface"
    >
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
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

        <ol className="mx-auto mt-12 max-w-xl space-y-6">
          {STEPS.map((step) => (
            <li key={step.n} className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-sm font-semibold text-white shadow-sm">
                {step.n}
              </span>
              <div>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
