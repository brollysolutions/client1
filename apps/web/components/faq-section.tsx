import { ChevronDown } from "lucide-react";

import { FaqDoodles } from "@/components/faq-doodles";
import type { FaqItem } from "@/lib/faq";
import { cn } from "@/lib/utils";

// Shared FAQ accordion for the public marketing pages (home, loans, real
// estate, earn-with-us). Server Component, native <details>/<summary>
// accordion, no client JS or shadcn accordion needed. Accessible and
// keyboard-native by default (Enter/Space toggles the native <summary>).
// Open/close height transition is progressive enhancement (see .faq-details
// in globals.css); browsers without support fall back to an instant toggle.
export type FaqSectionProps = {
  id?: string;
  heading: string;
  subheading?: string;
  items: FaqItem[];
  /** Faint question-mark gutter doodles, lg+ only. Default true. */
  doodles?: boolean;
  /** Split into two side-by-side cards on lg+ for long lists. Default 1. */
  columns?: 1 | 2;
};

export function FaqSection({
  id = "faq",
  heading,
  subheading,
  items,
  doodles = true,
  columns = 1,
}: FaqSectionProps) {
  const headingId = `${id}-heading`;
  const twoCol = columns === 2 && items.length > 1;
  const mid = Math.ceil(items.length / 2);
  const groups = twoCol ? [items.slice(0, mid), items.slice(mid)] : [items];

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      {doodles ? <FaqDoodles /> : null}
      <div
        className={cn(
          "relative mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24",
          twoCol ? "max-w-5xl" : "max-w-3xl",
        )}
      >
        <div className="text-center">
          <h2
            id={headingId}
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            {heading}
          </h2>
          {subheading ? (
            <p className="mt-4 text-lg text-text-secondary">{subheading}</p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-10",
            twoCol ? "grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start" : "",
          )}
        >
          {groups.map((group, groupIndex) => (
            <FaqCard key={groupIndex} items={group} />
          ))}
        </div>
      </div>
    </section>
  );
}

// One rounded card holding a vertical stack of native <details> rows. The
// "no top border on the first row" rule is keyed on the per-card index so each
// column reads as its own clean card.
function FaqCard({ items }: { items: FaqItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm">
      {items.map((item, index) => (
        <details
          key={item.q}
          className={
            index === 0
              ? "faq-details group"
              : "faq-details group border-t border-[var(--nav-border)]"
          }
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-heading text-base font-semibold text-foreground transition-colors duration-200 marker:content-none hover:bg-[var(--nav-tint)]/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)]">
            {item.q}
            <ChevronDown
              className="h-5 w-5 shrink-0 text-brand-blue transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <div className="px-6 pb-5">
            <p className="text-base text-text-secondary">
              {item.aRich ?? item.a}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}
