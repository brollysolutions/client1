import { ArrowRight } from "lucide-react";
import Link from "next/link";
import React from "react";

import { FinancialServicesFilters } from "@/components/financial-services-filters";
import { LeadDialog } from "@/components/lead-dialog";
import { ServiceArtwork } from "@/components/service-artwork";
import { Button } from "@/components/ui/button";
import type { CatalogueFacets } from "@/lib/financial-catalog";
import {
  CATALOGUE_ANCHOR,
  catalogueAnchorHref,
  type CatalogueQuery,
} from "@/lib/financial-catalogue-url";
import { contactHref } from "@/lib/leads";
import type { ServiceDirectoryItem, ServiceDirectoryPage } from "@/lib/service-directory";

function ServiceCard({ product }: { product: ServiceDirectoryItem }) {
  const href = product.detailHref;

  return (
    <article
      id={product.id}
      className="group relative flex h-full scroll-mt-64 flex-col overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand-cta hover:shadow-md motion-reduce:transition-none"
    >
      {product.legacyAnchorId ? (
        <span id={product.legacyAnchorId} className="absolute top-0 scroll-mt-64" />
      ) : null}
      <ServiceArtwork slug={product.slug} />

      <div className="flex flex-1 flex-col px-5 pt-5">
        <h3 className="font-heading text-lg font-semibold leading-snug text-foreground">
          {product.label}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text-secondary">
          {product.summary}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--nav-border)] px-5 py-4">
        {/* Decorative: the whole card is already the link to `href`, so this
            stays a span to avoid a duplicate link for screen readers. */}
        {href ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
            <span>Explore</span>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              aria-hidden
            />
          </span>
        ) : (
          <span className="text-sm text-text-secondary">Talk to our team</span>
        )}
        <div className="relative z-20 w-[8.75rem] shrink-0">
          <LeadDialog
            businessLine="loans"
            product={product.label}
            triggerLabel="Enquire now"
            triggerVariant="outline"
            href={contactHref({ line: "loans", product: product.label })}
          />
        </div>
      </div>

      {/* Stretched link last so it sits above the artwork and body, but below
          the z-20 Enquire action. */}
      {href ? (
        <Link
          href={href}
          aria-label={`Explore ${product.label}`}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
        />
      ) : null}
    </article>
  );
}

export function FinancialServicesCatalogue({
  catalogue,
  facets,
  query,
}: {
  catalogue: ServiceDirectoryPage;
  facets: CatalogueFacets;
  query: CatalogueQuery;
}) {
  const pageCount = Math.max(1, Math.ceil(catalogue.total / catalogue.page_size));
  const filtered = Boolean(query.q || query.category);

  return (
    <section
      id={CATALOGUE_ANCHOR}
      // scroll-mt clears the 64px site header plus the sticky filter bar, so
      // anchored jumps land on the results rather than behind the chrome.
      className="scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="font-heading text-3xl font-semibold text-foreground sm:text-4xl">
            Explore financial services
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Explore our loans, insurance and credit card services. Compare available
            provider options or enquire with our team for guidance.
          </p>
        </div>
      </div>

      <FinancialServicesFilters
        q={query.q}
        category={query.category}
        total={catalogue.total}
        facets={facets}
        filtered={filtered}
      />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 lg:px-8">
        {catalogue.items.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {catalogue.items.map((product) => (
              <ServiceCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--nav-border)] bg-surface px-6 py-14 text-center">
            <h3 className="font-heading text-xl font-semibold text-foreground">
              No services match these filters
            </h3>
            <p className="mt-2 text-text-secondary">Try a broader search or another category.</p>
            {filtered ? (
              <Button asChild variant="outline" className="mt-6">
                <Link href={catalogueAnchorHref()}>Clear filters</Link>
              </Button>
            ) : null}
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Catalogue pages">
            {catalogue.page > 1 ? (
              <Button asChild variant="outline">
                <Link href={catalogueAnchorHref({ ...query, page: catalogue.page - 1 })}>
                  Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Previous
              </Button>
            )}
            <span className="text-sm text-text-secondary">
              Page {catalogue.page} of {pageCount}
            </span>
            {catalogue.page < pageCount ? (
              <Button asChild variant="outline">
                <Link href={catalogueAnchorHref({ ...query, page: catalogue.page + 1 })}>Next</Link>
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
