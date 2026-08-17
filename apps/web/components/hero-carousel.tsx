"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { HeroBanner } from "@/lib/banners";
import { cn } from "@/lib/utils";

// Banners now come from GET /api/v1/public/banners (see
// docs/specs/public-banner-serving.md), fetched server-side by
// app/(public)/page.tsx and passed in here. `banners` is a required prop with
// no default so tsc catches a call site that forgot to fetch; the caller is
// also responsible for falling back to lib/banners.ts's
// FALLBACK_HERO_BANNERS when the CMS has nothing live.
export function HeroCarousel({
  banners,
  variant = "hero",
  label = "Highlights",
}: {
  banners: HeroBanner[];
  variant?: "hero" | "section";
  label?: string;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
    if (!api || banners.length <= 1) return;

    if (reducedMotion || userPaused || interactionPaused) return;

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
  }, [api, banners.length, interactionPaused, reducedMotion, userPaused]);

  // Embla with zero slides is undefined behavior; the page never intends to
  // pass zero (it falls back to FALLBACK_HERO_BANNERS), but this is
  // belt-and-braces against a caller that forgets to.
  if (banners.length === 0) return null;

  return (
    // Cream section spans edge to edge, flush against the sticky NavBar above
    // it (no top padding); the carousel itself is a centered, fixed-size
    // peek-coverflow box (see docs/ai/plans for the sizing math).
    <section
      aria-label={label}
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false);
      }}
      className={cn(
        "relative w-full bg-[var(--nav-bg)]",
        variant === "hero"
          ? "pb-24 sm:pb-32 lg:pb-40"
          : "border-y border-[var(--nav-border)] py-6 sm:py-8",
      )}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "center", containScroll: false, duration: 40 }}
        className="relative w-full"
      >
        {/* ml-0/pl-0 kill shadcn's inter-slide gutter — zero gap keeps the
            peek math (container - basis)/2 exact; the visual gap between
            center and peeked neighbors comes from scale-95 below instead. */}
        <CarouselContent className="ml-0">
          {banners.map((banner, i) => {
            const isSelected = i === selected;
            return (
              <CarouselItem
                key={banner.id}
                aria-hidden={!isSelected}
                inert={!isSelected || undefined}
                className={cn(
                  "pl-0",
                  variant === "hero"
                    ? "basis-[90vw] sm:basis-[720px] lg:basis-[1200px]"
                    : "basis-[90vw] sm:basis-[680px] lg:basis-[1040px]",
                )}
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
                    "transition-[transform,opacity] duration-500 ease-out transform-gpu motion-reduce:transition-none [will-change:transform,opacity]",
                    isSelected
                      ? "opacity-100 blur-0 scale-100"
                      : "pointer-events-none scale-90 opacity-45 blur-[4px]"
                  )}
                >
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-2xl bg-[var(--nav-bg)] shadow-lg ring-1 ring-black/5",
                    variant === "hero" ? "aspect-[9/5]" : "aspect-[5/2]",
                  )}
                >
                  {/* Media layer: real landscape image fills the card; otherwise
                      a cream placeholder that matches the NavBar (no gray seam). */}
                  {banner.image ? (
                    <Image
                      src={banner.image}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="(min-width: 1024px) 1200px, (min-width: 640px) 720px, 90vw"
                      className={cn(
                        "object-cover",
                        variant === "section" &&
                          "[-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,black_62%,black_100%)] [mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,black_62%,black_100%)]",
                      )}
                      // next/image's default loader proxies through /_next/image,
                      // fetched SERVER-SIDE by the web process -- not the same
                      // reachability as the browser's direct request this URL is
                      // otherwise built for (see services/storage.py's
                      // internal-vs-public split; in dev, minio's public host is
                      // only resolvable from the browser, not the web container,
                      // and the proxy 500s). Banner images are already capped at
                      // 2 MiB and pre-compressed on upload, so skipping Next's
                      // re-optimization for this one image class is a deliberate
                      // trade, not a workaround: one less network hop, and one
                      // less way for this specific card to fail.
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--nav-bg)]" />
                  )}

                  {/* Scrim: keeps the left-aligned copy legible over cream placeholders
                      and (future) photos alike. */}
                  {variant === "hero" ? (
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)]/90 via-[var(--nav-bg)]/50 to-transparent" />
                  ) : null}

                  {/* Copy overlay — sized to the card itself, not the page container. */}
                  <div
                    className={cn(
                      "relative flex h-full items-center",
                      variant === "hero" ? "p-3 sm:p-8 lg:p-10" : "p-3 sm:p-6 lg:p-8",
                    )}
                  >
                    <div
                      className={cn(
                        variant === "hero"
                          ? "max-w-[80%] sm:max-w-sm"
                          : "max-w-[60%] sm:max-w-[46%] lg:max-w-[42%]",
                      )}
                    >
                      {banner.offerBadge ? (
                        <span className="mb-3 inline-flex rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-brand-navy shadow-sm backdrop-blur-sm">
                          {banner.offerBadge}
                        </span>
                      ) : null}
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
            (90vw / 720px / 1200px). Guarded on banners.length > 1, matching the
            dot-strip guard below: with loop: true and exactly one slide, Embla
            disables looping and both arrows would otherwise sit there as
            visible no-ops -- the most likely day-one production state (one
            approved banner). */}
        {banners.length > 1 && (
          <>
            <CarouselPrevious
              variant="ghost"
              onClick={goPrev}
              className={cn(
                "left-[calc(50%-45vw-2.75rem)] h-12 w-12 cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-[background-color,color,box-shadow] duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md [&_svg]:size-7 sm:h-14 sm:w-14 sm:[&_svg]:size-8",
                variant === "hero"
                  ? "sm:left-[calc(50%-360px-3rem)] lg:left-[calc(50%-600px-3rem)]"
                  : "sm:left-[calc(50%-340px-3rem)] lg:left-[calc(50%-520px-3rem)]",
              )}
            />
            <CarouselNext
              variant="ghost"
              onClick={goNext}
              className={cn(
                "right-[calc(50%-45vw-0.75rem)] h-12 w-12 cursor-pointer rounded-full border-none bg-transparent text-brand-blue drop-shadow-sm transition-[background-color,color,box-shadow] duration-300 hover:bg-white/40 hover:text-brand-blue hover:backdrop-blur-md hover:shadow-md [&_svg]:size-7 sm:h-14 sm:w-14 sm:[&_svg]:size-8",
                variant === "hero"
                  ? "sm:right-[calc(50%-360px-0.75rem)] lg:right-[calc(50%-600px-0.75rem)]"
                  : "sm:right-[calc(50%-340px-0.75rem)] lg:right-[calc(50%-520px-0.75rem)]",
              )}
            />
          </>
        )}
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
                "h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                i === selected ? "w-6 bg-brand-navy" : "w-2 bg-border hover:bg-brand-sky"
              )}
            />
          ))}
          <button
            type="button"
            disabled={reducedMotion}
            onClick={() => setUserPaused((paused) => !paused)}
            aria-label={
              reducedMotion
                ? "Autoplay disabled by reduced motion preference"
                : userPaused
                  ? "Resume banner autoplay"
                  : "Pause banner autoplay"
            }
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-brand-navy transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
          >
            {userPaused || reducedMotion ? (
              <Play className="h-4 w-4" aria-hidden />
            ) : (
              <Pause className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      )}
    </section>
  );
}
