import type { Metadata } from "next";
import Image from "next/image";

import { AgentApplicationForm } from "@/components/apply-as-agent/agent-application-form";
import { ApplicationDoodles } from "@/components/apply-as-agent/application-doodles";
import { ScrollCue } from "@/components/scroll-cue";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { LeadBusinessLine } from "@/lib/leads";

export const metadata: Metadata = {
  title: "Apply to Become a Partner: Loans or Real Estate",
  description:
    "Apply to become a loan or real estate partner and earn commission on the deals you bring. Free to apply, single-line accounts, KYC verified after you apply.",
  keywords: [
    "become an agent",
    "loan agent",
    "real estate agent",
    "DSA agent",
    "referral agent",
    "agent application",
  ],
  alternates: { canonical: "/apply-as-agent" },
  openGraph: {
    title: "Apply to Become a Partner: Loans or Real Estate",
    description:
      "Apply to become a loan or real estate partner and earn commission on the deals you bring. Free to apply.",
    type: "website",
    url: "/apply-as-agent",
  },
};

const applyJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Earn with Us",
          item: `${SITE_URL}/earn-with-us`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Apply to become a partner",
          item: `${SITE_URL}/apply-as-agent`,
        },
      ],
    },
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

function normalizeLine(value: string | string[] | undefined): LeadBusinessLine {
  const line = Array.isArray(value) ? value[0] : value;
  return line === "real_estate" ? "real_estate" : "loans";
}

export default async function ApplyAsAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string | string[] }>;
}) {
  const { line } = await searchParams;
  const defaultLine = normalizeLine(line);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(applyJsonLd) }}
      />

      {/* Hero */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <h1 className="max-w-2xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
                <span className="block">Apply to become</span>
                <span className="block">a partner</span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
                Earn commission on the deals you bring. Applying is free, every
                partner account works one line, and we verify your KYC after you
                apply.
              </p>
            </div>
            {/* Takes the same scoped exception to the "illustrations render
                lg+, never phone/tablet" rule that EarnHero documents (see
                components/earn-with-us/hero.tsx): the hero art shows at every
                breakpoint so phone and tablet get a visual anchor. Below md the
                grid collapses and this box falls under the copy — heading,
                paragraph, art — with no DOM reorder. Capped per breakpoint so
                it complements the copy instead of eating the viewport; the 1:1
                width/height matches the asset's 500x500 viewBox so Next
                reserves the box and nothing shifts. The rule still holds for
                the rest of the page (ScrollCue, ApplicationDoodles). */}
            <div
              aria-hidden
              className="flex w-full items-center justify-center md:w-[260px] lg:w-[460px]"
            >
              <Image
                src="/illustrations/heroes/apply-as-agent.svg"
                alt=""
                aria-hidden
                width={500}
                height={500}
                sizes="(min-width: 1024px) 460px, (min-width: 768px) 260px, (min-width: 640px) 300px, 220px"
                className="h-auto w-full max-w-[220px] sm:max-w-[300px] md:max-w-none"
                priority
              />
            </div>
          </div>
        </div>
        <ScrollCue />
      </section>

      {/* Application form. Centered like the hero above, one shared axis for
          the whole page. Doodles fill the side gutters on large screens. */}
      <section className="relative w-full overflow-hidden border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <ApplicationDoodles />

          <div className="relative mx-auto max-w-3xl">
            <div className="text-center">
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Send us your application
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-text-secondary">
                Pick a line, share your details, and upload your KYC documents.
                Our team will call you back.
              </p>
            </div>
            <div className="mt-8">
              <AgentApplicationForm defaultLine={defaultLine} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
