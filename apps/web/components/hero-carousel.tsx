"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ShieldCheck } from "lucide-react";

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
  interactive = true,
}: {
  banners: HeroBanner[];
  variant?: "hero" | "section";
  label?: string;
  interactive?: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);
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

    if (reducedMotion || interactionPaused) return;

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
  }, [api, banners.length, interactionPaused, reducedMotion]);

  // Embla with zero slides is undefined behavior; the page never intends to
  // pass zero (it falls back to FALLBACK_HERO_BANNERS), but this is
  // belt-and-braces against a caller that forgets to.
  if (banners.length === 0) return null;

  return (
    // Edge to edge and flush against the sticky NavBar above it (no top
    // padding). Both variants are full-bleed: `hero` fills the viewport below
    // the header, `section` uses fixed shorter heights.
    <section
      aria-label={label}
      data-layout={variant === "hero" ? "fullscreen" : "full-bleed"}
      onMouseEnter={() => setInteractionPaused(true)}
      onMouseLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteractionPaused(false);
      }}
      className={cn(
        "relative w-full border-0 bg-[var(--nav-bg)] p-0",
        variant === "section" && "mb-4 sm:mb-5 lg:mb-6",
      )}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "center", containScroll: false, duration: 40 }}
        className="relative w-full"
      >
        {/* ml-0/pl-0 kill shadcn's inter-slide gutter: slides are basis-full
            and edge-to-edge, so any gutter would show as a seam mid-swipe. */}
        <CarouselContent className="ml-0">
          {banners.map((banner, i) => {
            const isSelected = i === selected;
            return (
              <CarouselItem
                key={banner.id}
                aria-hidden={!isSelected}
                inert={!isSelected || undefined}
                className="basis-full pl-0"
              >
                {/* Inner wrapper kept deliberately separate from CarouselItem:
                    CarouselItem is the node Embla repositions with an inline
                    `transform` at the loop's wrap point, and an inline style
                    beats Tailwind classes, so anything transform-adjacent put
                    on that same element gets silently clobbered mid-wrap. Only
                    pointer-events live here now (the former peek
                    scale/opacity/blur went away when both variants became
                    full-bleed), but the split is what keeps it safe to add a
                    transform back later. */}
                <div className={cn(!isSelected && "pointer-events-none")}>
                <div
                  className={cn(
                    "relative w-full overflow-hidden bg-[var(--nav-bg)]",
                    variant === "hero"
                      ? "h-[calc(100svh-4rem)] min-h-[420px]"
                      : "h-[clamp(14rem,36vw,32.5rem)]",
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
                      sizes="100vw"
                      className="object-cover [-webkit-mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,black_62%,black_100%)] [mask-image:linear-gradient(to_right,transparent_0%,transparent_24%,black_62%,black_100%)]"
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

                  {/* Copy overlay — sized to the card itself, not the page container. */}
                  <div
                    className={cn(
                      "relative flex h-full items-center",
                      variant === "hero"
                        ? "px-6 py-10 sm:px-16 lg:px-28"
                        : "py-3 pl-16 pr-16 sm:px-24 sm:py-6 lg:px-28 lg:py-8",
                    )}
                  >
                    <div
                      className={cn(
                        variant === "hero"
                          ? "max-w-[78%] sm:max-w-md lg:max-w-xl"
                          : "max-w-[60%] sm:max-w-[46%] lg:max-w-[42%]",
                      )}
                    >
                      {banner.reraVerified ? (
                        <span className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-amber-500/50 bg-gradient-to-r from-amber-200 to-yellow-400 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-950 shadow-sm sm:text-xs">
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                          RERA VERIFIED
                        </span>
                      ) : null}
                      <h2
                        className={cn(
                          "font-heading font-semibold text-[var(--nav-text)]",
                          variant === "hero"
                            ? "text-2xl sm:text-4xl lg:text-5xl"
                            : "line-clamp-2 text-base sm:text-2xl lg:text-4xl",
                        )}
                      >
                        {banner.title}
                      </h2>
                      {banner.subtitle && (
                        <p
                          className={cn(
                            "mt-3 hidden text-[var(--nav-text)] sm:block",
                            variant === "hero"
                              ? "text-base sm:text-lg lg:text-xl"
                              : "line-clamp-2 text-sm sm:text-base",
                          )}
                        >
                          {banner.subtitle}
                        </p>
                      )}
                      {/* CTA matches the NavBar's primary button (sky-blue --nav-primary). */}
                      {banner.cta && (
                        <Button
                          asChild={interactive}
                          disabled={!interactive}
                          className="mt-2 h-8 max-w-full truncate bg-[var(--nav-primary)] px-3 text-xs text-white shadow-sm hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)] sm:mt-5 sm:h-10 sm:px-4 sm:text-sm"
                        >
                          {interactive ? <Link
                            href={banner.cta.href}
                            tabIndex={isSelected ? undefined : -1}
                          >
                            {banner.cta.label}
                          </Link> : banner.cta.label}
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

        {/* Both variants are full-bleed, so the arrows pin to the container
            edges and sit over the artwork -- hence the white pill for contrast.
            Guarded on banners.length > 1, matching the dot guard below: with
            loop: true and exactly one slide Embla disables looping and both
            arrows would sit there as visible no-ops, which is the most likely
            day-one production state (one approved banner). */}
        {banners.length > 1 && (
          <>
            <CarouselPrevious
              variant="ghost"
              onClick={goPrev}
              className={cn(
                "left-2 h-12 w-12 cursor-pointer rounded-full border-none bg-white/90 text-brand-blue shadow-md transition-[background-color,color,box-shadow] duration-300 hover:bg-white hover:text-brand-blue [&_svg]:size-7 sm:left-3 sm:h-14 sm:w-14 sm:[&_svg]:size-8 lg:left-4",
                // The full-screen hero puts its copy near the left edge, where
                // a phone-width arrow would sit on top of the headline. Swipe
                // and the overlaid dots cover navigation there instead.
                variant === "hero" && "hidden sm:flex",
              )}
            />
            <CarouselNext
              variant="ghost"
              onClick={goNext}
              className={cn(
                "right-2 h-12 w-12 cursor-pointer rounded-full border-none bg-white/90 text-brand-blue shadow-md transition-[background-color,color,box-shadow] duration-300 hover:bg-white hover:text-brand-blue [&_svg]:size-7 sm:right-3 sm:h-14 sm:w-14 sm:[&_svg]:size-8 lg:right-4",
                variant === "hero" && "hidden sm:flex",
              )}
            />
          </>
        )}
      </Carousel>

      {variant === "section" && interactive ? (
        <a
          href="#page-overview"
          aria-label="Scroll to page overview"
          className="absolute bottom-0 left-1/2 z-20 grid h-11 w-11 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border border-brand-blue/20 bg-[var(--nav-bg)] text-brand-blue shadow-[0_8px_18px_-12px_rgba(10,56,88,0.8)] transition-[background-color,box-shadow] hover:bg-[#eaf3f7] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <span className="sr-only">Scroll to page overview</span>
          <ChevronDown
            aria-hidden
            className="section-scroll-cue-first absolute h-4 w-4 -translate-y-1 text-brand-blue"
          />
          <ChevronDown
            aria-hidden
            className="section-scroll-cue-second absolute h-4 w-4 translate-y-1 text-brand-blue"
          />
        </a>
      ) : null}

      {/* Dot indicators — overlaid on the bottom of the full-screen slide, so
          they do not add height beneath a banner that already fills the screen.
          White ink because they now sit over artwork rather than a cream strip. */}
      {variant === "hero" && count > 1 && (
        <div className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-center gap-2">
          {Array.from({ length: count }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => api?.scrollTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === selected}
              className={cn(
                "h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
                i === selected
                  ? "w-6 bg-white shadow-sm ring-1 ring-black/10"
                  : "w-2 bg-white/70 ring-1 ring-black/10 hover:bg-white"
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
