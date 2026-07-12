import type { Metadata } from "next";

import { ContactForm } from "@/components/contact/contact-form";
import { ContactInfo } from "@/components/contact/contact-info";
import { SITE_NAME, SITE_URL } from "@/lib/site";

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

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />

      {/* Hero */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
            Get in touch
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[var(--nav-text)] sm:text-xl">
            Have a question about a loan or a property? Leave your number and our
            team will call you back, or reach us directly by phone or email.
          </p>
        </div>
      </section>

      {/* Form + contact details */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Send us a message
              </h2>
              <p className="mt-2 text-text-secondary">
                Pick a line, share your details, and we will be in touch.
              </p>
              <div className="mt-6">
                <ContactForm />
              </div>
            </div>

            <div>
              <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
                Other ways to reach us
              </h2>
              <p className="mt-2 text-text-secondary">
                Prefer to talk now? Call or email us during office hours.
              </p>
              <div className="mt-6">
                <ContactInfo />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
