import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { getExploreCategory } from "@/features/dashboard/explore-categories";
import { applyHref, ProviderOfferList } from "@/features/loans/provider-offer-list";
import { ProviderOfferFilters, PROVIDER_TYPE_LABEL } from "@/features/loans/provider-offer-filters";
import {
  getPublicFinancialProduct,
  getPublicProviderOffers,
  type ProviderOfferQuery,
  type ProviderType,
  type PublicFinancialProduct,
} from "@/lib/financial-catalog";

type PageProps = {
  params: Promise<{ slug: string; productSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ProductFacts({ product }: { product: PublicFinancialProduct }) {
  const sections = [
    { title: "Why consider it", icon: CheckCircle2, items: product.highlights },
    { title: "General eligibility", icon: ShieldCheck, items: product.eligibility },
    { title: "Documents to prepare", icon: FileText, items: product.documents },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {sections.map((section) => (
        <Card key={section.title} className="h-full">
          <CardHeader>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-loans-soft text-loans-accent">
              <section.icon className="h-5 w-5" aria-hidden />
            </span>
            <CardTitle className="mt-3 text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            {section.items.length > 0 ? (
              <ul className="space-y-3 text-sm text-text-secondary">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-cta" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">
                Details vary by lender. Apply and our team will guide you.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { productSlug } = await params;
  const product = await getPublicFinancialProduct(productSlug);
  return { title: product ? `${product.label} | Explore` : "Financial product" };
}

// Category product page: facts + published lender offers + Apply, built on
// the same anonymous public financial-products catalogue /loans/[slug] reads
// (lib/financial-catalog.ts), so no API, contract, or migration change was
// needed. Server component -- that module throws if imported client-side.
export default async function ExploreProductPage({ params, searchParams }: PageProps) {
  const [{ slug, productSlug }, raw] = await Promise.all([params, searchParams]);

  const category = getExploreCategory(slug);
  if (!category) notFound();

  const product = await getPublicFinancialProduct(productSlug);
  if (!product || product.category !== category.category) notFound();

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
    sort,
    page: providerPage,
    pageSize: 9,
  };
  const offers = await getPublicProviderOffers(product.slug, offerQuery);
  const basePath = `/dashboard/explore/${slug}/${productSlug}`;

  return (
    <DashboardPage>
      <Link
        href={`/dashboard/explore/${slug}`}
        className="inline-flex items-center gap-1.5 rounded text-sm text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {category.label}
      </Link>

      <DashboardHeader
        title={product.label}
        description={product.summary}
        actions={
          <Button asChild>
            <Link href={applyHref(product.id)}>
              {product.category === "loan" ? "Apply" : "Request a quote"}
            </Link>
          </Button>
        }
      />

      <p className="max-w-3xl text-sm leading-6 text-text-secondary">{product.description}</p>

      <ProductFacts product={product} />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Compare lenders</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Terms are informational snapshots last verified by Dhanadhara. Final pricing,
            eligibility, documents, and approval come from the selected lender after review.
          </p>
        </div>

        <ProviderOfferFilters q={offerQuery.q} providerType={providerType} sort={sort} />

        <ProviderOfferList offers={offers} productId={product.id} basePath={basePath} query={offerQuery} />
      </section>

      {product.faq.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">
            Questions about {product.label}
          </h2>
          {product.faq.map((item) => (
            <details key={item.question} className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold text-text-primary">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{item.answer}</p>
            </details>
          ))}
        </section>
      ) : null}
    </DashboardPage>
  );
}
