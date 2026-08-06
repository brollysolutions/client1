import type { Metadata } from "next";
import Image from "next/image";

import { ContactForm } from "@/components/contact/contact-form";
import { ContactInfo } from "@/components/contact/contact-info";
import { ScrollCue } from "@/components/scroll-cue";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { LeadTopic } from "@/lib/leads";

export const metadata: Metadata = {
  title: "Contact Us: Talk to Our Loans and Real Estate Team",
  description:
    "Get in touch with our loans and real estate team. Leave your number and we will call you back, or reach us by phone and email.",
  keywords: [
    "contact",
    "get in touch",
    "loan enquiry",
    "property enquiry",
    "callback",
  ],
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Us: Talk to Our Loans and Real Estate Team",
    description:
      "Get in touch with our loans and real estate team. Leave your number and we will call you back.",
    type: "website",
    url: "/contact",
  },
};

const contactJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Contact",
          item: `${SITE_URL}/contact`,
        },
      ],
    },
    {
      "@type": "ContactPage",
      name: "Contact",
      url: `${SITE_URL}/contact`,
    },
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string; product?: string; invitation?: string }>;
}) {
  const { line, product, invitation } = await searchParams;
  // Only honor a valid topic from the CTA; otherwise let the form default.
  // `product` is free text (loan type / property / calculator name).
  const initialLine: LeadTopic | undefined =
    line === "loans" || line === "real_estate" || line === "agent"
      ? line
      : undefined;
  const invitationToken =
    invitation && /^[A-Za-z0-9_-]{32,128}$/.test(invitation) ? invitation : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />

      {/* Hero. Same composition as the apply-as-agent hero used to carry:
          copy on the left, a decorative calling scene filling the right
          gutter on large screens only. */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h1 className="max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl lg:text-6xl">
                Talk to a real person
              </h1>
              <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
                A loan, a property, or becoming a partner. Whatever brought you
                here, leave your number and our team will call you back. No
                bots, no hold music.
              </p>
            </div>
            <div
              aria-hidden
              className="hidden shrink-0 items-center justify-center lg:flex lg:w-[420px]"
            >
              <Image
                src="/illustrations/heroes/contact.svg"
                alt=""
                aria-hidden
                width={500}
                height={500}
                sizes="420px"
                className="h-auto w-full max-w-[420px]"
                priority
              />
            </div>
          </div>
        </div>
        <ScrollCue />
      </section>

      {/* Form + contact details. Both columns sit flat on the cream band,
          no card chrome on either side. */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Send us a message
              </h2>
              <p className="mt-2 text-text-secondary">
                Tell us what it is about, share your details, and we will be in
                touch.
              </p>
              <div className="mt-8">
                <ContactForm
                  initialLine={initialLine}
                  initialProduct={product}
                  invitationToken={invitationToken}
                />
              </div>
            </div>

            <div className="lg:pt-1">
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Reach us directly
              </h2>
              <p className="mt-2 text-text-secondary">
                Prefer to talk now? Call or email us during office hours, or
                drop by the office.
              </p>
              <div className="mt-8">
                <ContactInfo />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
