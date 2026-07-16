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
  /** Visual balancing knob: the two illustrations share the same 500x500
   *  canvas and container, but their hand-drawn content fills different
   *  amounts of it, so one can visually read smaller. Defaults to 1. */
  imageScale?: number;
  imageSide: "left" | "right";
  tint: "cream" | "white";
  ctaLabel: string;
  ctaHref: string;
};

const LINES: Line[] = [
  {
    id: "loans",
    name: "Loans",
    title: "Loans, cards, and insurance that fit you",
    paragraph:
      "Every bank and insurer quotes something different, and comparing them gets confusing fast. Tell us what you need once. We find the offers that fit you and stay with you until it is done.",
    benefits: [
      "Compare offers from banks, lenders, and insurers",
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
    title: "Buy your property with confidence",
    paragraph:
      "Buying a property is a big decision. We show you only verified properties and trusted partners, and guide you at every step so there are no surprises.",
    benefits: [
      "Flats, plots, villas, and commercial spaces",
      "Every property and partner is verified upfront",
      "One person helps you from first visit to final paperwork",
    ],
    image: "/illustrations/real-estate.svg",
    imageScale: 1.18,
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
              "mx-auto hidden w-full max-w-[560px] lg:block",
              imageOnRight ? "lg:order-2" : "lg:order-1"
            )}
          >
            {/* Illustration is decorative (alt=""); the band heading carries the
                line name, so no separate DOM label here. imageScale corrects for
                the two illustrations filling their shared 500x500 canvas at
                different visual densities (see Line type comment). */}
            <Image
              src={line.image}
              alt=""
              width={500}
              height={500}
              sizes="560px"
              className="h-auto w-full"
              style={line.imageScale ? { transform: `scale(${line.imageScale})` } : undefined}
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
