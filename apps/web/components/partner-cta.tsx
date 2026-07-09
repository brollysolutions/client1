import { type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LeadDialog } from "@/components/lead-dialog";

// Home "Earn with Us" teaser: the supply-side pitch (agents), as a single split
// editorial band, content on the left, a colorful Storyset illustration on the
// right. Recruits for BOTH lines; agents are single-line. This is a short
// teaser that points at the full /earn-with-us page for eligibility, how
// earning works, the loans-vs-real-estate breakdown, and the expanded FAQ; a
// secondary "Apply now" shortcut stays here for visitors who already decided.
// Illustration is Storyset "consulting/cuate" (kept colorful, natural; credit
// in site-footer); UI accents stay blue. No invented numbers.
export function PartnerCta() {
  return (
    <section
      id="partners"
      aria-labelledby="partners-heading"
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <EarnDoodles />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-16">
          {/* Content */}
          <div className="lg:order-1">
            <h2
              id="partners-heading"
              className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
            >
              Earn with us
            </h2>
            <p className="mt-4 max-w-md text-lg text-text-secondary">
              Bring people the right loan or the right home, and earn
              commission on what closes. Apply for free, we verify your KYC,
              and you start earning.
            </p>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button
                asChild
                className="w-full bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] sm:w-auto"
              >
                <Link href="/earn-with-us">Learn how it works</Link>
              </Button>
              <LeadDialog
                businessLine="loans"
                lineSelectable
                origin="agent-application"
                triggerVariant="outline"
                triggerLabel="Apply now"
                title="Apply to become an agent"
                description="Tell us your details and pick a line. We'll verify your KYC and get you started."
                submitLabel="Submit application"
              />
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              Free to apply. We verify every agent before they go live.
            </p>
          </div>

          {/* Illustration (decorative + desktop-only, lg+). Transparent, sits
              directly on the cream section so it blends, no boxed panel. Large and
              centered in the right column, like the line-split band illustrations. */}
          <div className="hidden lg:order-2 lg:flex lg:items-center lg:justify-center">
            <Image
              src="/illustrations/agent-earning.svg"
              alt=""
              width={720}
              height={720}
              sizes="640px"
              className="mx-auto h-auto w-full max-w-[640px]"
              priority={false}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// A few natural decorative doodles (butterflies + leafy sprigs) for the Earn band.
// Desktop-only (lg+), pointer-events-none, sit behind the content, and drift gently
// (.doodle-float in globals.css). Positions hug the gutters so they never cover copy.
// Natural colors per docs/design/illustration-style.md.
type NatureDoodle = {
  top: string;
  left?: string;
  right?: string;
  size: number;
  dur: string;
  delay: string;
  opacity: number;
};

const NATURE_DOODLES: NatureDoodle[] = [
  { top: "15%", right: "7%", size: 40, dur: "7s", delay: "0s", opacity: 0.8 },
  { top: "24%", left: "44%", size: 28, dur: "8.5s", delay: "1.1s", opacity: 0.7 },
  { top: "58%", left: "4%", size: 36, dur: "9s", delay: "0.5s", opacity: 0.75 },
  { top: "44%", right: "4%", size: 30, dur: "8s", delay: "1.5s", opacity: 0.7 },
];

function EarnDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      {NATURE_DOODLES.map((d, i) => (
        <span
          key={i}
          className="doodle-float absolute block"
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            width: d.size,
            height: d.size,
            opacity: d.opacity,
            animationDelay: d.delay,
            "--doodle-dur": d.dur,
          } as CSSProperties}
        >
          <Butterfly />
        </span>
      ))}
    </div>
  );
}

function Butterfly() {
  return (
    <svg viewBox="0 0 40 40" fill="none" className="h-full w-full">
      <line x1="20" y1="14" x2="20" y2="30" stroke="#293681" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="12.5" cy="16" rx="8.5" ry="6.5" fill="#4274D9" />
      <ellipse cx="27.5" cy="16" rx="8.5" ry="6.5" fill="#4274D9" />
      <ellipse cx="14.5" cy="27" rx="6.5" ry="5" fill="#E8905C" />
      <ellipse cx="25.5" cy="27" rx="6.5" ry="5" fill="#E8905C" />
      <circle cx="10" cy="16" r="1.8" fill="#FFFFFF" opacity="0.7" />
      <circle cx="30" cy="16" r="1.8" fill="#FFFFFF" opacity="0.7" />
      <circle cx="20" cy="13" r="2.2" fill="#293681" />
      <path d="M20 12 Q17 6 14 5 M20 12 Q23 6 26 5" stroke="#293681" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

