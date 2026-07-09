import { ChevronDown } from "lucide-react";

// Same native <details>/<summary> accordion pattern as components/faq.tsx
// (Server Component, no client JS). Kept as a separate local component rather
// than a shared primitive since this page's question set is agent-specific
// and only used here. This array also feeds the page's FAQPage JSON-LD, so
// the visible copy and the structured data can't drift apart.
export type FaqItem = { q: string; a: string };

export const AGENT_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Who can apply to become an agent?",
    a: "Anyone who can bring loan or real estate leads and pass our KYC check. No fixed prior experience is required.",
  },
  {
    q: "Can I be an agent for both loans and real estate?",
    a: "No, every agent account is tied to one line only. You pick loans or real estate when you apply.",
  },
  {
    q: "Do real estate agents need to be RERA registered?",
    a: "Yes, a valid RERA agent code is required as part of KYC for the real estate track.",
  },
  {
    q: "I am already a client. Can I convert to an agent?",
    a: "Yes, existing clients can apply to convert to an agent account through the same KYC process.",
  },
  {
    q: "How is my commission decided?",
    a: "There is no fixed slab. Commission is set for each deal individually once it closes, based on that specific loan or property.",
  },
  {
    q: "How and when do I get paid?",
    a: "Once a deal is approved, payout is made either through Razorpay or by cheque.",
  },
  {
    q: "Is there any cost to apply?",
    a: "No, applying is free. We only need your details and KYC documents to verify you.",
  },
  {
    q: "What happens after I apply?",
    a: "We review your KYC, and once you are verified, your agent account is activated so you can start referring clients.",
  },
];

export function EarnFaq() {
  return (
    <section
      id="agent-faq"
      aria-labelledby="agent-faq-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <h2
            id="agent-faq-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Agent questions, answered
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Everything people usually ask before applying.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm">
          {AGENT_FAQ_ITEMS.map((item, index) => (
            <details
              key={item.q}
              className={
                index === 0
                  ? "group"
                  : "group border-t border-[var(--nav-border)]"
              }
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-heading text-base font-semibold text-foreground marker:content-none">
                {item.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-brand-blue transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="px-6 pb-5 text-base text-text-secondary">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
