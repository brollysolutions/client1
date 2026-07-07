import { CheckIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Landing page is blue-only (see hero-carousel + lead-dialog): Loans and Real
// Estate are told apart by illustration side + alternating band tint, not by
// hue. Loans-green/realestate-amber stay reserved for authenticated role
// dashboards, per docs/design/ui-principles.md.
type Line = {
  id: string;
  name: string;
  title: string;
  paragraph: string;
  benefits: string[];
  image: string;
  imageSide: "left" | "right";
  tint: "cream" | "white";
  ctaLabel: string;
  ctaHref: string;
};

const LINES: Line[] = [
  {
    id: "loans",
    name: "Loans",
    title: "Find the loan that fits you",
    paragraph:
      "Every lender shows a different rate, and it gets confusing fast. Tell us what you need once, and we find loan offers that suit you and help you until the money reaches your account.",
    benefits: [
      "Compare offers from many banks and lenders",
      "Check if you qualify before you apply",
      "KYC-verified partners keep your documents safe",
    ],
    image: "/illustrations/loans.svg",
    imageSide: "left",
    tint: "cream",
    ctaLabel: "Explore loans",
    ctaHref: "/loans",
  },
  {
    id: "real-estate",
    name: "Real Estate",
    title: "Buy or rent with confidence",
    paragraph:
      "Buying or renting a home is a big decision. We show you only verified homes and agents, and guide you at every step so there are no surprises.",
    benefits: [
      "Buy or rent, all in one place",
      "Every home and agent is verified before you see it",
      "One person helps you from first visit to final paperwork",
    ],
    image: "/illustrations/real-estate.svg",
    imageSide: "right",
    tint: "cream",
    ctaLabel: "Explore properties",
    ctaHref: "/real-estate",
  },
];

function Band({ line, paddingClassName }: { line: Line; paddingClassName: string }) {
  const imageOnRight = line.imageSide === "right";

  return (
    <section
      id={line.id}
      aria-labelledby={`${line.id}-heading`}
      className={cn(
        "w-full scroll-mt-16",
        line.tint === "cream" ? "bg-[var(--nav-bg)]" : "bg-surface",
        paddingClassName
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Illustration */}
          <div
            className={cn(
              "mx-auto w-full max-w-[320px] sm:max-w-[420px] lg:max-w-[560px]",
              imageOnRight ? "lg:order-2" : "lg:order-1"
            )}
          >
            {/* Illustration is decorative (alt=""); the band heading carries the
                line name, so no separate DOM label here. */}
            <Image
              src={line.image}
              alt=""
              width={500}
              height={500}
              sizes="(min-width: 1024px) 560px, (min-width: 640px) 420px, 320px"
              className="h-auto w-full"
              priority={false}
            />
          </div>

          {/* Copy */}
          <div
            className={cn(
              "text-center lg:text-left",
              imageOnRight ? "lg:order-1" : "lg:order-2"
            )}
          >
            <h2
              id={`${line.id}-heading`}
              className="font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl lg:text-5xl"
            >
              {line.title}
            </h2>
            <p className="mt-4 text-lg text-[var(--nav-text)] sm:text-xl">
              {line.paragraph}
            </p>
            <ul className="mt-7 space-y-4 text-left">
              {line.benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <CheckIcon
                    className="mt-0.5 h-6 w-6 shrink-0 text-brand-blue"
                    aria-hidden
                  />
                  <span className="text-base text-foreground sm:text-lg">
                    {benefit}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-center lg:justify-start">
              <Button
                asChild
                className="w-full bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:w-auto"
              >
                <Link href={line.ctaHref}>{line.ctaLabel}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LineSplit() {
  return (
    <>
      <Band
        line={LINES[0]}
        paddingClassName="pt-6 pb-16 sm:pt-8 sm:pb-20 lg:pt-10 lg:pb-24"
      />
      <Band
        line={LINES[1]}
        paddingClassName="py-16 sm:py-20 lg:py-24"
      />
    </>
  );
}
