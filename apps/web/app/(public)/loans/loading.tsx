import { ProductPageSkeleton } from "@/components/product-page-skeleton";

// Mirrors the /loans page (components/product-page.tsx): two-column hero + a
// services card grid, so the streaming fallback matches the page shape rather
// than the generic group skeleton.
export default function LoansLoading() {
  return <ProductPageSkeleton />;
}
