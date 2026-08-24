import { BadgeIndianRupee, CalendarRange, FileText, Landmark } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToCompareButton } from "@/features/loans/add-to-compare-button";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { formatINR } from "@/lib/format";
import type { ProductCategory, ProviderOfferQuery, PublicProviderOfferList } from "@/lib/financial-catalog";

import { PROVIDER_TYPE_LABEL } from "./provider-offer-filters";

/** /dashboard/apply already reads both params for preselection (see
 *  app/(app)/dashboard/apply/page.tsx). `productId` is the loan_types UUID
 *  (PublicFinancialProductRead.id), which /dashboard/apply matches exactly --
 *  the slug is not accepted there. */
export function applyHref(productId: string, offerId?: string): string {
  const params = new URLSearchParams({ product: productId });
  if (offerId) params.set("offer", offerId);
  return `/dashboard/apply?${params.toString()}`;
}

export function formatAmount(value: string | null): string | null {
  return value === null ? null : formatINR(Number(value));
}

export function formatVerifiedAt(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function offerPageHref(basePath: string, query: ProviderOfferQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("provider_q", query.q);
  if (query.providerType) params.set("provider_type", query.providerType);
  if (query.sort && query.sort !== "recommended") params.set("sort", query.sort);
  if (page > 1) params.set("provider_page", String(page));
  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

// Lender offer cards for the Explore product page, ported from the public
// /loans/[slug] provider grid (informational terms, no external lender link)
// onto dashboard tokens. `basePath` is this product page's own URL, used to
// build the pagination links.
export function ProviderOfferList({
  offers,
  productId,
  productSlug,
  productCategory,
  basePath,
  query,
}: {
  offers: PublicProviderOfferList;
  productId: string;
  productSlug: string;
  productCategory: ProductCategory;
  basePath: string;
  query: ProviderOfferQuery;
}) {
  const pageCount = Math.max(1, Math.ceil(offers.total / offers.page_size));

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary" aria-live="polite">
        {offers.total} published option{offers.total === 1 ? "" : "s"}
      </p>

      {offers.items.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {offers.items.map((offer) => {
            const initials = offer.provider.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase();
            const minAmount = formatAmount(offer.min_amount);
            const maxAmount = formatAmount(offer.max_amount);
            const verifiedAt = formatVerifiedAt(offer.last_verified_at);
            return (
              <Card key={offer.id} className="h-full overflow-hidden pt-0">
                <div className="flex items-center gap-4 border-b border-border bg-card px-5 py-4">
                  <div className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                    {offer.provider.logo_url && isAllowedAssetUrl(offer.provider.logo_url) ? (
                      <Image
                        src={offer.provider.logo_url}
                        alt={`${offer.provider.name} logo`}
                        fill
                        sizes="80px"
                        className="object-contain p-2"
                      />
                    ) : (
                      <span className="text-base font-bold text-brand-cta" aria-hidden>
                        {initials}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-text-primary">
                      {offer.provider.name}
                    </h3>
                    <p className="text-xs text-text-secondary">
                      {PROVIDER_TYPE_LABEL[offer.provider.provider_type]}
                    </p>
                    {verifiedAt ? (
                      <p className="mt-1 text-xs text-text-secondary">Terms verified {verifiedAt}</p>
                    ) : null}
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{offer.offer_name}</CardTitle>
                  {offer.summary ? (
                    <p className="text-sm leading-6 text-text-secondary">{offer.summary}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-muted/40 p-3">
                    <BadgeIndianRupee className="h-4 w-4 text-brand-cta" aria-hidden />
                    <p className="mt-2 text-xs text-text-secondary">Indicative amount</p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {minAmount && maxAmount
                        ? `${minAmount} - ${maxAmount}`
                        : (maxAmount ?? minAmount ?? "Ask us")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3">
                    <Landmark className="h-4 w-4 text-brand-cta" aria-hidden />
                    <p className="mt-2 text-xs text-text-secondary">Interest range</p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {offer.min_interest_rate !== null
                        ? `${offer.min_interest_rate}%${offer.max_interest_rate !== null ? ` - ${offer.max_interest_rate}%` : "+"}`
                        : "Ask us"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3">
                    <CalendarRange className="h-4 w-4 text-brand-cta" aria-hidden />
                    <p className="mt-2 text-xs text-text-secondary">Tenure</p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {offer.min_tenure_months !== null
                        ? `${offer.min_tenure_months}${offer.max_tenure_months !== null ? ` - ${offer.max_tenure_months}` : "+"} months`
                        : "Ask us"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3">
                    <FileText className="h-4 w-4 text-brand-cta" aria-hidden />
                    <p className="mt-2 text-xs text-text-secondary">Processing fee</p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {offer.processing_fee_text ?? "Lender assessed"}
                    </p>
                  </div>
                  {offer.eligibility_summary ? (
                    <div className="col-span-2 rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-xs font-semibold text-text-primary">Eligibility note</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {offer.eligibility_summary}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button asChild className="w-full">
                    <Link href={applyHref(productId, offer.id)}>Apply with this option</Link>
                  </Button>
                  <AddToCompareButton
                    offerId={offer.id}
                    productSlug={productSlug}
                    productCategory={productCategory}
                  />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <h3 className="text-lg font-semibold text-text-primary">
            No published lender options match yet
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            You can still apply. Our team will review the currently available internal options
            with you.
          </p>
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-3" aria-label="Lender result pages">
          {offers.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={offerPageHref(basePath, query, offers.page - 1)}>Previous</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Previous
            </Button>
          )}
          <span className="text-sm text-text-secondary">
            Page {offers.page} of {pageCount}
          </span>
          {offers.page < pageCount ? (
            <Button asChild variant="outline">
              <Link href={offerPageHref(basePath, query, offers.page + 1)}>Next</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Next
            </Button>
          )}
        </nav>
      ) : null}
    </div>
  );
}
