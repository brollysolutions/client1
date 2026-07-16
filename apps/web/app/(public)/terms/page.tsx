import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms for using ${SITE_NAME}'s website and services.`,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service",
    description: `The terms for using ${SITE_NAME}'s website and services.`,
    type: "website",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-6 text-lg text-[var(--nav-text)]">
          We are finalizing our full terms of service. Until then, here is a
          short and honest summary of how this website works.
        </p>
        <div className="mt-8 space-y-5 text-base text-text-secondary">
          <p>
            We connect you with banks, lenders, and real estate partners. We
            are not a bank, and we do not guarantee that any loan will be
            approved or that any property will be available.
          </p>
          <p>
            The numbers shown on our calculators are estimates to help you
            plan. They are not a loan offer, and your bank&apos;s final
            terms may differ.
          </p>
          <p>
            By using this website and sharing your details with us, you
            agree that we may contact you about your enquiry. We are still
            writing the detailed version of these terms. If you have
            questions in the meantime, please reach out.
          </p>
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
