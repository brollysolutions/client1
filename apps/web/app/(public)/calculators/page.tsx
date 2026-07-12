import type { Metadata } from "next";

import { CalculatorCard } from "@/components/calculators/calculator-card";
import { CalculatorFaq } from "@/components/calculators/calculator-faq";
import { CalculatorHeroArt } from "@/components/calculators/calculator-hero-art";
import { FaqDoodles } from "@/components/faq-doodles";
import { LeadDialog } from "@/components/lead-dialog";
import { CALCULATORS, HUB_FAQ } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Financial Calculators: EMI, Eligibility, Stamp Duty & More",
  description:
    "Free financial calculators for loans and real estate in India. Work out your EMI, loan eligibility, home affordability, stamp duty, rental yield, and more in seconds.",
  keywords: [
    "financial calculators",
    "emi calculator",
    "loan calculator",
    "home affordability calculator",
    "stamp duty calculator",
  ],
  alternates: { canonical: "/calculators" },
  openGraph: {
    title: "Financial Calculators for Loans & Real Estate",
    description:
      "Work out your EMI, eligibility, affordability, stamp duty, rental yield and more with our free calculators.",
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJsonLd) }}
      />

      {/* Hero */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
                Financial calculators for loans and property
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
                Plan your loan or your property purchase with clear, honest numbers. Work out your
                EMI, loan eligibility, home affordability, stamp duty, and more. Free for everyone,
                built for India.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#loans"
                  className="inline-flex items-center justify-center rounded-lg bg-[var(--nav-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--nav-primary-hover)]"
                >
                  Loan calculators
                </a>
                <a
                  href="#real-estate"
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--nav-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--nav-text)] transition-colors hover:border-[var(--nav-primary)]/40 hover:text-[var(--nav-primary)]"
                >
                  Property calculators
                </a>
              </div>
            </div>
            <CalculatorHeroArt group="loans" src="/illustrations/calculators/hub.svg" />
          </div>
        </div>
      </section>

      <CalculatorGroup
        id="loans"
        title="Loan calculators"
        description="Work out your EMI, check how much you can borrow, compare offers, and see the impact of prepaying."
        items={loans}
      />
      <CalculatorGroup
        id="real-estate"
        title="Property calculators"
        description="From affordability and stamp duty to GST, rental yield, appreciation, and down payment planning."
        items={realEstate}
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
