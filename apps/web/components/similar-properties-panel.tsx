import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SimilarPropertyCard, type SimilarPropertyCardData } from "@/components/similar-property-card";

export type { SimilarPropertyCardData };

export function SimilarPropertiesPanel({
  items,
  cta,
}: {
  items: SimilarPropertyCardData[];
  cta?: { href: string; label: string };
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="similar-properties-heading" className="rounded-2xl border border-[var(--nav-border)] bg-card p-5 sm:p-6">
      <h2 id="similar-properties-heading" className="font-heading text-xl font-semibold text-foreground">
        Similar properties
      </h2>
      <p className="mt-1 text-sm text-text-secondary">Comparable listings you may also want to see.</p>

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <SimilarPropertyCard key={item.id} item={item} />
        ))}
      </ul>

      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--nav-primary)] px-4 text-sm font-medium text-[var(--nav-primary)] transition-colors hover:bg-[var(--nav-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
