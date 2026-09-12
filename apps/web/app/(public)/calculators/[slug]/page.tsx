import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CalculatorShell } from "@/components/calculators/calculator-shell";
import { CalculatorIsland } from "@/components/calculators/calculator-island";
import { CalculatorPending } from "@/components/calculators/calculator-pending";
import { calculatorJsonLd } from "@/lib/calculators/jsonld";
import { CALCULATOR_SLUGS, getCalculator } from "@/lib/calculators/registry";
import { SITE_NAME } from "@/lib/site";

// One generic route renders any calculator from its registry entry (SSG'd for
// all slugs). Per-calculator uniqueness is declarative (the registry) plus the
// interactive island (lib/calculators/islands.ts).
export function generateStaticParams() {
  return CALCULATOR_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const def = getCalculator((await params).slug);
  if (!def) return {};
  return {
    title: `${def.title} | ${SITE_NAME}`,
    description: def.metaDescription,
    keywords: def.keywords,
    alternates: { canonical: `/calculators/${def.slug}` },
    openGraph: {
      title: def.title,
      description: def.metaDescription,
      type: "website",
      url: `/calculators/${def.slug}`,
    },
  };
}

export default async function CalculatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const def = getCalculator((await params).slug);
  if (!def) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(calculatorJsonLd(def)) }}
      />
      <CalculatorShell def={def}>
        <Suspense fallback={<CalculatorPending />}>
          <CalculatorIsland slug={def.slug} />
        </Suspense>
      </CalculatorShell>
    </>
  );
}
