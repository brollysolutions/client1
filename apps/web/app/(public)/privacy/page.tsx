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

export default function PrivacyPage() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-6 text-lg text-[var(--nav-text)]">
          This policy explains what information we collect when you use {SITE_NAME}, how we use
          it, and the choices you have.
        </p>

        <div className="mt-2 text-base text-text-secondary">
          <SectionHeading>Information we collect</SectionHeading>
          <BulletList
            items={[
              "Contact details you give us: your name, mobile number, and email address, whether through a callback request, the contact form, or a partner application.",
              "Verification details: your mobile number is verified with a one-time code before we create an account. Your email is verified after your first sign-in.",
              "Enquiry details: the loan type, property interest, or other details you share so we can connect you with the right bank, lender, or real estate partner.",
              "Partner application documents: if you apply to become a partner agent, we collect identity documents (such as Aadhaar and PAN) to verify you before approval.",
              "Account activity: your enquiry history, application status, and any referral, cashback, or commission activity on your account.",
              "Technical information: basic device and browser information, and a small number of essential cookies needed to keep you signed in securely. We do not use advertising or tracking cookies.",
            ]}
          />

          <SectionHeading>How we use your information</SectionHeading>
          <BulletList
            items={[
              "To respond to your enquiry and connect you with a relevant bank, lender, or real estate partner.",
              "To create and secure your account, and verify your identity.",
              "To process cashback, referral, or commission payouts you are eligible for.",
              "To send you updates about your enquiry, application, or account, by voice call or email.",
              "To improve this website and our services.",
            ]}
          />

          <SectionHeading>How we share your information</SectionHeading>
          <p className="mt-4">
            We do not sell your personal information to anyone. We share it only where it is
            needed:
          </p>
          <BulletList
            items={[
              "With the bank, lender, or real estate partner relevant to your specific enquiry, so they can follow up with you.",
              "With our payment processor, solely to pay out cashback, referral bonuses, or commissions you have earned. We never use a payment processor, or any other method, to collect loan principal or property purchase money. This platform never handles that money.",
              "Where required by law, or to protect the rights, safety, or property of our users or ourselves.",
            ]}
          />

          <SectionHeading>How long we keep your information</SectionHeading>
          <p className="mt-4">
            We keep your account and enquiry information for as long as your account is active.
            If you delete your account, we permanently erase your personal information (name,
            mobile number, email, and any identity documents) immediately. Financial transaction
            and payout records are kept for 7 years, disconnected from your identity, as required
            for financial record-keeping, and are permanently purged after that period.
          </p>

          <SectionHeading>Your rights and choices</SectionHeading>
          <BulletList
            items={[
              "You can view and update your profile details at any time from your dashboard.",
              "You can delete your account yourself, at any time, from your account settings. This is permanent and cannot be undone.",
              "You can contact us to ask what information we hold about you, or to raise any question or concern about how we handle your data.",
            ]}
          />

          <SectionHeading>How we protect your information</SectionHeading>
          <BulletList
            items={[
              "We verify your identity with a one-time code sent to your mobile number, and never store that code in plain text.",
              "Your password, if you set one, is stored using industry-standard hashing, never in plain text.",
              "Access to your information within our team is limited to what each person needs to do their job.",
            ]}
          />

          <SectionHeading>Children&apos;s privacy</SectionHeading>
          <p className="mt-4">
            Our services are meant for adults. We do not knowingly collect information from
            children.
          </p>

          <SectionHeading>Changes to this policy</SectionHeading>
          <p className="mt-4">
            We may update this policy from time to time. If we make a significant change, we will
            update the date below.
          </p>
          <p className="mt-8 text-sm text-text-secondary/80">Last updated: 28 July 2026</p>
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
