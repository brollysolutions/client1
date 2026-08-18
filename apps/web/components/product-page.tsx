import type { ReactNode } from "react";
import Image from "next/image";

import { FaqSection } from "@/components/faq-section";
import { JourneyFootTrail } from "@/components/journey-foot-trail";
import { LeadDialog } from "@/components/lead-dialog";
import { ScrollCue } from "@/components/scroll-cue";
import { TrustStrip } from "@/components/trust-strip";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FaqItem } from "@/lib/faq";
import { contactHref, type LeadBusinessLine } from "@/lib/leads";
import type { JourneyStep, ProductBand, TrustPoint } from "@/lib/products";
import { cn } from "@/lib/utils";

// Shared layout for the public Loans and Real Estate marketing pages
// (app/(public)/loans, app/(public)/real-estate). Both pages are identical in
// shape and differ only in copy and data, so the skeleton lives here once.
//
// Blue-only, like the rest of the public site: loans-green / realestate-amber
// stay reserved for authenticated dashboards (docs/design/ui-principles.md).
// This is a Server Component; the only interactive island is LeadDialog, which
// is a client component on its own.

export type ProductPageProps = {
  eyebrow?: string;
  title: string;
  intro: string;
  /** Full-bleed decorative illustration behind the hero copy. */
  heroBackdrop?: string;
  /** Faint finance line-doodles in the hero's right side + corners (lg+ only). */
  heroDoodles?: boolean;
  /** Grounded hero illustration src (right edge, lg+). Defaults to the cherry tree. */
  heroPlant?: string;
  /** Products grid heading. Omit (with no `products`) to skip the grid entirely. */
  productsHeading?: string;
  /** Small uppercase eyebrow above the products heading. */
  productsEyebrow?: string;
  /** Optional supporting line under the products heading. */
  productsSubheading?: string;
  /** Trust points rendered as a full-width TrustStrip at the foot of the
   *  products section, below every band. */
  productsTrust?: { eyebrow?: string; points: TrustPoint[] };
  /** Cards per row at lg and up. Defaults to 3. */
  productColumns?: 3 | 4;
  /** Faint finance line-doodles in the products section margins (lg+ only). */
  productDoodles?: boolean;
  /** Labeled category bands for the products grid. Omit to skip the grid
   *  entirely (e.g. the Properties page, which renders its own catalog via
   *  `beforeJourney` instead). Each band's own `cta`/`trust`, if set, renders
   *  as an extra tile in that band's grid. */
  productBands?: ProductBand[];
  /** Custom sections injected after the products grid and before the journey. */
  beforeJourney?: ReactNode;
  /** Campaign carousel rendered at the top of the page, before the permanent hero. */
  beforeHero?: ReactNode;
  journeyHeading: string;
  journey: JourneyStep[];
  /** Render the journey as a connected timeline with bespoke glyphs (lg+). Off = plain stacked steps. */
  journeyTimeline?: boolean;
  /** FAQ accordion between the journey and the closing CTA. Omit to skip. */
  faq?: { heading: string; subheading?: string; items: FaqItem[] };
  ctaHeading: string;
  ctaText: string;
  ctaLabel: string;
  /** Render the closing CTA as a bold full-bleed navy band (loans). Off = calm light block. */
  ctaBanner?: boolean;
  businessLine: LeadBusinessLine;
};

export function ProductPage({
  eyebrow,
  title,
  intro,
  heroBackdrop,
  heroDoodles = false,
  heroPlant,
  productsHeading,
  productsEyebrow,
  productsSubheading,
  productsTrust,
  productColumns = 3,
  productDoodles = false,
  productBands,
  beforeHero,
  beforeJourney,
  journeyHeading,
  journey,
  journeyTimeline = false,
  faq,
  ctaHeading,
  ctaText,
  ctaLabel,
  ctaBanner = false,
  businessLine,
}: ProductPageProps) {
  return (
    <>
      {beforeHero}

      {/* Header */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        {heroBackdrop ? (
          <>
            <Image
              src={heroBackdrop}
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              className="pointer-events-none select-none object-cover object-center opacity-90"
            />
            {/* light scrim: enough to keep copy readable, faint enough to see the art */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--nav-bg)]/70 via-[var(--nav-bg)]/30 to-transparent"
            />
          </>
        ) : null}
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              {eyebrow ? (
                <p className="font-geist text-sm font-semibold uppercase tracking-wide text-brand-blue">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="mt-3 max-w-4xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
                {intro}
              </p>
            </div>
            {heroDoodles ? <HeroIllustration src={heroPlant} /> : null}
          </div>
        </div>
        <ScrollCue />
      </section>
      {/* Products */}
      {productBands && productBands.length > 0 ? (
      <section className="relative w-full overflow-hidden border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        {productDoodles ? <ProductDoodles /> : null}
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          {productsEyebrow ? (
            <p className="text-center font-geist text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">
              {productsEyebrow}
            </p>
          ) : null}
          <h2
            className={cn(
              "mx-auto max-w-2xl text-center font-heading text-3xl font-semibold text-foreground sm:text-4xl",
              productsEyebrow && "mt-3",
            )}
          >
            {productsHeading}
          </h2>
          {productsSubheading ? (
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-text-secondary">
              {productsSubheading}
            </p>
          ) : null}

          {productBands.map((band, bandIndex) => {
            // A band can pull one product out of its grid and present it as a
            // full-width feature card below (Credit Cards on /loans).
            const featured = band.featureProductId
              ? band.products.find((p) => p.id === band.featureProductId)
              : undefined;
            const gridProducts = featured
              ? band.products.filter((p) => p.id !== featured.id)
              : band.products;
            return (
            <div
              key={band.id}
              id={band.id}
              className={cn("scroll-mt-16", bandIndex > 0 ? "mt-20" : "mt-14")}
            >
              <div className="flex items-end justify-between gap-6">
                <div>
                  <h3 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                    {band.heading}
                  </h3>
                  <span
                    aria-hidden
                    className="mt-3 block h-1 w-12 rounded-full bg-brand-blue"
                  />
                  {band.description ? (
                    <p className="mt-3 max-w-xl text-base text-text-secondary sm:text-lg">
                      {band.description}
                    </p>
                  ) : null}
                </div>
                <span className="hidden shrink-0 rounded-full border border-[var(--nav-border)] bg-white px-3.5 py-1.5 font-geist text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue sm:block">
                  {band.products.length} products
                </span>
              </div>
              <div
                className={cn(
                  "mt-8 grid gap-6 sm:grid-cols-2",
                  productColumns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
                )}
              >
                {gridProducts.map((product) => (
                  <Card
                    key={product.id}
                    id={product.id}
                    className={cn(
                      "group relative flex h-full scroll-mt-16 flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                      product.illustration && "pt-0",
                    )}
                  >
                    {product.legacyAnchorId ? (
                      // Absolutely positioned so the empty anchor does not
                      // become a flex child of the Card's gap-6 column, which
                      // would push this card's illustration down 24px relative
                      // to its siblings.
                      <span
                        id={product.legacyAnchorId}
                        aria-hidden
                        className="absolute top-0 scroll-mt-16"
                      />
                    ) : null}
                    {product.illustration ? (
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-[var(--nav-tint)]/70 via-[var(--nav-tint)]/30 to-transparent">
                        <Image
                          src={product.illustration}
                          alt=""
                          aria-hidden
                          fill
                          sizes="(min-width:1024px) 280px, (min-width:640px) 50vw, 100vw"
                          className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                      </div>
                    ) : null}
                    <CardHeader className="flex-1">
                      {product.illustration ? null : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-brand-blue">
                          <product.icon className="h-6 w-6" aria-hidden />
                        </span>
                      )}
                      <CardTitle
                        className={cn(
                          "font-heading text-lg text-foreground",
                          !product.illustration && "mt-4",
                        )}
                      >
                        {product.label}
                      </CardTitle>
                      <CardDescription className="text-base text-text-secondary">
                        {product.description}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <LeadDialog
                        businessLine={businessLine}
                        product={product.label}
                        triggerLabel="Enquire now"
                        triggerVariant="outline"
                        href={contactHref({
                          line: businessLine,
                          product: product.label,
                        })}
                      />
                    </CardFooter>
                  </Card>
                ))}

                {band.cta ? (
                  <div className="hidden h-full flex-col rounded-xl bg-[var(--nav-primary)] p-6 text-white shadow-sm sm:flex">
                    <div>
                      <h3 className="font-heading text-lg font-semibold">
                        {band.cta.title}
                      </h3>
                      <p className="mt-2 text-sm text-white/85">
                        {band.cta.text}
                      </p>
                    </div>
                    {/* faceless advisor + headset, white monoline on the blue card
                        (illustration-style.md: figures faceless, never blob). Decorative
                        and desktop-only per the illustrations lg+ rule. flex-1 wrapper
                        centers it in the card's middle so no gap sits above the button. */}
                    <div className="flex flex-1 items-center justify-center">
                    <svg
                      aria-hidden
                      viewBox="0 0 240 180"
                      className="hidden h-40 w-auto lg:block"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {/* depth dots */}
                      <circle cx="40" cy="44" r="4" fill="#FFFFFF" stroke="none" opacity="0.3" />
                      <circle cx="34" cy="132" r="3" fill="#FFFFFF" stroke="none" opacity="0.3" />
                      <circle cx="208" cy="128" r="5" fill="#FFFFFF" stroke="none" opacity="0.25" />
                      {/* bust */}
                      <rect x="108" y="98" width="20" height="28" fill="#FFFFFF" fillOpacity="0.12" stroke="none" />
                      <path d="M70 180 C70 138 96 124 118 124 C140 124 168 138 168 180" fill="#FFFFFF" fillOpacity="0.12" />
                      {/* head */}
                      <circle cx="118" cy="74" r="30" fill="#FFFFFF" fillOpacity="0.12" />
                      {/* headset band + ear cups */}
                      <path d="M86 72 Q118 24 150 72" strokeWidth={5} />
                      <rect x="80" y="64" width="13" height="24" rx="6" fill="#FFFFFF" fillOpacity="0.22" />
                      <rect x="143" y="64" width="13" height="24" rx="6" fill="#FFFFFF" fillOpacity="0.22" />
                      {/* mic boom */}
                      <path d="M87 86 Q90 106 108 103" />
                      <circle cx="110" cy="103" r="4" fill="#FFFFFF" stroke="none" />
                      {/* chat bubble with rupee */}
                      <rect x="166" y="34" width="54" height="40" rx="11" fill="#FFFFFF" fillOpacity="0.15" />
                      <path d="M178 72 L172 86 L188 78 Z" fill="#FFFFFF" fillOpacity="0.15" stroke="none" />
                      <text x="193" y="61" fontSize="22" fontWeight={700} fill="#FFFFFF" stroke="none" textAnchor="middle" fontFamily="system-ui, sans-serif">&#8377;</text>
                    </svg>
                    </div>
                    <div className="pt-2">
                      <LeadDialog
                        businessLine={businessLine}
                        triggerLabel={band.cta.label}
                        triggerVariant="invert"
                        href={contactHref({ line: businessLine })}
                      />
                    </div>
                  </div>
                ) : null}

              </div>

              {featured ? (
                // Full-width feature card under the band grid: illustration
                // panel on the right at sm+, copy and the same LeadDialog
                // enquiry path on the left. Keeps the product's scroll anchor
                // so mega-menu/footer #links still land here.
                <Card
                  id={featured.id}
                  className="group relative mt-6 scroll-mt-16 gap-0 overflow-hidden py-0 transition duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  {featured.legacyAnchorId ? (
                    <span
                      id={featured.legacyAnchorId}
                      aria-hidden
                      className="absolute top-0 scroll-mt-16"
                    />
                  ) : null}
                  {/* Below sm this reads exactly like the other product cards
                      (illustration band on top, copy below, full-width action);
                      the horizontal spotlight treatment starts at sm. */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-[1.15fr_1fr]">
                    {featured.illustration ? (
                      <div className="relative order-first aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-[var(--nav-tint)]/70 via-[var(--nav-tint)]/30 to-transparent sm:order-last sm:aspect-auto sm:min-h-[220px] sm:bg-gradient-to-br">
                        <Image
                          src={featured.illustration}
                          alt=""
                          aria-hidden
                          fill
                          sizes="(min-width:1024px) 560px, (min-width:640px) 50vw, 100vw"
                          className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:p-6"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-col items-start gap-2 p-6 sm:justify-center sm:gap-4 sm:p-8 lg:p-10">
                      <span className="hidden rounded-full bg-[var(--nav-tint)] px-3 py-1 font-geist text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue sm:inline-block">
                        In the spotlight
                      </span>
                      <h4 className="font-heading text-lg font-semibold text-foreground sm:text-3xl">
                        {featured.label}
                      </h4>
                      <p className="max-w-md text-base text-text-secondary">
                        {featured.description}
                      </p>
                      <div className="mt-2 w-full self-stretch sm:mt-0 sm:w-auto">
                        <LeadDialog
                          businessLine={businessLine}
                          product={featured.label}
                          triggerLabel="Enquire now"
                          triggerVariant="outline"
                          href={contactHref({
                            line: businessLine,
                            product: featured.label,
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}
            </div>
            );
          })}

          {productsTrust ? (
            <TrustStrip
              eyebrow={productsTrust.eyebrow}
              points={productsTrust.points}
            />
          ) : null}
        </div>
      </section>
      ) : null}

      {/* Custom sections (e.g. the Properties catalog) between products and journey. */}
      {beforeJourney}

      {/* Journey */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="mx-auto max-w-2xl text-center font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl">
            {journeyHeading}
          </h2>
          {journeyTimeline ? (
            <>
              {/* Below lg: text-only stacked steps. Illustrations + footprint trail
                  are lg+ only (locked rule: illustrations/decoration render lg+,
                  never phone/tablet; memory: illustrations-desktop-only). */}
              <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:hidden">
                {journey.map((step, index) => (
                  <li key={step.title} className="flex flex-col">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-lg font-semibold text-white">
                      {index + 1}
                    </span>
                    <h3 className="mt-5 font-heading text-xl font-semibold text-[var(--nav-text)]">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-lg text-[var(--nav-text)]">
                      {step.description}
                    </p>
                  </li>
                ))}
              </ol>

              {/* lg+: alternating illustrated bands (line-split.tsx pattern). One
                  continuous curvy footprint trail (JourneyTrail) is overlaid behind
                  the bands and walks the snake route ill1 -> content1 -> content2 ->
                  ill2 -> content3 -> ill3 -> content4 -> ill4. Illustrations (alt="")
                  + trail (aria-hidden) are decorative; number/title/description carry
                  the accessible content (sits above via z-10). */}
              <ol className="relative mt-12 hidden lg:block">
                <JourneyFootTrail />
                {journey.map((step, index) => {
                  const imageOnRight = index % 2 === 1;
                  return (
                    <li
                      key={step.title}
                      className="relative z-10 py-8 first:pt-0 last:pb-0"
                    >
                      <div className="grid grid-cols-2 items-center gap-x-8">
                        {/* Both columns are the same centered block, so the left
                            edge of step 2/4 content lines up with the step 1/3
                            illustration (same box in the same grid column) and the
                            center gap stays tight. */}
                        <div
                          className={cn(
                            "mx-auto w-full max-w-[460px]",
                            imageOnRight ? "order-2" : "order-1",
                          )}
                        >
                          {step.image ? (
                            <Image
                              src={step.image}
                              alt=""
                              width={480}
                              height={360}
                              sizes="460px"
                              className="h-auto w-full"
                            />
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            "w-full max-w-[460px]",
                            // Steps 2/4: pull the content toward the center gutter
                            // (ml-auto). Illustrations stay centered in their column.
                            imageOnRight
                              ? "order-1 ml-auto xl:-mr-16"
                              : "order-2 mx-auto",
                          )}
                        >
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-xl font-semibold text-white">
                            {index + 1}
                          </span>
                          <h3 className="mt-5 font-heading text-2xl font-semibold text-[var(--nav-text)]">
                            {step.title}
                          </h3>
                          <p className="mt-3 text-lg text-[var(--nav-text)]">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {journey.map((step, index) => (
                <li key={step.title} className="flex flex-col">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-lg font-semibold text-white">
                    {index + 1}
                  </span>
                  <h3 className="mt-5 font-heading text-xl font-semibold text-[var(--nav-text)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-lg text-[var(--nav-text)]">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* FAQ */}
      {faq ? (
        <FaqSection
          heading={faq.heading}
          subheading={faq.subheading}
          items={faq.items}
        />
      ) : null}

      {/* Closing CTA */}
      {ctaBanner ? (
        // Bold full-bleed navy band: page-closer for the Loans surface. Reuses
        // the locked --nav-primary navy (same as the advisor card + banner) so
        // no new color enters the blue-accent palette. Faint finance glyphs bleed
        // in from the edges on lg+ (CtaBandDoodles); center stays clear.
        <section className="relative w-full overflow-hidden bg-[var(--nav-primary)]">
          <CtaBandDoodles />
          <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
            <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
              {ctaHeading}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
              {ctaText}
            </p>
            <div className="mt-8 flex justify-center">
              <LeadDialog
                businessLine={businessLine}
                triggerLabel={ctaLabel}
                triggerVariant="invert"
                href={contactHref({ line: businessLine })}
              />
            </div>
          </div>
        </section>
      ) : (
        <section className="w-full bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
            <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              {ctaHeading}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
              {ctaText}
            </p>
            <div className="mt-8 flex justify-center">
              <LeadDialog businessLine={businessLine} triggerLabel={ctaLabel} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// Decorative hero illustration, in-flow beside the hero copy (matches the
// calculators hub hero: CalculatorHeroArt). Square viewBox art in a fixed-width
// box, so it drives the hero row's height instead of floating as a background
// overlay. Loans passes the credit scene (default); Properties passes the
// house-search scene. Desktop-only (lg+), aria-hidden.
function HeroIllustration({
  src = "/illustrations/heroes/loans.svg",
}: {
  src?: string;
}) {
  return (
    <div
      aria-hidden
      className="hidden shrink-0 items-center justify-center lg:flex lg:w-[460px]"
    >
      <Image
        src={src}
        alt=""
        aria-hidden
        width={500}
        height={500}
        sizes="460px"
        className="h-auto w-full max-w-[460px]"
        priority
      />
    </div>
  );
}

// Faint finance line-doodles for the Loans products section. Margins only:
// clusters sit beside the heading (top-right), in the empty 4th grid cell
// (bottom-right), and on the left gutter, so the center stays clear behind the
// cards. Navy line ink at low opacity, same finance family as the card icons.
// Decorative + desktop-only (docs: illustrations render lg+; blue-accent palette).
function ProductDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden text-[#293681] opacity-[0.08] lg:block"
    >
      {/* top-right: beside the short heading */}
      <svg
        className="absolute right-6 top-10 h-24 w-[440px]"
        viewBox="0 0 440 96"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* coin */}
        <g transform="translate(8,26)">
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
        {/* credit card */}
        <g transform="translate(120,24)">
          <rect x="0" y="4" width="44" height="30" rx="4" />
          <line x1="0" y1="13" x2="44" y2="13" />
          <line x1="6" y1="26" x2="20" y2="26" />
        </g>
        {/* percent */}
        <g transform="translate(250,28)">
          <circle cx="8" cy="8" r="6" />
          <circle cx="30" cy="30" r="6" />
          <line x1="34" y1="4" x2="4" y2="34" />
        </g>
        {/* trend arrow */}
        <g transform="translate(360,24)">
          <polyline points="2 38 16 24 26 30 44 8" />
          <polyline points="34 8 44 8 44 18" />
        </g>
      </svg>

      {/* bottom-right: the empty 4th cell in the 4-column grid */}
      <svg
        className="absolute bottom-24 right-10 h-56 w-72"
        viewBox="0 0 280 220"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* house */}
        <g transform="translate(24,16)">
          <path d="M2 20 L22 3 L42 20" />
          <rect x="8" y="20" width="28" height="20" />
          <rect x="18" y="28" width="8" height="12" />
        </g>
        {/* bar chart */}
        <g transform="translate(160,26)">
          <rect x="0" y="24" width="9" height="16" />
          <rect x="15" y="14" width="9" height="26" />
          <rect x="30" y="4" width="9" height="36" />
        </g>
        {/* shield + check */}
        <g transform="translate(50,116)">
          <path d="M21 2 L40 9 V22 C40 33 31 40 21 43 C11 40 2 33 2 22 V9 Z" />
          <polyline points="12 21 19 28 30 15" />
        </g>
        {/* coin */}
        <g transform="translate(180,132)">
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

      {/* left gutter */}
      <svg
        className="absolute left-2 top-1/3 h-48 w-16"
        viewBox="0 0 60 200"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* document */}
        <g transform="translate(12,16)">
          <rect x="0" y="0" width="30" height="40" rx="3" />
          <line x1="7" y1="11" x2="23" y2="11" />
          <line x1="7" y1="20" x2="23" y2="20" />
          <line x1="7" y1="29" x2="17" y2="29" />
        </g>
        {/* percent */}
        <g transform="translate(14,120)">
          <circle cx="8" cy="8" r="6" />
          <circle cx="30" cy="30" r="6" />
          <line x1="34" y1="4" x2="4" y2="34" />
        </g>
      </svg>
    </div>
  );
}

// Faint real-estate line-doodles for the Properties catalog area (buy row).
// Same family and treatment as ProductDoodles (navy line ink, low opacity,
// lg+ only) but with housing-themed glyphs instead of finance ones. One
// cluster beside the "Properties to buy" heading. Exported (unlike the other
// doodle helpers here) because it's consumed from
// app/(public)/real-estate/page.tsx, not from ProductPage's own render tree.
export function PropertyDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden text-[#293681] opacity-[0.08] lg:block"
    >
      {/* top: beside the "Properties to buy" heading */}
      <svg
        className="absolute right-6 top-16 h-24 w-[280px]"
        viewBox="0 0 280 96"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* land plot: fenced rectangle with corner posts + a small flag */}
        <g transform="translate(10,20)">
          <rect x="0" y="14" width="54" height="36" />
          <path d="M0 14 L0 2 M54 14 L54 2 M0 50 L0 62 M54 50 L54 62" />
          <path d="M0 2 L16 -4 L0 -10 Z" fill="currentColor" stroke="none" />
        </g>
        {/* key */}
        <g transform="translate(150,30)">
          <circle cx="12" cy="12" r="10" />
          <line x1="20" y1="18" x2="46" y2="44" />
          <line x1="36" y1="34" x2="30" y2="40" />
          <line x1="42" y1="40" x2="36" y2="46" />
        </g>
      </svg>
    </div>
  );
}

// Faint finance line-doodles for the closing CTA band. White monoline ink on the
// navy band at low opacity, same finance vocabulary as ProductDoodles (rupee coin,
// percent, trend arrow). Two clusters bleed in from the left and right edges so the
// centered copy stays clear. Decorative + desktop-only (docs: illustrations render
// lg+ only; blue-accent palette; illustrations-desktop-only memory).
function CtaBandDoodles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden text-white opacity-10 lg:block"
    >
      {/* left edge cluster */}
      <svg
        className="absolute -left-6 top-1/2 h-40 w-52 -translate-y-1/2"
        viewBox="0 0 200 160"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* coin */}
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
        {/* trend arrow */}
        <g transform="translate(96,44)">
          <polyline points="2 38 16 24 26 30 44 8" />
          <polyline points="34 8 44 8 44 18" />
        </g>
        {/* percent */}
        <g transform="translate(40,104)">
          <circle cx="8" cy="8" r="6" />
          <circle cx="30" cy="30" r="6" />
          <line x1="34" y1="4" x2="4" y2="34" />
        </g>
      </svg>

      {/* right edge cluster */}
      <svg
        className="absolute -right-6 top-1/2 h-40 w-52 -translate-y-1/2"
        viewBox="0 0 200 160"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* percent */}
        <g transform="translate(24,20)">
          <circle cx="8" cy="8" r="6" />
          <circle cx="30" cy="30" r="6" />
          <line x1="34" y1="4" x2="4" y2="34" />
        </g>
        {/* trend arrow */}
        <g transform="translate(104,24)">
          <polyline points="2 38 16 24 26 30 44 8" />
          <polyline points="34 8 44 8 44 18" />
        </g>
        {/* coin */}
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
