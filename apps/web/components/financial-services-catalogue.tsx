import { ArrowRight, CreditCard, Landmark, ShieldCheck, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { FinancialServicesFilters } from "@/components/financial-services-filters";
import { LeadDialog } from "@/components/lead-dialog";
import { Button } from "@/components/ui/button";
import type {
  CatalogueFacets,
  PublicFinancialProduct,
  PublicFinancialProductList,
} from "@/lib/financial-catalog";
import {
  CATALOGUE_ANCHOR,
  catalogueAnchorHref,
  type CatalogueCategory,
  type CatalogueQuery,
} from "@/lib/financial-catalogue-url";
import { contactHref } from "@/lib/leads";
import { catalogueIllustration } from "@/lib/products";

// Category glyph for a published service that has no spot illustration yet.
// Drawn into the same tinted plate the artwork sits on so an unmapped slug
// reads as a designed state rather than a broken image.
const FALLBACK_ICON: Record<CatalogueCategory, LucideIcon> = {
  loan: Landmark,
  credit_card: CreditCard,
  insurance: ShieldCheck,
};

function CardArtwork({ product }: { product: PublicFinancialProduct }) {
  const illustration = catalogueIllustration(product.slug);
  const Icon = FALLBACK_ICON[product.category];

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--nav-tint)]/60">
      {illustration ? (
        // The assets are authored at exactly 4:3 to match this plate, so
        // object-contain fills it edge to edge without cropping or padding.
        <Image
          src={illustration}
          alt=""
          aria-hidden
          fill
          sizes="(min-width:1280px) 300px, (min-width:1024px) 31vw, (min-width:640px) 47vw, 92vw"
          className="object-contain transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div aria-hidden className="relative h-full w-full">
          {/* Mirrors the illustration family's backdrop disc and ground shadow. */}
          <span className="absolute bottom-[15%] left-1/2 h-2.5 w-[52%] -translate-x-1/2 rounded-[50%] bg-brand-navy/[0.08]" />
          <span className="absolute left-1/2 top-[46%] flex aspect-square h-[52%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-aqua/50">
            <Icon className="h-1/2 w-1/2 text-brand-navy/60" strokeWidth={1.5} />
          </span>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ product }: { product: PublicFinancialProduct }) {
  const href = `/loans/${product.slug}`;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-bg)] shadow-sm transition duration-200 hover:-translate-y-1 hover:border-brand-blue/40 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <CardArtwork product={product} />

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
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
          <span>Explore</span>
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            aria-hidden
          />
        </span>
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
      <Link
        href={href}
        aria-label={`Explore ${product.label}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue"
      />
    </article>
  );
}

export function FinancialServicesCatalogue({
  catalogue,
  facets,
  query,
}: {
  catalogue: PublicFinancialProductList;
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
            Search the products currently published by Dhanadhara. Open any service to review
            configured providers and continue through an internal application or enquiry.
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
              No published services match these filters
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
