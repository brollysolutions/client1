import { ChevronDown } from "lucide-react";

import type { CalculatorFaq as Faq } from "@/lib/calculators/types";

// Visible FAQ. Shares its content with the FAQPage JSON-LD (both read the same
// registry `faq` array), so the page and the structured data never drift.
// Server Component, native <details>/<summary> accordion matching the public
// faq-section pattern: keyboard-native, no client JS, animated height via the
// .faq-details rule in globals.css (progressive enhancement). Rows share one
// <details name> group so only one answer is open at a time.
export function CalculatorFaq({ items }: { items: Faq[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-white shadow-sm">
      {items.map((item, index) => (
        <details
          key={item.q}
          name="calculator-faq"
          className={
            index === 0
              ? "faq-details group"
              : "faq-details group border-t border-[var(--nav-border)]"
          }
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-heading text-base font-semibold text-[var(--nav-text)] transition-colors duration-200 marker:content-none hover:bg-[var(--nav-tint)]/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)]">
            {item.q}
            <ChevronDown
              className="h-5 w-5 shrink-0 text-[var(--nav-primary)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <div className="px-6 pb-5">
            <p className="text-base text-text-secondary">{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
