"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Scale, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoanCompare, type ShortlistedOffer } from "@/features/loans/loan-offers-store";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { applyHref, formatAmount, formatVerifiedAt } from "@/features/loans/provider-offer-list";
import { PROVIDER_TYPE_LABEL } from "@/features/loans/provider-offer-filters";
import {
  getPublicFinancialProductClient,
  getPublicProviderOffersClient,
} from "@/lib/financial-catalog-client";
import type { PublicFinancialProduct, PublicProviderOffer } from "@/lib/financial-catalog";

type Status = "loading" | "ready" | "error";

type CatalogEntry = { product: PublicFinancialProduct | null; offers: PublicProviderOffer[] };

export type ResolvedCompareOffer = {
  offerId: string;
  productSlug: string;
  productId: string;
  productLabel: string;
  offer: PublicProviderOffer;
};

// Matches each shortlisted {offerId, productSlug} against the per-product
// catalog fetched for this load, dropping anything that can no longer be
// resolved: the product 404'd, it's not a loan product (defense in depth --
// AddToCompareButton already only renders for category "loan"), or the
// specific offer is no longer in that product's published list. Exported and
// kept pure so it's unit-testable without mocking fetch.
export function resolveShortlistedOffers(
  shortlist: ShortlistedOffer[],
  catalog: Record<string, CatalogEntry>,
): { resolved: ResolvedCompareOffer[]; droppedOfferIds: string[] } {
  const resolved: ResolvedCompareOffer[] = [];
  const droppedOfferIds: string[] = [];
  for (const item of shortlist) {
    const entry = catalog[item.productSlug];
    const product = entry?.product ?? null;
    const offer = entry?.offers.find((candidate) => candidate.id === item.offerId) ?? null;
    if (!product || product.category !== "loan" || !offer) {
      droppedOfferIds.push(item.offerId);
      continue;
    }
    resolved.push({
      offerId: item.offerId,
      productSlug: item.productSlug,
      productId: product.id,
      productLabel: product.label,
      offer,
    });
  }
  return { resolved, droppedOfferIds };
}

// Loans line's "Compare Loan Offers" -> a side-by-side comparison of up to 3
// real, Admin-published provider offers shortlisted from Explore
// (features/loans/add-to-compare-button.tsx). Sourced from the same
// anonymous public financial-products catalogue Explore's product page uses
// (lib/financial-catalog-client.ts, the client-safe twin of
// lib/financial-catalog.ts), resolved fresh against the shortlist's
// {offerId, productSlug} pairs on every load -- nothing about the offer
// itself is cached in localStorage. feature-status §2-7.
export function LoanOffersView() {
  const router = useRouter();
  const compare = useLoanCompare();

  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [resolved, setResolved] = React.useState<ResolvedCompareOffer[]>([]);
  const [droppedCount, setDroppedCount] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Keyed on the shortlist's actual contents (not the `compare` object
  // identity, which changes on every store re-render) so the fetch only
  // re-runs when an offer is actually added or removed.
  const items = compare.items;
  const shortlistKey = items
    .map((item) => `${item.productSlug}:${item.offerId}`)
    .sort()
    .join("|");

  React.useEffect(() => {
    // Wait for localStorage hydration -- otherwise this runs once against
    // the pre-hydration empty array and flashes "Nothing to compare yet"
    // before the real shortlist loads.
    if (!compare.hydrated) return;

    let active = true;
    const run = async () => {
      if (items.length === 0) {
        setResolved([]);
        setDroppedCount(0);
        setStatus("ready");
        return;
      }
      const slugs = Array.from(new Set(items.map((item) => item.productSlug)));
      const entries = await Promise.all(
        slugs.map(async (slug): Promise<[string, CatalogEntry]> => {
          const [productRes, offersRes] = await Promise.all([
            getPublicFinancialProductClient(slug),
            getPublicProviderOffersClient(slug, { pageSize: 100 }),
          ]);
          return [
            slug,
            {
              product: productRes.ok ? productRes.data : null,
              offers: offersRes.ok ? offersRes.data.items : [],
            },
          ];
        }),
      );
      if (!active) return;
      const catalog: Record<string, CatalogEntry> = Object.fromEntries(entries);
      const { resolved: nextResolved, droppedOfferIds } = resolveShortlistedOffers(items, catalog);
      droppedOfferIds.forEach((offerId) => compare.remove(offerId));
      setResolved(nextResolved);
      setDroppedCount(droppedOfferIds.length);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
    // items/compare.remove intentionally excluded: shortlistKey already
    // captures every content change this effect cares about, and re-running
    // on compare.remove's own identity would loop against the prune above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlistKey, compare.hydrated, reloadKey]);

  function removeOffer(offerId: string) {
    compare.remove(offerId);
    setResolved((prev) => prev.filter((item) => item.offerId !== offerId));
  }

  if (status === "loading") {
    return (
      <DashboardPage>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
      </DashboardPage>
    );
  }

  if (status === "error") {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Compare Loan Offers"
        description="Shortlist published lender offers from Explore, then compare them side by side before you apply."
        actions={<Button onClick={() => router.push("/dashboard/explore/loans")}>Apply for a loan</Button>}
      />

      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
        <p>
          Terms are informational snapshots last verified by Dhanadhara. Final pricing,
          eligibility, documents, and approval come from the selected lender after review.
        </p>
      </div>

      {droppedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            {droppedCount} offer{droppedCount === 1 ? "" : "s"} in your comparison{" "}
            {droppedCount === 1 ? "is" : "are"} no longer available and{" "}
            {droppedCount === 1 ? "was" : "were"} removed.
          </p>
        </div>
      ) : null}

      {resolved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-text-secondary">
            <Scale className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-text-primary">Nothing to compare yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Check &quot;Add to compare&quot; on any lender offer on Explore to see it here.
          </p>
          <Link
            href="/dashboard/explore/loans"
            className="mt-4 inline-block text-sm font-semibold text-brand-cta hover:underline"
          >
            Explore loan offers
          </Link>
        </div>
      ) : (
        <DashboardPanel
          title={`Your comparison (${resolved.length}/3)`}
          description="Remove an offer at any time to make room for another."
          action={
            <button
              type="button"
              onClick={compare.clear}
              className="cursor-pointer text-sm text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              Clear all
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary" />
                  {resolved.map((item) => (
                    <th key={item.offerId} scope="col" className="min-w-[220px] px-5 py-3 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-text-primary">{item.offer.offer_name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.offer.offer_name} from compare`}
                          onClick={() => removeOffer(item.offerId)}
                          className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <Button asChild size="sm" className="mt-2 w-full">
                        <Link href={applyHref(item.productId, item.offerId)}>Apply with this option</Link>
                      </Button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Provider
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-primary">
                      {item.offer.provider.name}
                      <span className="mt-0.5 block text-xs text-text-secondary">
                        {PROVIDER_TYPE_LABEL[item.offer.provider.provider_type]}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Product
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-primary">
                      {item.productLabel}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Interest rate
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 font-heading font-semibold text-brand-blue">
                      {item.offer.min_interest_rate !== null
                        ? `${item.offer.min_interest_rate}%${item.offer.max_interest_rate !== null ? ` - ${item.offer.max_interest_rate}%` : "+"}`
                        : "Ask us"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Tenure
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-primary">
                      {item.offer.min_tenure_months !== null
                        ? `${item.offer.min_tenure_months}${item.offer.max_tenure_months !== null ? ` - ${item.offer.max_tenure_months}` : "+"} months`
                        : "Ask us"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Amount
                  </th>
                  {resolved.map((item) => {
                    const minAmount = formatAmount(item.offer.min_amount);
                    const maxAmount = formatAmount(item.offer.max_amount);
                    return (
                      <td key={item.offerId} className="px-5 py-4 text-text-primary">
                        {minAmount && maxAmount ? `${minAmount} - ${maxAmount}` : (maxAmount ?? minAmount ?? "Ask us")}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Processing fee
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-primary">
                      {item.offer.processing_fee_text ?? "Lender assessed"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Eligibility
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-primary">
                      {item.offer.eligibility_summary ?? "—"}
                    </td>
                  ))}
                </tr>
                <tr className="last:border-0">
                  <th scope="row" className="px-5 py-4 text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Last verified
                  </th>
                  {resolved.map((item) => (
                    <td key={item.offerId} className="px-5 py-4 text-text-secondary">
                      {formatVerifiedAt(item.offer.last_verified_at) ?? "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </DashboardPanel>
      )}
    </DashboardPage>
  );
}
