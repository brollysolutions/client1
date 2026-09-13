import * as React from "react";
import { BadgeIndianRupee, CalendarRange, FileText, Landmark, Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LeadDialog } from "@/components/lead-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import type { ProviderOfferQuery, ProviderType, PublicFinancialProduct, PublicProviderOfferList } from "@/lib/financial-catalog";
import { boundedNumberFilter } from "@/lib/form-validation";
import { contactHref } from "@/lib/leads";
import { financialServiceHref } from "@/lib/products";

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

export function financialApplicationHref(slug: string, offerId?: string): string {
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
  return `${financialServiceHref(slug)}${suffix ? `?${suffix}` : ""}#providers`;
}

export function providerOfferQuery(raw: Record<string, string | string[] | undefined>): ProviderOfferQuery {
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
  const providerQuery = one(raw.provider_q)?.trim().slice(0, 100) || undefined;
  return {
    q: providerQuery,
    providerType,
    amount: boundedNumberFilter(one(raw.amount), { min: 0, max: 99_999_999_999 }),
    interestRateMax: boundedNumberFilter(one(raw.interest_rate_max), { min: 0, max: 100 }),
    tenureMonths: boundedNumberFilter(one(raw.tenure_months), {
      min: 1,
      max: 600,
      integer: true,
    }),
    sort,
    page: providerPage,
    pageSize: 9,
  };
}

/** Shared comparison surface for every service, including unpublished overviews.
 * Only the public API supplies offers; an overview never gains an application link. */
export function FinancialProviderOptions({ product, query: offerQuery, offers: publishedOffers, applicationAvailable = true }: {
  product: Pick<PublicFinancialProduct, "slug" | "label">;
  query: ProviderOfferQuery;
  offers?: PublicProviderOfferList;
  applicationAvailable?: boolean;
}) {
  const offers = publishedOffers ?? { items: [], total: 0, page: 1, page_size: 9 };
  const providerType = offerQuery.providerType;
  const sort = offerQuery.sort ?? "recommended";
  const pageCount = Math.max(1, Math.ceil(offers.total / offers.page_size));
  return (
      <section id="providers" className="scroll-mt-20 bg-[var(--nav-bg)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
              Compare configured provider options
            </h2>
            <p className="mt-4 text-text-secondary">
              Terms are informational snapshots last verified by Dhanadhara. Final pricing,
              eligibility, documents, and approval come from the selected provider after review.
            </p>
          </div>

          <form key={JSON.stringify(offerQuery)} action={`${financialServiceHref(product.slug)}#providers`} method="get" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_14rem_14rem_auto] lg:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="provider-search">Search providers</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
                  <Input
                    id="provider-search"
                    name="provider_q"
                    defaultValue={offerQuery.q}
                    maxLength={100}
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
                  className="h-11 rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
                  className="h-11 rounded-md border border-input bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
                <Link href={`${financialServiceHref(product.slug)}#providers`}>Clear filters</Link>
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
                        <Link href={financialApplicationHref(product.slug, offer.id)}>Apply with this option</Link>
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
              <h3 className="font-heading text-xl font-semibold text-foreground">{applicationAvailable ? "No published provider options match yet" : "No provider options published yet"}</h3>
              <p className="mx-auto mt-2 max-w-xl text-text-secondary">{applicationAvailable ? "You can still apply or enquire. Our team will review the currently available internal options with you." : "Send an enquiry about this service and our team can help you with the next step."}</p>
              {!applicationAvailable ? <Button asChild variant="outline" className="mt-5"><Link href={contactHref({ line: "loans", product: product.label })}>Enquire about {product.label}</Link></Button> : null}
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
  );
}
