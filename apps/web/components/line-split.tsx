import { type CSSProperties } from "react";

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
      "Buying a property is a big decision. We show you only verified properties and trusted agents, and guide you at every step so there are no surprises.",
    benefits: [
      "Flats, plots, villas, and commercial spaces",
      "Every property and agent is verified before you see it",
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
        // overflow-x-clip: the lg+ illustration scale transform can extend the
        // scrollable area past the viewport on narrow desktops (~1024px),
        // producing a page-wide horizontal scrollbar; clip (not hidden) trims
        // the decorative spill without creating a scroll container.
        "w-full scroll-mt-16 overflow-x-clip",
        line.tint === "cream" ? "bg-[var(--nav-bg)]" : "bg-surface",
        paddingClassName
      )}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 sm:gap-10 md:grid-cols-2 lg:gap-16">
          {/* Illustration. Stacked above the copy on mobile (it opens the band),
              side-by-side with it from md so tablets read like the desktop
              layout. Sizes step up with the viewport; below md the grid is one
              column so the mx-auto cap keeps the scene from swallowing the
              screen. */}
          <div
            className={cn(
              "mx-auto w-full max-w-[280px] sm:max-w-[380px] md:max-w-[460px] lg:max-w-[560px]",
              imageOnRight ? "md:order-2" : "md:order-1"
            )}
          >
            {/* Illustration is decorative (alt=""); the band heading carries the
                line name, so no separate DOM label here. imageScale corrects for
                the two illustrations filling their shared 500x500 canvas at
                different visual densities (see Line type comment) — applied lg+
                only: below lg the transform's visual overflow could poke past
                the viewport / into the copy column. NB the arbitrary
                [transform:...] writes the transform property directly, so don't
                add Tailwind translate/rotate/scale utilities to this element —
                they'd emit a second, conflicting transform declaration. */}
            <Image
              src={line.image}
              alt=""
              width={500}
              height={500}
              sizes="(min-width: 1024px) 560px, (min-width: 768px) 50vw, (min-width: 640px) 380px, 280px"
              className={cn(
                "h-auto w-full",
                line.imageScale && "lg:[transform:scale(var(--illus-scale))]"
              )}
              style={
                line.imageScale
                  ? ({ "--illus-scale": line.imageScale } as CSSProperties)
                  : undefined
              }
              priority={false}
            />
          </div>

          {/* Copy */}
          <div
            className={cn(
              "text-left",
              imageOnRight ? "md:order-1" : "md:order-2"
            )}
          >
            {/* The sm→md size DOWN-step is deliberate: at md the grid splits into
                two columns, so the heading's room halves until lg widens it. */}
            <h2
              id={`${line.id}-heading`}
              className="font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl md:text-3xl lg:text-5xl"
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
            <div className="mt-6 flex justify-start">
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
