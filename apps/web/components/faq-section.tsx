import { ChevronDown } from "lucide-react";

import type { FaqItem } from "@/lib/faq";

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
};

export function FaqSection({
  id = "faq",
  heading,
  subheading,
  items,
  doodles = true,
}: FaqSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      {doodles ? <FaqDoodles /> : null}
      <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
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

        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm">
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
      </div>
    </section>
  );
}

// Faint question-mark doodles in the FAQ side gutters, shades of blue, low opacity
// so they read as a soft background texture (not decoration competing with the copy).
// Desktop-only (lg+), pointer-events-none, sit behind the accordion.
type QMark = {
  top: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  opacity: number;
  rot: number;
};

const QMARKS: QMark[] = [
  { top: "8%", left: "7%", size: 92, color: "#4274D9", opacity: 0.09, rot: -15 },
  { top: "28%", left: "3%", size: 56, color: "#95CCDD", opacity: 0.22, rot: 22 },
  { top: "63%", left: "9%", size: 118, color: "#293681", opacity: 0.07, rot: -4 },
  { top: "89%", left: "4%", size: 48, color: "#4274D9", opacity: 0.16, rot: 18 },
  { top: "18%", right: "6%", size: 76, color: "#293681", opacity: 0.11, rot: -20 },
  { top: "46%", right: "9%", size: 130, color: "#95CCDD", opacity: 0.13, rot: 6 },
  { top: "74%", right: "3%", size: 58, color: "#4274D9", opacity: 0.19, rot: -9 },
];

function FaqDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      {QMARKS.map((q, i) => (
        <span
          key={i}
          className="absolute select-none font-heading font-bold leading-none"
          style={{
            top: q.top,
            left: q.left,
            right: q.right,
            fontSize: q.size,
            color: q.color,
            opacity: q.opacity,
            transform: `rotate(${q.rot}deg)`,
          }}
        >
          ?
        </span>
      ))}
    </div>
  );
}
