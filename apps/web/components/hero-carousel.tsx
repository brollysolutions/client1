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

// Landscape banners. Recommended upload: 2400×1200 (2:1), JPG/WebP, <150KB.
// The card is 3:2 on phones and 9:5 from sm up (see the ratio spacer below), so
// a 2:1 upload center-crops modestly on both — keep key content (subject/copy
// area) inside the central ~75% of the frame. A 3:1 upload still works but loses
// a third of its width to the mobile crop.
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
    cta: { label: "Get in touch", href: "/contact" },
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
    // Cream section spans edge to edge, with a small top gap separating the
    // card from the sticky NavBar (whose border-b marks the seam). Card width
    // is declared ONCE as --hero-w on the Carousel root below; slide basis and
    // arrow offsets both derive from it, so the peek math can never drift out
    // of sync. Mobile is 100% - 2rem: a 1rem side margin is the app-shell
    // standard on phones (Material/iOS list gutter, and what the big consumer
    // apps use for their home banners), and it leaves 1rem of the blurred
    // neighbour visible per side — inside the 8–16px peek real carousels use.
    // sm+ min(fixed, 100% - 8rem)
    // keeps a >=4rem gutter per side at every viewport (no overflow at
    // narrow-desktop widths like 1024px). Percentages, not vw: both flex-basis
    // and the arrows' `left/right` resolve % against the same full-bleed width,
    // so the math is exact and scrollbar-proof.
    // The layout is the same shape at every breakpoint — a normal-flow section
    // holding a landscape card — and only scales down on phones. It is
    // deliberately NOT a full-viewport-height hero: banners are landscape, so
    // stretching the card to the fold turned it into a portrait box with the
    // copy adrift in empty cream and photos cropped to nothing.
    // Bottom padding scales with the card, not with the breakpoint alone: the
    // mobile card is roughly half the tablet card's height, so the sm+ pb-32
    // left a void under it that read as a broken section. pb-14 keeps the gap
    // to the next band (LineSplit opens with pt-6) proportional to the card.
    <section aria-label="Highlights" className="w-full bg-[var(--nav-bg)] pt-1 pb-14 sm:pt-2 sm:pb-32 lg:pt-4 lg:pb-40">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "center", containScroll: false, duration: 40 }}
        className="relative w-full [--hero-w:calc(100%_-_2rem)] sm:[--hero-w:min(720px,calc(100%_-_8rem))] lg:[--hero-w:min(1200px,calc(100%_-_8rem))]"
      >
        {/* ml-0/pl-0 kill shadcn's inter-slide gutter — zero gap keeps the
            peek math (container - basis)/2 exact; the visual gap between
            center and peeked neighbors comes from the peek scale below
            instead. py-4 gives the cards' soft shadow vertical room: the
            track's overflow-hidden wrapper otherwise clips it flush at the
            card edge, leaving a hard line that reads as a second container
            behind the card. (The section's pt-* values above absorb it, keeping
            the visual gap under the NavBar small.) */}
        <CarouselContent className="ml-0 py-4">
          {BANNERS.map((banner, i) => {
            const isSelected = i === selected;
            return (
              <CarouselItem
                key={banner.id}
                aria-hidden={!isSelected}
                inert={!isSelected || undefined}
                className="basis-[var(--hero-w)] pl-0"
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
                    "h-full transition-[transform,opacity] duration-500 ease-out transform-gpu [will-change:transform,opacity]",
                    isSelected
                      ? "opacity-100 blur-0 scale-100"
                      // scale-95 on mobile, scale-90 from sm up. The peek is
                      // only as visible as the part of the neighbour that
                      // reaches into the gutter, and the shrink works against
                      // the gutter: at sm+ a 0.9 scale on a 640px card leaves
                      // ~32px of the 64px gutter covered, but on a ~358px phone
                      // card the same 0.9 leaves only ~2px of the 16px gutter
                      // covered — invisible, especially while the placeholders
                      // are cream-on-cream. 0.95 keeps ~9px of that 16px, which
                      // reads as a card edge instead of a sliver.
                      : "pointer-events-none scale-95 opacity-45 blur-[4px] sm:scale-90"
                  )}
                >
                <div className="relative grid h-full w-full grid-rows-[1fr] overflow-hidden rounded-2xl shadow-[0_0_16px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
                  {/* Ratio spacer — sets the card's preferred height: 3:2 on
                      phones, 9:5 (1.8:1) from sm up.
                      Real-world sizing: image-only mobile banners cluster in
                      the 16:9–2:1 band (1.91:1 is the Meta/Google carousel
                      card), but a hero that carries an overlaid headline +
                      subtitle + CTA — like this one — is consistently given a
                      taller crop on phones (3:2 / 4:3) because 1.8:1 across a
                      ~350px card leaves no vertical room for type. This card
                      was previously 9:5 on mobile and the copy overshot it on
                      most phones, so the "ratio" was fiction and the copy had
                      to be shrunk (text-xs) and clamped to hide it. 3:2 is the
                      honest number: the copy block now fits inside it with
                      slack on a 390px phone, and only a 320px screen pushes
                      past it.
                      It shares grid cell 1/1 with the copy
                      overlay below, so the card's height is max(ratio, copy):
                      with overflow-hidden a plain aspect-* box would clip the
                      tallest banner's copy on very narrow screens (CSS drops
                      the content-based minimum height when overflow isn't
                      visible). So 9:5 is a FLOOR, not a clamp — on ~320px
                      phones the title wraps to a third line and the card grows
                      a little past the ratio rather than truncating. The
                      h-full chain (CarouselItem flex-stretch → peek wrapper →
                      this card) keeps every slide the same height as the
                      tallest one, so the gap between card bottom and the dots
                      never jumps mid-swipe; the 1fr row lets the overlay fill
                      that stretched height. */}
                  <div className="col-start-1 row-start-1 aspect-[3/2] sm:aspect-[9/5]" />
                  {/* Media layer: real landscape image fills the card; otherwise
                      a cream placeholder that matches the NavBar (no gray seam). */}
                  {banner.image ? (
                    <Image
                      src={banner.image}
                      alt={banner.title}
                      fill
                      priority={i === 0}
                      sizes="(min-width: 1024px) min(1200px, calc(100vw - 8rem)), (min-width: 640px) min(720px, calc(100vw - 8rem)), calc(100vw - 2rem)"
                      className="object-cover"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-[var(--nav-bg)]" />
                      {/* Bottom-right on mobile: the copy column runs to 88%
                          of the narrow card, so a top-right badge collides
                          with the title's first line. The CTA keeps the
                          bottom-left, leaving that corner free. */}
                      <span className="pointer-events-none absolute bottom-2 right-3 z-10 rounded border border-dashed border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:bottom-auto sm:right-4 sm:top-3">
                        Sample
                      </span>
                    </>
                  )}

                  {/* Scrim: keeps the left-aligned copy legible over cream
                      placeholders and (future) photos alike. The mobile tail
                      stays partly opaque because the copy column runs to 88%
                      of the narrow card — at sm+ the column is max-w-sm inside
                      a much wider card, so the gradient can fade out fully. */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)]/90 via-[var(--nav-bg)]/60 to-[var(--nav-bg)]/20 sm:via-[var(--nav-bg)]/50 sm:to-transparent" />

                  {/* Copy overlay — sized to the card itself, not the page
                      container. Shares grid cell 1/1 with the ratio spacer
                      above (see its comment). */}
                  <div className="relative col-start-1 row-start-1 flex items-center p-5 sm:p-8 lg:p-10">
                    {/* Wider copy column on mobile (88% vs the sm+ max-w-sm):
                        fewer wrapped lines keeps the block comfortably inside
                        the 3:2 box even when the title takes three lines. */}
                    <div className="max-w-[88%] sm:max-w-sm">
                      <h2 className="font-heading text-xl font-semibold text-[var(--nav-text)] sm:text-2xl lg:text-4xl">
                        {banner.title}
                      </h2>
                      {/* text-sm, not text-xs: 12px body copy on a phone is
                          below the readable floor, and the taller 3:2 card has
                          the room for 14px. line-clamp-2 stays as the safety
                          valve for longer banner copy on ~320px screens. */}
                      {banner.subtitle && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--nav-text)] sm:mt-3 sm:line-clamp-none sm:text-base">
                          {banner.subtitle}
                        </p>
                      )}
                      {/* CTA matches the NavBar's primary button (sky-blue --nav-primary). */}
                      {banner.cta && (
                        <Button
                          asChild
                          className="mt-3.5 h-10 bg-[var(--nav-primary)] px-4 text-sm text-white shadow-sm hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:mt-5"
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

        {/* Hidden on mobile (swipe + dots only; the slim 1.5rem gutter can't
            fit them). From sm up: positioned relative to the CENTER CARD's edge via
            the shared --hero-w var — calc(50% - hero-w/2) lands on the card
            edge; the extra 3.75rem places the 3.5rem-wide arrow just outside
            it, symmetric on both sides. The min() in --hero-w guarantees a
            >=4rem gutter, so the arrow always fits on-screen. Vertical: the
            Carousel root spans exactly the card row (dots live outside it), so
            the default top-1/2 centers on the banner. */}
        <CarouselPrevious
          variant="ghost"
          onClick={goPrev}
          className="hidden cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-all duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md sm:left-[calc(50%-var(--hero-w)/2-3.75rem)] sm:inline-flex sm:h-14 sm:w-14 sm:[&_svg]:size-8"
        />
        <CarouselNext
          variant="ghost"
          onClick={goNext}
          className="hidden cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-all duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md sm:right-[calc(50%-var(--hero-w)/2-3.75rem)] sm:inline-flex sm:h-14 sm:w-14 sm:[&_svg]:size-8"
        />
      </Carousel>

      {/* Dot indicators — in the cream strip below the banner (robust over any image). */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 py-3">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === selected}
              className={cn(
                "h-2 cursor-pointer rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                i === selected ? "w-6 bg-brand-navy" : "w-2 bg-border hover:bg-brand-sky"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
