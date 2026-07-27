import Link from "next/link";

import { LeadDialog } from "@/components/lead-dialog";

// Home page closer. Same bold full-bleed navy band as the Loans page's
// ctaBanner treatment (product-page.tsx), so the last thing a visitor sees
// matches the last thing they'd see on either product page. Line picker in
// the dialog since the home page speaks to both lines equally.
//
// Optional props let other pages (e.g. /earn-with-us) reuse the same band
// with different copy/origin without duplicating the SVG doodles. Absent
// props keep the original home-page behavior unchanged. When `href` is set the
// CTA is a plain link (e.g. to /apply-as-agent) instead of the lead modal.
export function ClosingCta({
  heading = "Ready to get started?",
  text = "Leave your number and we'll call you back, whether you're after a loan or a home.",
  ctaLabel = "Get a callback",
  origin = "closing-cta",
  id = "get-started",
  href,
}: {
  heading?: string;
  text?: string;
  ctaLabel?: string;
  origin?: string;
  id?: string;
  href?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby="closing-cta-heading"
      className="relative w-full scroll-mt-16 overflow-hidden bg-[var(--nav-primary)]"
    >
      <CtaBandDoodles />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <h2
          id="closing-cta-heading"
          className="font-heading text-3xl font-semibold text-white sm:text-4xl"
        >
          {heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">{text}</p>
        <div className="mt-8 flex justify-center">
          {href ? (
            <Link
              href={href}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-[var(--nav-primary)] transition hover:bg-white/90 sm:w-auto"
            >
              {ctaLabel}
            </Link>
          ) : (
            <LeadDialog
              businessLine="loans"
              lineSelectable
              origin={origin}
              triggerLabel={ctaLabel}
              triggerVariant="invert"
            />
          )}
        </div>
      </div>
    </section>
  );
}

// Faint finance line-doodles bleeding in from the edges, matching the same
// vocabulary + treatment as product-page.tsx's CtaBandDoodles so both closing
// bands read as one family. Decorative on every viewport: at 10% opacity they
// are texture, not content, so below lg they shrink and tuck into opposite
// corners (top-left / bottom-right) instead of sitting mid-band behind the
// centered copy.
function CtaBandDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden text-white opacity-10"
    >
      <svg
        className="absolute -left-8 top-4 h-24 w-32 sm:h-32 sm:w-40 lg:-left-6 lg:top-1/2 lg:h-40 lg:w-52 lg:-translate-y-1/2"
        viewBox="0 0 200 160"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g transform="translate(16,20)">
          <circle cx="18" cy="18" r="16" />
          <text
            x="18"
            y="24"
            textAnchor="middle"
            fontSize="17"
            fontWeight={700}
            fill="currentColor"
            stroke="none"
            fontFamily="system-ui, sans-serif"
          >
            &#8377;
          </text>
        </g>
        <g transform="translate(96,44)">
          <polyline points="2 38 16 24 26 30 44 8" />
          <polyline points="34 8 44 8 44 18" />
        </g>
        <g transform="translate(40,104)">
          <circle cx="8" cy="8" r="6" />
          <circle cx="30" cy="30" r="6" />
          <line x1="34" y1="4" x2="4" y2="34" />
        </g>
      </svg>

      <svg
        className="absolute -right-8 bottom-4 h-24 w-32 sm:h-32 sm:w-40 lg:bottom-auto lg:-right-6 lg:top-1/2 lg:h-40 lg:w-52 lg:-translate-y-1/2"
        viewBox="0 0 200 160"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g transform="translate(24,20)">
          <path d="M2 20 L22 3 L42 20" />
          <rect x="8" y="20" width="28" height="20" />
          <rect x="18" y="28" width="8" height="12" />
        </g>
        <g transform="translate(104,24)">
          <polyline points="2 38 16 24 26 30 44 8" />
          <polyline points="34 8 44 8 44 18" />
        </g>
        <g transform="translate(60,100)">
          <circle cx="18" cy="18" r="16" />
          <text
            x="18"
            y="24"
            textAnchor="middle"
            fontSize="17"
            fontWeight={700}
            fill="currentColor"
            stroke="none"
            fontFamily="system-ui, sans-serif"
          >
            &#8377;
          </text>
        </g>
      </svg>
    </div>
  );
}
