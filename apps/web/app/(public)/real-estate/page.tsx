import type { Metadata } from "next";

import { OfferStrip } from "@/components/offer-strip";
import { PropertyCatalogEmpty } from "@/components/property-catalog-empty";
import { ProductPage, PropertyDoodles } from "@/components/product-page";
import { PropertyRow } from "@/components/property-row";
import { TrustStrip } from "@/components/trust-strip";
import { faqPageJsonLd, REAL_ESTATE_FAQ_ITEMS } from "@/lib/faq";
import { RE_TRUST, REAL_ESTATE_JOURNEY } from "@/lib/products";
import { getPublicOffers } from "@/lib/public-offers";
import { getPublicListings } from "@/lib/public-properties";
import { groupByCategory, PROPERTY_CATEGORIES } from "@/lib/properties";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// First server-side data fetch on the public site. Regenerated at most every
// 5 minutes (ISR): the properties table can ship empty on day one and the
// admin-approval workflow that populates it is human-paced, so this is not
// real-time data, but it should not need a redeploy to appear either.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Properties: Buy Verified Property in India",
  description:
    "Buy verified flats, plots, villas, and commercial spaces with trusted partners. See what you can buy and how we guide you from first visit to final paperwork.",
  keywords: [
    "buy property",
    "buy home",
    "buy flat",
    "buy plot",
    "real estate",
    "verified property",
    "property agents",
  ],
  alternates: { canonical: "/real-estate" },
  openGraph: {
    title: "Properties: Buy Verified Property in India",
    description:
      "Verified properties and trusted partners in one place, with one point of contact guiding you from first visit to final paperwork.",
    type: "website",
  },
};

const realEstateJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Properties",
          item: `${SITE_URL}/real-estate`,
        },
      ],
    },
    faqPageJsonLd(REAL_ESTATE_FAQ_ITEMS),
  ],
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
};

export default async function RealEstatePage() {
  // Parallel, not sequential: two independent 5s serverFetchJson timeouts
  // should not stack on a single page render.
  const [listings, offers] = await Promise.all([getPublicListings(), getPublicOffers()]);
  const grouped = groupByCategory(listings);
  // Only render category rows that actually have listings (empty-state guard,
  // so a category with nothing to show does not render an empty scroller).
  const populatedCategories = PROPERTY_CATEGORIES.filter(
    (category) => (grouped.get(category.key)?.length ?? 0) > 0,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(realEstateJsonLd) }}
      />
      <ProductPage
        title="Buy your property with confidence"
        intro="From flats and plots to offices and shops, we bring only verified listings and trusted partners together in one place. We stay with you at every step, from the first visit until you hold the keys."
        heroDoodles
        heroPlant="/illustrations/heroes/real-estate.svg"
        beforeJourney={
          <>
            <div className="relative w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)] py-20 sm:py-24 lg:py-28">
              <PropertyDoodles />
              <div className="relative z-10 space-y-16 sm:space-y-20">
                {populatedCategories.length > 0 ? (
                  populatedCategories.map((category) => (
                    <PropertyRow
                      key={category.key}
                      id={category.key}
                      heading={category.label}
                      types={category.blurb}
                      listings={grouped.get(category.key) ?? []}
                    />
                  ))
                ) : (
                  <PropertyCatalogEmpty />
                )}
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                  <TrustStrip eyebrow="Why people trust us" points={RE_TRUST} />
                </div>
              </div>
            </div>
            <OfferStrip
              offers={offers}
              line="real_estate"
              heading="Offers running right now"
              subheading="Live discounts on the properties and services we help you buy."
            />
          </>
        }
        journeyHeading="What happens when you reach out"
        journey={REAL_ESTATE_JOURNEY}
        journeyTimeline
        faq={{
          heading: "Property questions, answered",
          subheading: "What buyers usually ask before their first visit.",
          items: REAL_ESTATE_FAQ_ITEMS,
        }}
        ctaHeading="Ready to find your place?"
        ctaText="Leave your number and our real estate team will call you back about buying a property."
        ctaLabel="Get a callback"
        ctaBanner
        businessLine="real_estate"
      />
    </>
  );
}
