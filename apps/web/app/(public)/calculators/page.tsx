import type { Metadata } from "next";
import Link from "next/link";

import { CalculatorHeroArt } from "@/components/calculators/calculator-hero-art";
import { CALCULATORS } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Financial Calculators: EMI, Eligibility, Stamp Duty & More",
  description:
    "Free financial calculators for loans and real estate. Work out your EMI, loan eligibility, home affordability, stamp duty, rental yield, and more, in seconds.",
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
  "@type": "CollectionPage",
  name: "Financial Calculators",
  url: `${SITE_URL}/calculators`,
  hasPart: CALCULATORS.map((c) => ({
    "@type": "WebApplication",
    name: c.h1,
    url: `${SITE_URL}/calculators/${c.slug}`,
    applicationCategory: "FinanceApplication",
  })),
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
              <p className="font-geist text-sm font-semibold uppercase tracking-wide text-brand-blue">
                Free tools
              </p>
              <h1 className="mt-3 max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
                Financial calculators
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
                Plan your loan or your property purchase with clear, honest numbers. No login, no
                catch, free for everyone.
              </p>
            </div>
            <CalculatorHeroArt group="loans" />
          </div>
        </div>
      </section>

      <CalculatorGroup
        id="loans"
        eyebrow="Loans"
        title="Loan calculators"
        description="Work out your EMI, how much you can borrow, and the impact of prepaying."
        items={loans}
      />
      <CalculatorGroup
        id="real-estate"
        eyebrow="Real estate"
        title="Property calculators"
        description="From affordability and stamp duty to rental yield and appreciation."
        items={realEstate}
      />
    </>
  );
}

function CalculatorGroup({
  id,
  eyebrow,
  title,
  description,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: CalculatorDef[];
}) {
  return (
    <section id={id} className="w-full border-t border-[var(--nav-border)] bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <p className="font-geist text-sm font-semibold uppercase tracking-wide text-brand-blue">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-lg text-text-secondary">{description}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.slug}
              href={`/calculators/${item.slug}`}
              className="group flex h-full flex-col rounded-xl border border-[var(--nav-border)] bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <h3 className="font-heading text-lg font-semibold text-[var(--nav-text)] transition-colors group-hover:text-[var(--nav-primary)]">
                {item.navLabel}
              </h3>
              <p className="mt-2 flex-1 text-sm text-text-secondary">{item.cardSummary}</p>
              <span className="mt-4 text-sm font-medium text-[var(--nav-primary)]">
                Open calculator
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
