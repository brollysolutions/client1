import type { Metadata } from "next";
import Link from "next/link";

import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects the information you share with us.`,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy",
    description: `How ${SITE_NAME} collects, uses, and protects the information you share with us.`,
    type: "website",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-6 text-lg text-[var(--nav-text)]">
          We are finalizing our full privacy policy. This page will soon set
          out exactly what information we collect, how we use it, and how we
          protect it, in plain language. Until then, here is a short and
          honest summary.
        </p>
        <div className="mt-8 space-y-5 text-base text-text-secondary">
          <p>
            When you share your name, mobile number, or email with us,
            whether through a callback request, the contact form, or an
            partner application, we use those details only to get back to you
            and to connect you with the right loan or real estate partner
            for your enquiry.
          </p>
          <p>
            We do not sell your information to third parties. We share it
            only where it is needed to act on your enquiry, such as with a
            bank, lender, or partner relevant to what you asked about.
          </p>
          <p>
            We are still writing the detailed version of this policy,
            covering things like data retention and your rights over your
            information. If you have questions in the meantime, please reach
            out. We are happy to explain anything about how we handle your
            data.
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
