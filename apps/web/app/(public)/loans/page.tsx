import type { Metadata } from "next";

import { HeroCarousel } from "@/components/hero-carousel";
import { FinancialServicesCatalogue } from "@/components/financial-services-catalogue";
import { ProductPage } from "@/components/product-page";
import { TrustStrip } from "@/components/trust-strip";
import { faqPageJsonLd, LOAN_FAQ_ITEMS } from "@/lib/faq";
import { getCatalogueFacets, getPublicFinancialProducts } from "@/lib/financial-catalog";
import { parseCatalogueCategory } from "@/lib/financial-catalogue-url";
import { getHeroBanners } from "@/lib/public-banners";
import { LOAN_JOURNEY, LOAN_TRUST } from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// First server-side data fetch on this page. Matches /real-estate's ISR
// window: CMS-authored content is human-paced, not real-time, so a five
// minute regeneration keeps the page from needing a redeploy to show a new
// offer without adding meaningful load (at most ~12 requests/hour from the
// web container, regardless of visitor volume).
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Curated Loans, Credit Cards & Insurance",
  description:
    "Search Dhanadhara's Admin-curated financial services, compare verified provider snapshots, and apply or enquire through an internal guided journey.",
  keywords: [
    "personal loan",
    "business loan",
    "home loan",
    "loan against property",
    "car loan",
    "vehicle loan",
    "education loan",
    "school funding",
    "secured loans",
    "overdraft loan",
    "project funding",
    "credit cards",
    "life insurance",
    "health insurance",
    "property insurance",
    "travel insurance",
    "apply for loan",
  ],
  alternates: { canonical: "/loans" },
  openGraph: {
    title: "Curated Financial Services in One Place",
    description:
      "Explore published services and provider options, then apply or enquire without an external lender redirect.",
    type: "website",
  },
};

const loansJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Loans",
          item: `${SITE_URL}/loans`,
        },
      ],
    },
    faqPageJsonLd(LOAN_FAQ_ITEMS),
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

type LoansSearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoansPage({ searchParams }: { searchParams: LoansSearchParams }) {
  const params = await searchParams;
  const q = one(params.q)?.trim() || undefined;
  const category = parseCatalogueCategory(one(params.category));
  const requestedPage = Number(one(params.page) ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [banners, catalogue, facets] = await Promise.all([
    getHeroBanners("financial_services"),
    getPublicFinancialProducts({ q, category, page, pageSize: 12 }),
    // Counts for the filter pills. Narrowed by the text query but not by the
    // category the reader is currently standing in, so each pill shows what
    // picking it would actually return.
    getCatalogueFacets(q),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(loansJsonLd) }}
      />
      <ProductPage
        title="Loans, cards, and insurance that fit you"
        intro="From personal and business loans to property, vehicle, and education finance, we bring the options together and help you until the money reaches your account."
        heroDoodles
        beforeHero={
          banners.length > 0 ? (
            <HeroCarousel
              banners={banners}
              variant="section"
              label="Financial services campaigns"
            />
          ) : null
        }
        beforeJourney={
          <>
            <FinancialServicesCatalogue
              catalogue={catalogue}
              facets={facets}
              query={{ q, category, page }}
            />
            <TrustStrip points={LOAN_TRUST} />
          </>
        }
        journeyHeading="What happens when you apply?"
        journey={LOAN_JOURNEY}
        journeyTimeline
        faq={{
          heading: "Loan questions, answered",
          subheading: "What borrowers usually ask before applying.",
          items: LOAN_FAQ_ITEMS,
        }}
        ctaHeading="Ready to get started?"
        ctaText="Leave your number and our loans team will call you back to match you with the right lender."
        ctaLabel="Get a callback"
        ctaBanner
        businessLine="loans"
      />
    </>
  );
}
