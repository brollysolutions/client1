import * as React from "react";
import { ExternalLink, Facebook, Instagram, Youtube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  LISTING_LINK_PLATFORM_LABELS,
  renderableListingLinks,
  type ListingLink,
  type ListingLinkPlatform,
} from "@/lib/listing-links";

const PLATFORM_ICONS: Record<ListingLinkPlatform, LucideIcon> = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
};

/**
 * Author-supplied links out to the property elsewhere.
 *
 * Every link is re-resolved against the host allowlist here, not trusted from
 * the stored `platform`: a row saved before the allowlist changed must not keep
 * rendering with a trusted badge. `rel="noopener noreferrer"` on all of them —
 * these are third-party destinations on a financial site, so neither the opener
 * handle nor the referrer should travel.
 */
export function ExternalListingLinks({
  links,
  className,
}: {
  links: ListingLink[] | null | undefined;
  className?: string;
}) {
  const safe = renderableListingLinks(links);
  if (safe.length === 0) return null;

  return (
    <section className={className} aria-labelledby="listing-links-heading">
      <h2 id="listing-links-heading" className="text-lg font-semibold text-slate-900">
        See this property elsewhere
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Links published by the lister. They open on an external site.
      </p>
      <ul className="mt-4 flex flex-wrap gap-3">
        {safe.map(({ url, platform }) => {
          const Icon = PLATFORM_ICONS[platform];
          const label = LISTING_LINK_PLATFORM_LABELS[platform];
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                <Icon aria-hidden className="size-4" />
                <span>
                  {label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </span>
                <ExternalLink aria-hidden className="size-3.5 text-slate-400" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
