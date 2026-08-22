import { Landmark, Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { LeadDialog } from "@/components/lead-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicFinancialProductList } from "@/lib/financial-catalog";
import { contactHref } from "@/lib/leads";
import { LOAN_PRODUCTS } from "@/lib/products";

type CatalogueQuery = {
  q?: string;
  category?: "loan" | "credit_card" | "insurance";
  page?: number;
};

const CATEGORY_LABEL = {
  loan: "Loans and funding",
  credit_card: "Credit cards",
  insurance: "Insurance",
} as const;

function pageHref(query: CatalogueQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/loans?${suffix}` : "/loans";
}

export function FinancialServicesCatalogue({
  catalogue,
  query,
}: {
  catalogue: PublicFinancialProductList;
  query: CatalogueQuery;
}) {
  const pageCount = Math.max(1, Math.ceil(catalogue.total / catalogue.page_size));

  return (
    <section
      id="financial-services-catalogue"
      className="border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-blue">
            Admin-curated catalogue
          </p>
          <h2 className="mt-3 font-heading text-3xl font-semibold text-foreground sm:text-4xl">
            Explore financial services
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Search the products currently published by Dhanadhara. Open any service to review
            configured providers and continue through an internal application or enquiry.
          </p>
        </div>

        <form
          action="/loans"
          className="mt-8 grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:grid-cols-[1fr_14rem_auto] sm:items-end"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="financial-service-search">Search services</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
                aria-hidden
              />
              <Input
                id="financial-service-search"
                name="q"
                defaultValue={query.q}
                placeholder="Personal loan, insurance, cards..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="financial-service-category">Category</Label>
            <select
              id="financial-service-category"
              name="category"
              defaultValue={query.category ?? ""}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Show results
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary" aria-live="polite">
            {catalogue.total} published service{catalogue.total === 1 ? "" : "s"}
          </p>
          {query.q || query.category ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/loans#financial-services-catalogue">Clear filters</Link>
            </Button>
          ) : null}
        </div>

        {catalogue.items.length > 0 ? (
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {catalogue.items.map((product) => {
              const visual = LOAN_PRODUCTS.find((item) => item.id === product.slug);
              const href = `/loans/${product.slug}`;
              return (
                <Card
                  key={product.id}
                  className="group relative flex h-full flex-col overflow-hidden pt-0 transition duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <Link href={href} className="absolute inset-0 z-10 rounded-xl" aria-label={`Explore ${product.label}`} />
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-[var(--nav-tint)]/70 via-[var(--nav-tint)]/30 to-transparent">
                    {visual?.illustration ? (
                      <Image
                        src={visual.illustration}
                        alt=""
                        aria-hidden
                        fill
                        sizes="(min-width:1280px) 280px, (min-width:640px) 50vw, 100vw"
                        className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm">
                          <Landmark className="h-8 w-8" aria-hidden />
                        </span>
                      </div>
                    )}
                  </div>
                  <CardHeader className="relative z-10 flex-1 pointer-events-none">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="font-heading text-lg text-foreground">
                        {product.label}
                      </CardTitle>
                      <span className="shrink-0 rounded-full bg-brand-blue/10 px-2 py-1 text-xs font-semibold text-brand-blue">
                        {product.provider_count} provider{product.provider_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <CardDescription className="text-base text-text-secondary">
                      {product.summary}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="relative z-20 flex flex-col gap-2">
                    <Button asChild className="w-full">
                      <Link href={href}>Explore</Link>
                    </Button>
                    <LeadDialog
                      businessLine="loans"
                      product={product.label}
                      triggerLabel="Enquire now"
                      triggerVariant="outline"
                      href={contactHref({ line: "loans", product: product.label })}
                    />
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <h3 className="font-heading text-xl font-semibold text-foreground">
              No published services match these filters
            </h3>
            <p className="mt-2 text-text-secondary">Try a broader search or clear the category.</p>
          </div>
        )}

        {pageCount > 1 ? (
          <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Catalogue pages">
            {catalogue.page > 1 ? (
              <Button asChild variant="outline">
                <Link href={pageHref(query, catalogue.page - 1)}>Previous</Link>
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
                <Link href={pageHref(query, catalogue.page + 1)}>Next</Link>
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
