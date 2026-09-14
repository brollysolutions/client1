import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { FinancialProviderOptions, financialApplicationHref as applyHref, providerOfferQuery } from "@/components/financial-provider-options";
import { LeadDialog } from "@/components/lead-dialog";
import { ServiceArtwork } from "@/components/service-artwork";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getPublicFinancialProduct,
  getPublicProviderOffers,
  type PublicFinancialProduct,
} from "@/lib/financial-catalog";
import { contactHref } from "@/lib/leads";
import { catalogueIllustration, financialServiceHref } from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function publishedService(slug: string): Promise<PublicFinancialProduct | null> {
  const canonicalSlug = slug === "credit-cards" ? "credit-card" : slug;
  const product = await getPublicFinancialProduct(canonicalSlug);
  // Existing catalogues can publish either card slug. Keep the public URL
  // canonical while applications and offer requests retain the actual API slug.
  return product ?? (canonicalSlug === "credit-card" ? getPublicFinancialProduct("credit-cards") : null);
}

function ProductFacts({ product }: { product: PublicFinancialProduct }) {
  const sections = [
    { title: "Why consider it", icon: CheckCircle2, items: product.highlights },
    { title: "General eligibility", icon: ShieldCheck, items: product.eligibility },
    { title: "Documents to prepare", icon: FileText, items: product.documents },
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title} className="h-full">
          <CardHeader>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-link">
              <section.icon className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle className="mt-3 font-heading text-xl">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {section.items.length > 0 ? (
              <ul className="space-y-3 text-sm text-text-secondary">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-link" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">
                Details vary by provider. Enquire and our team will guide you.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const canonicalSlug = slug === "credit-cards" ? "credit-card" : slug;
  const product = await publishedService(canonicalSlug);
  if (!product) return { title: "Financial service unavailable", robots: { index: false, follow: false } };
  const label = product.label;
  const description = product.summary;
  const href = financialServiceHref(product.slug);
  const image = catalogueIllustration(canonicalSlug) ?? "/opengraph-image.png";
  return {
    title: label,
    description,
    alternates: { canonical: href },
    openGraph: { type: "website", title: label, description, url: href, siteName: SITE_NAME, images: [{ url: image, alt: `${label} | ${SITE_NAME}` }] },
    twitter: { card: "summary_large_image", title: label, description, images: [image] },
  };
}

export default async function FinancialServicePage({ params, searchParams }: PageProps) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  if (slug === "credit-cards") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, entry);
    }
    permanentRedirect(`${financialServiceHref(slug)}${query.size ? `?${query}` : ""}`);
  }
  const offerQuery = providerOfferQuery(raw);
  const product = await publishedService(slug);
  if (!product) {
    notFound();
  }

  const offers = await getPublicProviderOffers(product.slug, offerQuery);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: "Financial services",
            item: `${SITE_URL}/loans`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: product.label,
            item: `${SITE_URL}${financialServiceHref(product.slug)}`,
          },
        ],
      },
      {
        "@type": "Service",
        name: product.label,
        description: product.description,
        serviceType: "Financial product comparison and application assistance",
        url: `${SITE_URL}${financialServiceHref(product.slug)}`,
        provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        areaServed: { "@type": "Country", name: "India" },
      },
      ...(product.faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: product.faq.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="border-b border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Link
            href="/loans#financial-services-catalogue"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-link hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All financial services
          </Link>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[1fr_24rem]">
            <div>
              <h1 className="max-w-4xl font-heading text-4xl font-semibold text-foreground sm:text-5xl lg:text-6xl">
                {product.label}
              </h1>
              <p className="mt-5 max-w-3xl text-xl text-text-secondary">{product.summary}</p>
              <p className="mt-4 max-w-3xl text-base leading-7 text-text-secondary">
                {product.description}
              </p>
              <div className="mt-8 grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2">
                <Button asChild size="lg" className="w-full">
                  <Link href={applyHref(product.slug)}>
                    {product.category === "loan" ? "Apply inside Dhanadhara" : "Request a quote"}
                  </Link>
                </Button>
                <LeadDialog
                  businessLine="loans"
                  product={product.label}
                  triggerLabel="Enquire now"
                  triggerVariant="outline"
                  size="lg"
                  origin="financial-service-detail"
                  href={contactHref({ line: "loans", product: product.label })}
                />
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              {catalogueIllustration(product.slug) ? (
                <ServiceArtwork slug={product.slug} sizes="(min-width:1024px) 384px, (min-width:640px) 640px, 92vw" />
              ) : null}
              <div className="p-8">
              <p className="font-heading text-2xl font-semibold text-foreground">
                Compare here. Continue here.
              </p>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                {SITE_NAME} does not redirect you to a lender website. Your application or enquiry
                remains inside the platform.
              </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ProductFacts product={product} />
        </div>
      </section>

      <FinancialProviderOptions product={product} query={offerQuery} offers={offers} />

      {product.faq.length > 0 ? (
        <section className="border-t border-border bg-surface px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="font-heading text-3xl font-semibold text-foreground">Questions about {product.label}</h2>
            <div className="mt-6 space-y-3">
              {product.faq.map((item) => (
                <details key={item.question} className="rounded-xl border border-border bg-card p-5">
                  <summary className="cursor-pointer font-semibold text-foreground">{item.question}</summary>
                  <p className="mt-3 leading-7 text-text-secondary">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
