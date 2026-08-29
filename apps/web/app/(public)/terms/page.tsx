import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms for using ${SITE_NAME}'s website and services.`,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Use",
    description: `The terms for using ${SITE_NAME}'s website and services.`,
    type: "website",
    url: "/terms",
  },
};

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="mt-10 font-heading text-xl font-semibold text-[var(--nav-text)]">
      {children}
    </h2>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 list-inside list-disc space-y-2 marker:text-[var(--nav-primary)]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
          Terms of Use
        </h1>
        <p className="mt-6 text-lg text-[var(--nav-text)]">
          These are the terms for using {SITE_NAME}&apos;s website and services. By using this
          website, you agree to them.
        </p>

        <div className="mt-2 text-base text-text-secondary">
          <SectionHeading>What we are</SectionHeading>
          <p className="mt-4">
            {SITE_NAME} is a platform that connects people looking for loans or real estate with
            banks, lenders, and real estate partners. We are not a bank, a lender, or a real
            estate broker, and we do not hold or transfer loan principal or property purchase
            money on anyone&apos;s behalf.
          </p>

          <SectionHeading>No guarantee</SectionHeading>
          <p className="mt-4">
            We do not guarantee that any loan application will be approved, that any property
            will remain available, or that any bank or partner will respond within a particular
            time. Final decisions rest entirely with the relevant bank, lender, or partner.
          </p>

          <SectionHeading>Calculators are estimates only</SectionHeading>
          <p className="mt-4">
            Figures shown by our EMI, eligibility, or other calculators are estimates to help you
            plan. They are not a loan offer, and your bank&apos;s actual terms, interest rate, or
            eligibility may differ.
          </p>

          <SectionHeading>Your account</SectionHeading>
          <BulletList
            items={[
              "You must provide accurate information and verify your mobile number to create an account.",
              "One mobile number may be used for one account.",
              "You are responsible for keeping your account credentials confidential and for all activity under your account.",
              "You may delete your account at any time from your account settings. This is permanent.",
            ]}
          />

          <SectionHeading>Acceptable use</SectionHeading>
          <p className="mt-4">You agree not to:</p>
          <BulletList
            items={[
              "Provide false information or impersonate someone else.",
              "Use the website to submit fraudulent enquiries or applications.",
              "Attempt to access another user's account or data.",
              "Scrape, copy, or misuse content from this website.",
              "Abuse the referral or cashback program, including by creating fake referrals.",
            ]}
          />

          <SectionHeading>Referral, cashback &amp; commission programs</SectionHeading>
          <p className="mt-4">
            Any referral, cashback, or commission we offer is governed by the terms of that
            specific program at the time, which may change. We may withhold or reverse a payout
            if we reasonably believe it was earned through fraud or abuse of these terms.
          </p>

          <SectionHeading>Partner applications</SectionHeading>
          <p className="mt-4">
            If you apply to become a partner agent, we may ask for identity and verification
            documents. Approval is at our discretion, and we may reject or remove a partner
            application or account for any legitimate business reason, including a failed
            verification.
          </p>

          <SectionHeading>Payments</SectionHeading>
          <p className="mt-4">
            We use a payment gateway only to pay out cashback, referral bonuses, and commissions
            that you are eligible for. We never use it, or any other method, to collect loan
            principal or property purchase money. Any such transaction happens directly and
            entirely between you and the relevant bank, lender, or seller.
          </p>

          <SectionHeading>Third-party banks, lenders &amp; partners</SectionHeading>
          <p className="mt-4">
            When we connect you with a bank, lender, or real estate partner, your dealings with
            them are governed by their own terms, not ours. We are not responsible for their
            decisions, conduct, or the outcome of your enquiry with them.
          </p>

          <SectionHeading>Intellectual property</SectionHeading>
          <p className="mt-4">
            All content on this website, including text, design, and calculators, belongs to us
            or our licensors. You may not copy or reuse it without permission.
          </p>

          <SectionHeading>Limitation of liability</SectionHeading>
          <p className="mt-4">
            We provide this website &quot;as is.&quot; To the extent permitted by law, we are not
            liable for any loss arising from your use of this website, your enquiry with a
            partner, or any decision made by a third-party bank or lender.
          </p>

          <SectionHeading>Termination</SectionHeading>
          <p className="mt-4">
            We may suspend or remove access to your account if you breach these terms. You may
            leave at any time by deleting your account.
          </p>

          <SectionHeading>Governing law</SectionHeading>
          <p className="mt-4">These terms are governed by the laws of India.</p>

          <SectionHeading>Changes to these terms</SectionHeading>
          <p className="mt-4">
            We may update these terms from time to time. Continuing to use the website after a
            change means you accept the updated terms.
          </p>
          <p className="mt-8 text-sm text-text-secondary/80">Last updated: 29 August 2026</p>
        </div>

        <Link
          href="/contact"
          className="mt-10 inline-flex h-10 items-center justify-center rounded-md bg-[var(--nav-primary)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-bg)]"
        >
          Contact us with questions
        </Link>
      </div>
    </section>
  );
}
