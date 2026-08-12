import type { Metadata } from "next";

import { CalculatorCard } from "@/components/calculators/calculator-card";
import { CalculatorFaq } from "@/components/calculators/calculator-faq";
import { CalculatorHeroArt } from "@/components/calculators/calculator-hero-art";
import { FaqDoodles } from "@/components/faq-doodles";
import { LeadDialog } from "@/components/lead-dialog";
import { ScrollCue } from "@/components/scroll-cue";
import { CALCULATORS, HUB_FAQ } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Financial Calculators: EMI, Eligibility, Stamp Duty & More",
  description:
    "Free financial calculators for loans, real estate, credit cards, and insurance in India. Work out your EMI, eligibility, stamp duty, card payoff, term cover, and more in seconds.",
  keywords: [
    "financial calculators",
    "emi calculator",
    "loan calculator",
    "home affordability calculator",
    "stamp duty calculator",
    "credit card payoff calculator",
    "term insurance calculator",
  ],
  alternates: { canonical: "/calculators" },
  openGraph: {
    title: "Financial Calculators for Loans & Real Estate",
    description:
      "Work out your EMI, eligibility, affordability, stamp duty, card payoff, insurance cover and more with our free calculators.",
    type: "website",
    url: "/calculators",
  },
};

const hubJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      name: "Financial Calculators",
      url: `${SITE_URL}/calculators`,
      hasPart: CALCULATORS.map((c) => ({
        "@type": "WebApplication",
        name: c.h1,
        url: `${SITE_URL}/calculators/${c.slug}`,
        applicationCategory: "FinanceApplication",
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: HUB_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function CalculatorsHubPage() {
  const loans = CALCULATORS.filter((c) => c.group === "loans");
  const realEstate = CALCULATORS.filter((c) => c.group === "real_estate");
  const creditCards = CALCULATORS.filter((c) => c.group === "credit_cards");
  const insurance = CALCULATORS.filter((c) => c.group === "insurance");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJsonLd) }}
      />

      {/* Hero */}
      <section className="relative w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            {/* Named container: the heading, intro, and jump-link row below all
                size themselves off this copy column, not the viewport. From md
                the hero art takes 260px (460px at lg) out of the row, so a
                tablet leaves this column narrower than a large phone does --
                viewport breakpoints alone would grow the type at exactly the
                widths where the column shrinks (413px at 768, 453px at 1024).
                The heading tiers sit at 340/440/700 so 1024 still outranks the
                36px section h2s below it; the column tops out at 724px, so
                text-6xl only lands from 1280 up. The intro keeps its own 560
                tier -- that one is about line measure, not hierarchy, and 20px
                in a 453px column reads too short. */}
            <div className="@container/hero-copy">
              <h1 className="font-heading text-3xl font-semibold text-balance text-[var(--nav-text)] @min-[340px]/hero-copy:text-4xl @min-[440px]/hero-copy:text-5xl @min-[700px]/hero-copy:text-6xl">
                Financial calculators for loans and property
              </h1>
              <p className="mt-4 max-w-2xl text-base text-pretty text-[var(--nav-text)] @min-[340px]/hero-copy:text-lg @min-[560px]/hero-copy:text-xl">
                Plan your money with clear, honest numbers. Work out your EMI, loan eligibility,
                stamp duty, credit card payoff, and the insurance cover your family needs. Free for
                everyone, built for India.
              </p>
              {/* Uniform category jump-links, always one row. Three tiers off
                  the copy column: under 400px a 4-column grid of compact
                  equal-width cells (phones); from 400px the natural pill row at
                  tighter padding, which is what keeps a 768px tablet's 413px
                  column on one line; from 470px the full-size pills. No single
                  link is accented over the others. */}
              <div className="mt-8 grid grid-cols-4 gap-1.5 @min-[340px]/hero-copy:gap-2 @min-[400px]/hero-copy:flex @min-[400px]/hero-copy:flex-wrap @min-[470px]/hero-copy:gap-3">
                <JumpLink href="#loans" label="Loans" />
                <JumpLink href="#real-estate" label="Property" />
                <JumpLink href="#credit-cards" label="Credit cards" shortLabel="Cards" />
                <JumpLink href="#insurance" label="Insurance" />
              </div>
            </div>
            <CalculatorHeroArt group="loans" src="/illustrations/calculators/hub.svg" />
          </div>
        </div>
        <ScrollCue />
      </section>

      <CalculatorGroup
        id="loans"
        title="Loan calculators"
        description="Work out your EMI, check how much you can borrow, compare offers, decode flat rate quotes, and see what prepaying or transferring saves."
        items={loans}
      />
      <CalculatorGroup
        id="real-estate"
        title="Property calculators"
        description="From affordability and stamp duty to GST, rental yield, appreciation, down payment planning, and the rent vs buy decision."
        items={realEstate}
      />
      <CalculatorGroup
        id="credit-cards"
        title="Credit card calculators"
        description="See when your card balance actually hits zero, what the minimum due trap costs, and the real price of converting a purchase to EMI."
        items={creditCards}
      />
      <CalculatorGroup
        id="insurance"
        title="Insurance calculators"
        description="Size the term life cover your family needs and the health floater that matches your city, before anyone quotes you a premium."
        items={insurance}
      />

      {/* Hub FAQ */}
      <section className="relative w-full overflow-hidden border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <FaqDoodles />
        <div className="relative mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6">
            <CalculatorFaq items={HUB_FAQ} />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="w-full bg-[var(--nav-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
            Have your numbers? Let us take it forward.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
            Leave your number and our team will call you back to help with your loan or property
            plans. No spam, no pressure.
          </p>
          <div className="mt-8 flex justify-center">
            <LeadDialog
              businessLine="loans"
              lineSelectable
              origin="calculator-hub"
              triggerLabel="Request a callback"
              submitLabel="Request callback"
              description="Leave your number and our team will call you back to help with your loan or property plans."
              triggerVariant="invert"
              href="/contact"
            />
          </div>
        </div>
      </section>
    </>
  );
}

// One hero category link, sized off the hero-copy container so the row never
// wraps. Four tiers, each measured against what the four pills actually need:
//
//   <340px  a quarter of a 320px phone leaves ~55px of text room per cell --
//           just enough for "Insurance" at 11px, so nowrap never overflows.
//   340px   the cells can afford text-xs/px-2.
//   400px   the natural pill row costs ~375px at px-3/gap-2, so it fits a
//           768px tablet's 413px column (the full-size row needs ~451px and
//           was wrapping there).
//   470px   room for the original px-5/gap-3 pills, with slack for font
//           metrics that render wider than Chrome's.
//
// py-2.5 keeps a ~38px tap target on the compressed tiers. shortLabel swaps in
// below 400px for labels that cannot fit ("Credit cards"); both spans are
// display:none-toggled, so screen readers get exactly one of them at any width.
function JumpLink({
  href,
  label,
  shortLabel,
}: {
  href: string;
  label: string;
  shortLabel?: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-[var(--nav-border)] bg-white px-1.5 py-2.5 text-[11px] font-semibold text-[var(--nav-text)] transition-colors hover:border-[var(--nav-primary)]/40 hover:text-[var(--nav-primary)] @min-[340px]/hero-copy:px-2 @min-[340px]/hero-copy:text-xs @min-[400px]/hero-copy:px-3 @min-[400px]/hero-copy:py-3 @min-[400px]/hero-copy:text-sm @min-[470px]/hero-copy:px-5"
    >
      {shortLabel ? (
        <>
          <span className="@min-[400px]/hero-copy:hidden">{shortLabel}</span>
          <span className="hidden @min-[400px]/hero-copy:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </a>
  );
}

function CalculatorGroup({
  id,
  title,
  description,
  items,
}: {
  id: string;
  title: string;
  description: string;
  items: CalculatorDef[];
}) {
  return (
    <section id={id} className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <h2 className="font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-lg text-text-secondary">{description}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <CalculatorCard key={item.slug} def={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
