import type { Metadata } from "next";

import { AgentApplicationForm } from "@/components/apply-as-agent/agent-application-form";
import { ApplicationDoodles } from "@/components/apply-as-agent/application-doodles";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { LeadBusinessLine } from "@/lib/leads";

export const metadata: Metadata = {
  title: "Apply to Become an Agent: Loans or Real Estate",
  description:
    "Apply to become a loan or real estate agent and earn commission on the deals you bring. Free to apply, single-line accounts, KYC verified after you apply.",
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
    title: "Apply to Become an Agent: Loans or Real Estate",
    description:
      "Apply to become a loan or real estate agent and earn commission on the deals you bring. Free to apply.",
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
          name: "Apply to become an agent",
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

      {/* Hero. Centered composition: the form below is also centered, so the
          whole page reads as one column. No side illustration here by design. */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        <div className="relative mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
          <h1 className="mx-auto max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
            Earn on every deal you bring
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
            Join as a loans or real estate agent and get paid commission when
            your referrals close. Applying is free and takes about ten minutes.
            Our team verifies your KYC and calls you to get you started.
          </p>
        </div>
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
