import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarRange,
  CheckCircle2,
  FileText,
  Landmark,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadDialog } from "@/components/lead-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPublicFinancialProduct,
  getPublicProviderOffers,
  type ProviderOfferQuery,
  type ProviderType,
  type PublicFinancialProduct,
} from "@/lib/financial-catalog";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { contactHref } from "@/lib/leads";
import { SITE_NAME, SITE_URL } from "@/lib/site";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PROVIDER_TYPE_LABEL: Record<ProviderType, string> = {
  bank: "Bank",
  small_finance_bank: "Small finance bank",
  nbfc: "NBFC",
  hfc: "Housing finance company",
  fintech: "Fintech",
  other: "Financial provider",
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function applyHref(slug: string, offerId?: string): string {
  const params = new URLSearchParams({ product: slug });
  if (offerId) params.set("offer", offerId);
  return `/login?return_to=${encodeURIComponent(`/dashboard/apply?${params.toString()}`)}`;
}

function formatRupees(value: number | string | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatVerifiedAt(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function offerPageHref(slug: string, query: ProviderOfferQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("provider_q", query.q);
  if (query.providerType) params.set("provider_type", query.providerType);
  if (query.amount) params.set("amount", query.amount);
  if (query.interestRateMax) params.set("interest_rate_max", query.interestRateMax);
  if (query.tenureMonths) params.set("tenure_months", query.tenureMonths);
  if (query.sort && query.sort !== "recommended") params.set("sort", query.sort);
  if (page > 1) params.set("provider_page", String(page));
  const suffix = params.toString();
  return suffix ? `/loans/${slug}?${suffix}#providers` : `/loans/${slug}#providers`;
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
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
              <section.icon className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle className="mt-3 font-heading text-xl">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {section.items.length > 0 ? (
              <ul className="space-y-3 text-sm text-text-secondary">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden />
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
  const product = await getPublicFinancialProduct(slug);
  if (!product) return { title: "Financial service" };
  return {
    title: `${product.label} Providers and Internal Application`,
    description: product.summary,
    alternates: { canonical: `/loans/${product.slug}` },
  };
}

export default async function FinancialServicePage({ params, searchParams }: PageProps) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const product = await getPublicFinancialProduct(slug);
  if (!product) notFound();

  const providerTypeValue = one(raw.provider_type);
  const providerType = Object.hasOwn(PROVIDER_TYPE_LABEL, providerTypeValue ?? "")
    ? (providerTypeValue as ProviderType)
    : undefined;
  const sortValue = one(raw.sort);
  const sort =
    sortValue === "interest_rate" || sortValue === "amount" || sortValue === "updated"
      ? sortValue
      : "recommended";
  const requestedPage = Number(one(raw.provider_page) ?? "1");
  const providerPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offerQuery: ProviderOfferQuery = {
    q: one(raw.provider_q)?.trim() || undefined,
    providerType,
    amount: one(raw.amount)?.trim() || undefined,
    interestRateMax: one(raw.interest_rate_max)?.trim() || undefined,
    tenureMonths: one(raw.tenure_months)?.trim() || undefined,
    sort,
    page: providerPage,
    pageSize: 9,
  };
  const offers = await getPublicProviderOffers(product.slug, offerQuery);
  const pageCount = Math.max(1, Math.ceil(offers.total / offers.page_size));
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
            item: `${SITE_URL}/loans/${product.slug}`,
          },
        ],
      },
      {
        "@type": "Service",
        name: product.label,
        description: product.description,
        serviceType: "Financial product comparison and application assistance",
        url: `${SITE_URL}/loans/${product.slug}`,
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
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-blue hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All financial services
          </Link>
          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[1fr_24rem]">
            <div>
              <Badge variant="secondary">{product.provider_count} configured providers</Badge>
              <h1 className="mt-4 max-w-4xl font-heading text-4xl font-semibold text-foreground sm:text-5xl lg:text-6xl">
                {product.label}
              </h1>
              <p className="mt-5 max-w-3xl text-xl text-text-secondary">{product.summary}</p>
              <p className="mt-4 max-w-3xl text-base leading-7 text-text-secondary">
                {product.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href={applyHref(product.slug)}>
                    {product.category === "loan" ? "Apply inside Dhanadhara" : "Request a quote"}
                  </Link>
                </Button>
                <LeadDialog
                  businessLine="loans"
                  product={product.label}
                  triggerLabel="Enquire now"
                  triggerVariant="outline"
                  origin="financial-service-detail"
                  href={contactHref({ line: "loans", product: product.label })}
                />
              </div>
            </div>
            <div className="rounded-[2rem] border border-brand-blue/15 bg-gradient-to-br from-white to-[var(--nav-tint)] p-8 shadow-sm">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-blue text-white shadow-lg shadow-brand-blue/20">
                <BadgeIndianRupee className="h-10 w-10" aria-hidden />
              </div>
              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-brand-blue">
                One guided route
              </p>
              <p className="mt-2 font-heading text-2xl font-semibold text-foreground">
                Compare here. Continue here.
              </p>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                {SITE_NAME} does not redirect you to a lender website. Your application or enquiry
                remains inside the platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <ProductFacts product={product} />
        </div>
      </section>

      <section id="providers" className="scroll-mt-20 bg-[var(--nav-bg)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-blue">
              Provider explorer
            </p>
            <h2 className="mt-3 font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              Compare configured provider options
            </h2>
            <p className="mt-4 text-text-secondary">
              Terms are informational snapshots last verified by Dhanadhara. Final pricing,
              eligibility, documents, and approval come from the selected provider after review.
            </p>
          </div>

          <form className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_14rem_14rem_auto] lg:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="provider-search">Search providers</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
                  <Input
                    id="provider-search"
                    name="provider_q"
                    defaultValue={offerQuery.q}
                    placeholder="Provider or offer name"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="provider-type">Provider type</Label>
                <select
                  id="provider-type"
                  name="provider_type"
                  defaultValue={providerType ?? ""}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All provider types</option>
                  {Object.entries(PROVIDER_TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="provider-sort">Sort by</Label>
                <select
                  id="provider-sort"
                  name="sort"
                  defaultValue={sort}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="recommended">Recommended order</option>
                  <option value="interest_rate">Lowest starting rate</option>
                  <option value="amount">Highest available amount</option>
                  <option value="updated">Recently verified</option>
                </select>
              </div>
              <Button type="submit">
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Apply filters
              </Button>
            </div>
            <details className="mt-4 border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Advanced filters
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="provider-amount">Required amount (₹)</Label>
                  <Input id="provider-amount" name="amount" type="number" min="0" defaultValue={offerQuery.amount} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="provider-rate">Maximum starting rate (%)</Label>
                  <Input id="provider-rate" name="interest_rate_max" type="number" min="0" max="100" step="0.01" defaultValue={offerQuery.interestRateMax} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="provider-tenure">Required tenure (months)</Label>
                  <Input id="provider-tenure" name="tenure_months" type="number" min="1" max="600" defaultValue={offerQuery.tenureMonths} />
                </div>
              </div>
            </details>
          </form>

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-text-secondary" aria-live="polite">
              {offers.total} published option{offers.total === 1 ? "" : "s"}
            </p>
            {Object.values(offerQuery).some((value) => value && value !== 1 && value !== 9 && value !== "recommended") ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/loans/${product.slug}#providers`}>Clear filters</Link>
              </Button>
            ) : null}
          </div>

          {offers.items.length > 0 ? (
            <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {offers.items.map((offer) => {
                const initials = offer.provider.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase();
                const minAmount = formatRupees(offer.min_amount);
                const maxAmount = formatRupees(offer.max_amount);
                const verifiedAt = formatVerifiedAt(offer.last_verified_at);
                return (
                  <Card key={offer.id} className="h-full overflow-hidden pt-0">
                    <div className="flex items-center gap-4 border-b border-border bg-white px-6 py-5">
                      <div className="relative flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                        {offer.provider.logo_url && isAllowedAssetUrl(offer.provider.logo_url) ? (
                          <Image src={offer.provider.logo_url} alt={`${offer.provider.name} logo`} fill sizes="96px" className="object-contain p-2" />
                        ) : (
                          <span className="text-lg font-bold text-brand-blue" aria-hidden>{initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-heading text-lg font-semibold text-foreground">{offer.provider.name}</h3>
                        <p className="text-xs text-text-secondary">{PROVIDER_TYPE_LABEL[offer.provider.provider_type]}</p>
                        {verifiedAt ? (
                          <p className="mt-1 text-xs text-text-secondary">
                            Terms verified {verifiedAt}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <CardHeader>
                      <CardTitle className="font-heading text-xl">{offer.offer_name}</CardTitle>
                      {offer.summary ? <p className="text-sm leading-6 text-text-secondary">{offer.summary}</p> : null}
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-surface p-3">
                        <BadgeIndianRupee className="h-4 w-4 text-brand-blue" aria-hidden />
                        <p className="mt-2 text-xs text-text-secondary">Indicative amount</p>
                        <p className="mt-1 font-semibold text-foreground">{minAmount && maxAmount ? `${minAmount} - ${maxAmount}` : maxAmount ?? minAmount ?? "Ask us"}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <Landmark className="h-4 w-4 text-brand-blue" aria-hidden />
                        <p className="mt-2 text-xs text-text-secondary">Interest range</p>
                        <p className="mt-1 font-semibold text-foreground">{offer.min_interest_rate !== null ? `${offer.min_interest_rate}%${offer.max_interest_rate !== null ? ` - ${offer.max_interest_rate}%` : "+"}` : "Ask us"}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <CalendarRange className="h-4 w-4 text-brand-blue" aria-hidden />
                        <p className="mt-2 text-xs text-text-secondary">Tenure</p>
                        <p className="mt-1 font-semibold text-foreground">{offer.min_tenure_months !== null ? `${offer.min_tenure_months}${offer.max_tenure_months !== null ? ` - ${offer.max_tenure_months}` : "+"} months` : "Ask us"}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <FileText className="h-4 w-4 text-brand-blue" aria-hidden />
                        <p className="mt-2 text-xs text-text-secondary">Processing fee</p>
                        <p className="mt-1 font-semibold text-foreground">{offer.processing_fee_text ?? "Provider assessed"}</p>
                      </div>
                      {offer.eligibility_summary ? (
                        <div className="col-span-2 rounded-xl border border-border bg-[var(--nav-bg)] p-3">
                          <p className="text-xs font-semibold text-foreground">Eligibility note</p>
                          <p className="mt-1 text-sm leading-6 text-text-secondary">
                            {offer.eligibility_summary}
                          </p>
                        </div>
                      ) : null}
                    </CardContent>
                    <CardFooter className="mt-auto flex flex-col gap-2">
                      <Button asChild className="w-full">
                        <Link href={applyHref(product.slug, offer.id)}>Apply with this option</Link>
                      </Button>
                      <LeadDialog
                        businessLine="loans"
                        product={`${product.label} - ${offer.provider.name}`}
                        triggerLabel="Enquire about this option"
                        triggerVariant="outline"
                        origin="provider-offer-card"
                        href={contactHref({ line: "loans", product: `${product.label} - ${offer.provider.name}` })}
                      />
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <h3 className="font-heading text-xl font-semibold text-foreground">No published provider options match yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-text-secondary">You can still apply or enquire. Our team will review the currently available internal options with you.</p>
            </div>
          )}

          {pageCount > 1 ? (
            <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Provider result pages">
              {offers.page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={offerPageHref(product.slug, offerQuery, offers.page - 1)}>
                    Previous
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Previous
                </Button>
              )}
              <span className="text-sm text-text-secondary">Page {offers.page} of {pageCount}</span>
              {offers.page < pageCount ? (
                <Button asChild variant="outline">
                  <Link href={offerPageHref(product.slug, offerQuery, offers.page + 1)}>Next</Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Next
                </Button>
              )}
            </nav>
          ) : null}
        </div>
      </section>

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
