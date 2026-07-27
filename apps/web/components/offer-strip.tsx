import { LeadDialog } from "@/components/lead-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { contactHref } from "@/lib/leads";
import { OFFER_STRIP_MAX, offersForLine, type OfferLine, type PublicOffer } from "@/lib/offers";

// Public offers strip, shared by /loans and /real-estate. Server Component,
// takes the FULL unfiltered offer list plus which line it's rendering for,
// and does its own filter + cap -- this keeps the filter-then-cap-then-
// maybe-vanish decision in one place so the two pages can't drift.
//
// Renders nothing (returns null) when there are no offers for this line.
// This differs from PropertyCatalogEmpty's always-render-something choice on
// purpose: the property catalog IS the reason /real-estate exists, so its
// empty state is substitute primary content with its own lead capture. This
// strip is supplementary promotional content on a page whose primary
// content, journey, FAQ, and closing CTA all render regardless of whether
// any offer is live. A "no offers right now" card would advertise absence on
// a financial marketing page, which is worse than silence, and offers have
// no Admin-approval gate, so zero active offers is a genuine day-one and
// steady-state condition, not a rare edge case worth a permanent empty band.
// Returning null also absorbs a failed fetch the same way, preserving the
// "empty and failed are not distinguished" invariant from lib/public-offers.ts.
//
// Because it can vanish, this component owns its entire <section> --
// border, background, and vertical padding. Do not wrap it in a padded
// wrapper div in the page, or a zero-offer page renders an empty cream band.
export function OfferStrip({
  offers,
  line,
  heading,
  subheading,
}: {
  offers: PublicOffer[];
  line: OfferLine;
  heading: string;
  subheading?: string;
}) {
  const visible = offersForLine(offers, line).slice(0, OFFER_STRIP_MAX);
  if (visible.length === 0) return null;

  return (
    <section
      id="offers"
      aria-labelledby="offers-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-center font-geist text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">
            Live offers
          </p>
          <h2
            id="offers-heading"
            className="mt-3 font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            {heading}
          </h2>
          {subheading ? (
            <p className="mt-4 text-lg text-text-secondary">{subheading}</p>
          ) : null}
        </div>

        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((offer) => (
            <li key={offer.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col pt-6">
                  {offer.discountLabel ? (
                    <span className="w-fit rounded-full bg-[var(--nav-tint)] px-3 py-1 font-geist text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">
                      {offer.discountLabel}
                    </span>
                  ) : null}
                  <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">
                    {offer.title}
                  </h3>
                  {offer.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                      {offer.description}
                    </p>
                  ) : null}
                  {offer.code ? (
                    <p className="mt-4 text-sm text-text-secondary">
                      Use code{" "}
                      <code className="rounded-md border border-dashed border-[var(--nav-border)] bg-[var(--nav-tint)]/40 px-2 py-0.5 font-geist font-semibold tracking-wider text-foreground">
                        {offer.code}
                      </code>
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex justify-center">
          <LeadDialog
            businessLine={line}
            triggerLabel="Ask about an offer"
            href={contactHref({ line })}
          />
        </div>
      </div>
    </section>
  );
}
