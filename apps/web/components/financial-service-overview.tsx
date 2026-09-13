import { ArrowLeft, ArrowRight, CheckCircle2, MessageSquare } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { LeadDialog } from "@/components/lead-dialog";
import { FinancialProviderOptions } from "@/components/financial-provider-options";
import { ServiceArtwork } from "@/components/service-artwork";
import { Button } from "@/components/ui/button";
import { FINANCIAL_SERVICE_GUIDES } from "@/lib/financial-service-guides";
import type { ProviderOfferQuery } from "@/lib/financial-catalog";
import { contactHref } from "@/lib/leads";
import { financialServiceHref, LOAN_PRODUCTS, type Product } from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/** Public service information when no published provider product is available.
 *  Deliberately has no fabricated provider, application or eligibility model. */
export function FinancialServiceOverview({ service, providerQuery }: { service: Product; providerQuery: ProviderOfferQuery }) {
  const guide = FINANCIAL_SERVICE_GUIDES[service.id];
  const href = financialServiceHref(service.id);
  const related = LOAN_PRODUCTS.filter((item) => item.group === service.group && item.id !== service.id).slice(0, 3);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Service", name: service.label, description: service.description, serviceType: "Financial service enquiry and assistance", url: `${SITE_URL}${href}`, provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL }, areaServed: { "@type": "Country", name: "India" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Financial services", item: `${SITE_URL}/loans` },
        { "@type": "ListItem", position: 3, name: service.label, item: `${SITE_URL}${href}` },
      ] },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className="border-b border-border bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Link href="/loans#financial-services-catalogue" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            <ArrowLeft className="h-4 w-4" aria-hidden />All financial services
          </Link>
          <div className="mt-6 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <div>
              <h1 className="font-heading text-4xl font-semibold text-brand-navy sm:text-5xl lg:text-6xl">{service.label}</h1>
              <p className="mt-5 max-w-3xl text-xl leading-relaxed text-text-secondary">{service.description}</p>
              <p className="mt-4 max-w-3xl text-base leading-7 text-text-secondary">{guide.introduction}</p>
              <div className="mt-8 max-w-xs">
                <LeadDialog businessLine="loans" product={service.label} triggerLabel="Enquire now" size="lg" origin="financial-service-detail" href={contactHref({ line: "loans", product: service.label })} />
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <ServiceArtwork slug={service.id} sizes="(min-width:1024px) 384px, (min-width:640px) 640px, 92vw" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-14 sm:px-6 sm:py-16 lg:px-8" aria-labelledby="service-enquiry-heading">
        <div className="mx-auto max-w-7xl">
          <h2 id="service-enquiry-heading" className="font-heading text-3xl font-semibold text-brand-navy">Plan your enquiry</h2>
          <p className="mt-3 max-w-2xl text-text-secondary">These are useful starting points for a conversation with our team.</p>
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {guide.topics.map((topic) => (
              <li key={topic} className="flex gap-3 rounded-xl border border-border bg-surface p-5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" aria-hidden />
                <span className="font-medium leading-6 text-text-primary">{topic}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-5 rounded-2xl border border-border bg-[var(--nav-bg)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <MessageSquare className="mt-1 h-6 w-6 shrink-0 text-brand-blue" aria-hidden />
              <div>
                <h3 className="font-heading text-xl font-semibold text-brand-navy">Speak with our team</h3>
                <p className="mt-2 max-w-2xl leading-7 text-text-secondary">Send an enquiry with your contact details and what you would like to discuss. Our team can guide you through the next step.</p>
              </div>
            </div>
            <Button asChild className="shrink-0"><Link href={contactHref({ line: "loans", product: service.label })}>Contact us<ArrowRight className="h-4 w-4" aria-hidden /></Link></Button>
          </div>
        </div>
      </section>

      <FinancialProviderOptions
        product={{ slug: service.id, label: service.label }}
        query={providerQuery}
        applicationAvailable={false}
      />

      {related.length > 0 ? (
        <section className="border-t border-border bg-[var(--nav-bg)] px-4 py-14 sm:px-6 sm:py-16 lg:px-8" aria-labelledby="related-services-heading">
          <div className="mx-auto max-w-7xl">
            <h2 id="related-services-heading" className="font-heading text-3xl font-semibold text-brand-navy">More financial services</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {related.map((item) => (
                <Link key={item.id} href={financialServiceHref(item.id)} className="group rounded-xl border border-border bg-surface p-6 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none">
                  <div className="flex items-start justify-between gap-3"><h3 className="font-heading text-lg font-semibold text-brand-navy">{item.label}</h3><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-brand-blue" aria-hidden /></div>
                  <p className="mt-3 text-sm leading-6 text-text-secondary">{item.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
