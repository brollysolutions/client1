import { ProductPageSkeleton } from "@/components/product-page-skeleton";

// Mirrors the /real-estate page (components/product-page.tsx): two-column hero
// + a services card grid, so the streaming fallback matches the page shape
// rather than the generic group skeleton.
export default function RealEstateLoading() {
  return <ProductPageSkeleton />;
}
