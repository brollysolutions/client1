import { DashboardHeader, DashboardPage, DashboardSection } from "@/features/dashboard/dashboard-ui";
import { ExploreArtCard } from "@/features/dashboard/explore-cards";
import { EXPLORE_CATEGORIES, shouldSkipCardsCategoryList } from "@/features/dashboard/explore-categories";
import { ExploreLineSwitch } from "@/features/dashboard/explore-line-switch";
import { getCatalogueFacets, getPublicFinancialProducts } from "@/lib/financial-catalog";

// Product discovery hub. Loans line shows the Loans/Insurance/Credit Cards
// tiles, each opening its category's Admin-published products
// (/dashboard/explore/[slug]). Real-estate line is a search-first hub: a
// catalog-wide omnibox on top, then category tiles with live counts, then a
// featured strip -- handled client-side in ExploreLineSwitch since the token
// is in-memory there. Auth/role are gated by the (app) layout.
//
// This page is a server component so it can read the anonymous public
// financial-products catalogue (lib/financial-catalog.ts imports the
// server-only fetch wrapper); the real-estate branch is handed off to a
// client component instead of being rendered here.
export default async function ExplorePage() {
  // The credit_card fetch below duplicates one of getCatalogueFacets' own
  // requests (same URL/options), so Next dedupes it within this render --
  // fetching it directly just recovers the product slug that facets discards
  // (it keeps only `.total`), letting the Cards tile skip its category list.
  const [facets, cardsCatalogue] = await Promise.all([
    getCatalogueFacets(),
    getPublicFinancialProducts({ category: "credit_card", pageSize: 1 }),
  ]);
  const soleCardProductSlug = shouldSkipCardsCategoryList("cards", cardsCatalogue.items.length)
    ? cardsCatalogue.items[0].slug
    : null;

  return (
    <ExploreLineSwitch
      loansHub={
        <DashboardPage>
          <DashboardHeader
            title="Explore"
            description="Discover loan, card, and insurance journeys available through your workspace."
          />

          <DashboardSection
            title="Financial products"
            description="Choose a category to see its available journey."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {EXPLORE_CATEGORIES.map((category) => {
                const count = facets[category.category];
                const href =
                  category.slug === "cards" && soleCardProductSlug
                    ? `/dashboard/explore/cards/${soleCardProductSlug}`
                    : `/dashboard/explore/${category.slug}`;
                return (
                  <ExploreArtCard
                    key={category.slug}
                    href={href}
                    title={category.label}
                    blurb={category.blurb}
                    illustration={category.illustration}
                    fallbackIcon={category.icon}
                    meta={`${count} option${count === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          </DashboardSection>
        </DashboardPage>
      }
    />
  );
}
