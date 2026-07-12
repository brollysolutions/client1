import type { Metadata } from "next";
import { Check } from "lucide-react";

import { AgentApplicationForm } from "@/components/apply-as-agent/agent-application-form";
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

// What an applicant needs. Informational only: KYC docs are verified after
// applying (Auth spec: captured on agent_applications, Admin-approved), there is
// no public upload. Mirrors the earn-with-us eligibility requirements.
const REQUIREMENTS: string[] = [
  "KYC documents: a valid ID, address proof, and a photo",
  "One mobile number, verified by OTP. That is your account",
  "Bank details for payouts. We pay by Razorpay or cheque",
  "A valid RERA agent code, for the real estate line only",
  "No broker background needed. Beginners are welcome",
];

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
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
            Apply to become an agent
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
            Earn commission on the deals you bring. Applying is free, every agent
            account works one line, and we verify your KYC after you apply.
          </p>
        </div>
      </section>

      {/* Form + what you'll need */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Send us your application
              </h2>
              <p className="mt-2 text-text-secondary">
                Pick a line, share your details, and our team will call you back.
              </p>
              <div className="mt-6">
                <AgentApplicationForm defaultLine={defaultLine} />
              </div>
            </div>

            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                What you&apos;ll need
              </h2>
              <p className="mt-2 text-text-secondary">
                Keep these handy. We verify them after you apply, there is
                nothing to upload here.
              </p>
              <ul className="mt-6 grid gap-4 rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm sm:p-8">
                {REQUIREMENTS.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--nav-tint)] text-[var(--nav-primary)]"
                    >
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="text-text-secondary">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
