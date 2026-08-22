import { ArrowRight, Landmark } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

import { LeadDialog } from "@/components/lead-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicFinancialProduct } from "@/lib/financial-catalog";
import { contactHref } from "@/lib/leads";
import { LOAN_PRODUCTS } from "@/lib/products";

export function HomeFinancialServices({ products }: { products: PublicFinancialProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="featured-financial-services-heading"
      className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-blue">
              Curated by Dhanadhara
            </p>
            <h2
              id="featured-financial-services-heading"
              className="mt-3 font-heading text-3xl font-semibold text-[var(--nav-text)] sm:text-4xl"
            >
              Financial services for your next step
            </h2>
            <p className="mt-4 text-lg text-text-secondary">
              Explore the services our team has selected, compare available providers, and apply
              or enquire without leaving Dhanadhara.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/loans">
              View all services
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.slice(0, 6).map((product) => {
            const visual = LOAN_PRODUCTS.find((item) => item.id === product.slug);
            const href = `/loans/${product.slug}`;

            return (
              <Card
                key={product.id}
                className="group relative flex h-full flex-col overflow-hidden pt-0 transition duration-200 hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Link
                  href={href}
                  className="absolute inset-0 z-10 rounded-xl"
                  aria-label={`Explore ${product.label}`}
                />
                <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-b from-[var(--nav-tint)]/70 via-[var(--nav-tint)]/30 to-transparent">
                  {visual?.illustration ? (
                    <Image
                      src={visual.illustration}
                      alt=""
                      aria-hidden
                      fill
                      sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
                      className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-blue shadow-sm">
                        <Landmark className="h-7 w-7" aria-hidden />
                      </span>
                    </div>
                  )}
                </div>
                <CardHeader className="pointer-events-none relative z-10 flex-1">
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
      </div>
    </section>
  );
}
