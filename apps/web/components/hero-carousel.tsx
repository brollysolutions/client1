"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

// Dynamic-ready banner shape, aligned to the specced `banners` table
// (docs/architecture/master_erd.mermaid). Today the array below is hardcoded
// placeholders; later this becomes data fetched from /api/v1/banners and passed
// in as a prop — no layout rework needed.
type Banner = {
  id: string;
  title: string;
  subtitle?: string; // placeholder flavor; real banners bake copy into the image
  image?: string; // ERD image_key → resolved URL; undefined ⇒ cream placeholder
  cta?: { label: string; href: string }; // href ⇒ ERD deep_link
  // future: business_line, priority, status, starts_at, ends_at
};

// Landscape-only banners (~3:1). Recommended upload: 2400×800, JPG/WebP.
const BANNERS: Banner[] = [
  {
    id: "loans",
    title: "Loans, cards, and insurance that fit you",
    subtitle:
      "All kinds of loans, credit cards, and insurance, matched to what you need.",
    cta: { label: "Explore loans", href: "/loans" },
  },
  {
    id: "real-estate",
    title: "Buy your property with confidence",
    subtitle: "Verified properties and trusted agents, all in one place.",
    cta: { label: "Explore properties", href: "/real-estate" },
  },
  {
    id: "why-us",
    title: "One bridge between you and the banks",
    subtitle:
      "We connect you with the right banks and partners, and stay with you at every step.",
    cta: { label: "Get in touch", href: "#contact" },
  },
  {
    id: "trust",
    title: "Safe and secure, always verified",
    subtitle:
      "OTP login and KYC-verified partners keep every deal safe.",
    cta: { label: "Learn more", href: "#security" },
  },
];

export function HeroCarousel() {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);

  // Drive the dot indicators.
  useEffect(() => {
    if (!api) return;

    setCount(api.scrollSnapList().length);
    setSelected(api.selectedScrollSnap());

    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  // Arrow clicks also jump (no slide) across the loop's last<->first wrap,
  // matching the autoplay behavior below; every other click still animates.
  function goPrev() {
    if (!api) return;
    const isFirstSlide = api.selectedScrollSnap() === 0;
    api.scrollPrev(isFirstSlide);
  }
  function goNext() {
    if (!api) return;
    const isLastSlide =
      api.selectedScrollSnap() === api.scrollSnapList().length - 1;
    api.scrollNext(isLastSlide);
  }

  // Manual autoplay (not the embla-carousel-autoplay plugin) so the last->first
  // wrap can be jumped instantly instead of visibly sliding back through every
  // banner: the plugin always calls scrollNext() with animation, with no hook
  // to make just the wrap hop instant. Every other advance still animates.
  //
  // The 5s timer is a resettable timeout, not a fixed interval: it reschedules
  // on every "select" event (arrow click, dot click, drag, or its own tick), so
  // a manual navigation always buys a fresh 5s before the next autoplay advance
  // instead of colliding with whatever was already pending.
  useEffect(() => {
    if (!api) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const isLastSlide =
        api.selectedScrollSnap() === api.scrollSnapList().length - 1;
      api.scrollNext(isLastSlide);
    };
    const schedule = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(tick, 5000);
    };

    schedule();
    api.on("select", schedule);

    return () => {
      clearTimeout(timeoutId);
      api.off("select", schedule);
    };
  }, [api]);

  return (
    // Cream section spans edge to edge, flush against the sticky NavBar above
    // it (no top padding); the carousel itself is a centered, fixed-size
    // peek-coverflow box (see docs/ai/plans for the sizing math).
    <section aria-label="Highlights" className="w-full bg-[var(--nav-bg)] pb-24 sm:pb-32 lg:pb-40">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "center", containScroll: false, duration: 40 }}
        className="relative w-full"
      >
        {/* ml-0/pl-0 kill shadcn's inter-slide gutter — zero gap keeps the
            peek math (container - basis)/2 exact; the visual gap between
            center and peeked neighbors comes from scale-95 below instead. */}
        <CarouselContent className="ml-0">
          {BANNERS.map((banner, i) => {
            const isSelected = i === selected;
            return (
              <CarouselItem
                key={banner.id}
                aria-hidden={!isSelected}
                inert={!isSelected || undefined}
                className="basis-[90vw] pl-0 sm:basis-[720px] lg:basis-[1200px]"
              >
                {/* Peek scale/opacity/blur lives on this INNER wrapper, not on
                    CarouselItem itself: CarouselItem is the exact node Embla
                    repositions via inline `transform` at the loop's wrap point
                    (last<->first), and an inline style always wins over our
                    Tailwind transform classes — putting scale-90 etc. on the
                    same element let Embla's loop transform silently clobber it,
                    which showed up as an unscaled blurred slide flashing over
                    the newly-selected card during the wrap. Keeping the two
                    transforms on separate elements lets them compose instead
                    of fighting. blur is intentionally excluded from the
                    transitioned properties: animating filter:blur() through
                    intermediate values while text is still legible
                    smears/ghosts it — blur snaps instantly, opacity/scale stay
                    smooth. */}
                <div
                  className={cn(
                    "transition-[transform,opacity] duration-500 ease-out transform-gpu [will-change:transform,opacity]",
                    isSelected
                      ? "opacity-100 blur-0 scale-100"
                      : "pointer-events-none scale-90 opacity-45 blur-[4px]"
                  )}
                >
                <div className="relative aspect-[9/5] w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
                  {/* Media layer: real landscape image fills the card; otherwise
                      a cream placeholder that matches the NavBar (no gray seam). */}
                  {banner.image ? (
                    <Image
                      src={banner.image}
                      alt={banner.title}
                      fill
                      priority={i === 0}
                      sizes="(min-width: 1024px) 1200px, (min-width: 640px) 720px, 90vw"
                      className="object-cover"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-[var(--nav-bg)]" />
                      <span className="pointer-events-none absolute right-4 top-3 z-10 rounded border border-dashed border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Sample
                      </span>
                    </>
                  )}

                  {/* Scrim: keeps the left-aligned copy legible over cream placeholders
                      and (future) photos alike. */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)]/90 via-[var(--nav-bg)]/50 to-transparent" />

                  {/* Copy overlay — sized to the card itself, not the page container. */}
                  <div className="relative flex h-full items-center p-3 sm:p-8 lg:p-10">
                    <div className="max-w-[80%] sm:max-w-sm">
                      <h2 className="font-heading text-base font-semibold text-[var(--nav-text)] sm:text-2xl lg:text-4xl">
                        {banner.title}
                      </h2>
                      {banner.subtitle && (
                        <p className="mt-3 hidden text-sm text-[var(--nav-text)] sm:block sm:text-base">
                          {banner.subtitle}
                        </p>
                      )}
                      {/* CTA matches the NavBar's primary button (sky-blue --nav-primary). */}
                      {banner.cta && (
                        <Button
                          asChild
                          className="mt-2 h-8 bg-[var(--nav-primary)] px-3 text-xs text-white shadow-sm hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:mt-5 sm:h-10 sm:px-4 sm:text-sm"
                        >
                          <Link
                            href={banner.cta.href}
                            tabIndex={isSelected ? undefined : -1}
                          >
                            {banner.cta.label}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {/* Positioned relative to the CENTER CARD's edge (not the container
            edge): left/right offsets are calc(50% ± half the card's own basis
            width from hero's isSelected item) minus a fixed gap, so the arrow
            sits just outside the main banner instead of over the blurred peek.
            Card basis must stay in sync with the CarouselItem basis classes above
            (90vw / 720px / 1200px). */}
        <CarouselPrevious
          variant="ghost"
          onClick={goPrev}
          className="left-[calc(50%-45vw-2.75rem)] h-12 w-12 cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-all duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md [&_svg]:size-7 sm:left-[calc(50%-360px-3rem)] sm:h-14 sm:w-14 sm:[&_svg]:size-8 lg:left-[calc(50%-600px-3rem)]"
        />
        <CarouselNext
          variant="ghost"
          onClick={goNext}
          className="right-[calc(50%-45vw-0.75rem)] h-12 w-12 cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-all duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md [&_svg]:size-7 sm:right-[calc(50%-360px-0.75rem)] sm:h-14 sm:w-14 sm:[&_svg]:size-8 lg:right-[calc(50%-600px-0.75rem)]"
        />
      </Carousel>

      {/* Dot indicators — in the cream strip below the banner (robust over any image). */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === selected}
              className={cn(
                "h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                i === selected ? "w-6 bg-brand-navy" : "w-2 bg-border hover:bg-brand-sky"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
