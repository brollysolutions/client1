import Link from "next/link";
import { ChevronDown, Clock, Mail, MapPin, Phone } from "lucide-react";

import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/components/footer-links";
import { Logo } from "@/components/logo";
import { SITE_CONTACT, SITE_NAME, TRUST_LINE } from "@/lib/site";
import { financialServiceHref } from "@/lib/products";
import type { PublicServiceLink } from "@/components/navbars/financial-services-menu";

// Site-wide footer for the public marketing pages (app/(public)/layout.tsx).
// Server Component: the only "interactivity" is native <details>/<summary> for
// the mobile column disclosures (below lg), which needs no client JS, same
// pattern as FaqSection. LICENSE RISK: home-page line illustrations and the
// Earn with Us hero are still Storyset (Freepik) free-tier vectors, which
// require attribution. The bottom-bar attribution link was removed on
// request; restore it, replace the SVGs, or buy Freepik Premium to stay
// compliant.
export function SiteFooter({ products = [] }: { products?: readonly PublicServiceLink[] }) {
  const year = new Date().getFullYear();
  const byHref = new Map(products.map((product) => [financialServiceHref(product.slug), product]));
  const columns = FOOTER_COLUMNS.map((column) => column.heading === "Loans" ? {
    ...column,
    links: column.links.flatMap((link) => {
      const product = byHref.get(financialServiceHref(link.href.split("#")[1]));
      return product ? [{ label: product.label, href: financialServiceHref(product.slug) }] : [];
    }),
  } : column).filter((column) => column.links.length > 0);

  return (
    <footer className="mt-10 w-full border-t border-white/15 bg-brand-navy text-dash-foreground sm:mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mb-8 grid items-start gap-6 border-b border-white/15 pb-8 sm:mb-10 sm:pb-10 lg:grid-cols-[1fr_1.25fr] lg:gap-20">
          <div>
            <Logo tone="white" className="w-52 hover:bg-transparent sm:w-60" sizes="(min-width: 640px) 240px, 208px" />
            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-brand-sky">Financial services &amp; real estate</p>
          </div>
          <p className="max-w-xl text-sm leading-7 text-dash-muted sm:text-base">
            <span className="block font-medium text-white">{TRUST_LINE.lead}</span>
            {TRUST_LINE.rest}
          </p>
        </div>
        {/* Link columns */}
        <nav aria-label="Footer">
          {/* Below lg: collapsible columns, native <details>, no JS */}
          <div className="lg:hidden">
            {columns.map((column, index) => (
              <details
                key={column.heading}
                className={
                  index === 0
                    ? "faq-details group"
                    : "faq-details group border-t border-white/15"
                }
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-heading font-semibold text-dash-foreground marker:content-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-sky">
                  {column.heading}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-brand-sky transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <ul className="pb-4">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="block py-2.5 text-sm text-dash-muted hover:text-brand-sky focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-sky"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          {/* lg+: flat grid, no disclosure chrome */}
          <div className="hidden lg:grid lg:grid-cols-4 lg:gap-8">
            {columns.map((column) => (
              <div key={column.heading}>
                <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-dash-foreground">
                  {column.heading}
                </h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-dash-muted hover:text-brand-sky focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-sky"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Contact + trust line */}
        <div className="mt-10 grid gap-6 border-t border-white/15 pt-8 text-sm text-dash-foreground sm:grid-cols-2 lg:grid-cols-4">
          <a
            href={SITE_CONTACT.phoneHref}
            className="inline-flex min-h-11 items-start gap-3 break-words hover:text-brand-sky focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-sky"
          >
            <Phone className="mt-1 h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            <span><span className="mb-1 block text-xs text-dash-muted">Call us</span>{SITE_CONTACT.phone}</span>
          </a>
          <a
            href={SITE_CONTACT.emailHref}
            className="inline-flex min-h-11 min-w-0 items-start gap-3 hover:text-brand-sky focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-sky"
          >
            <Mail className="mt-1 h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            <span className="min-w-0 break-words"><span className="mb-1 block text-xs text-dash-muted">Email us</span>{SITE_CONTACT.email}</span>
          </a>
          <span className="inline-flex items-start gap-3">
            <Clock className="mt-1 h-4 w-4 shrink-0 text-brand-sky" aria-hidden />
            <span><span className="mb-1 block text-xs text-dash-muted">Opening hours</span>{SITE_CONTACT.hours.join(", ")}</span>
          </span>
          <span className="inline-flex items-start gap-3">
            <MapPin
              className="mt-1 h-4 w-4 shrink-0 text-brand-sky"
              aria-hidden
            />
            <span><span className="mb-1 block text-xs text-dash-muted">Find us</span>{SITE_CONTACT.address.join(", ")}</span>
          </span>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-dash-muted sm:flex-row">
          <p>
            &copy; {year} {SITE_NAME}. All rights reserved.
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end"
          >
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm hover:text-brand-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
