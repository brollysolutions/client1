import { NuqsAdapter } from "nuqs/adapters/next/app";

// Scopes nuqs (URL-query state used by every calculator for shareable results
// and deep links) to the /calculators subtree. The adapter reads the request
// URL during SSR, so a shared link renders the right result on the first paint.
export default function CalculatorsLayout({ children }: { children: React.ReactNode }) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
