import Link from "next/link";
import { ChevronDown, Clock, Heart, Mail, MapPin, Phone } from "lucide-react";

import { FOOTER_COLUMNS } from "@/components/footer-links";
import { SITE_CONTACT, SITE_NAME, TRUST_LINE } from "@/lib/site";

// Site-wide footer for the public marketing pages (app/(public)/layout.tsx).
// Server Component: the only "interactivity" is native <details>/<summary> for
// the mobile column disclosures (below lg), which needs no client JS, same
// pattern as FaqSection. The home-page line illustrations and the Earn with
// Us hero are Storyset (Freepik) vectors recolored to our palette, so the
// free tier owes the attribution link in the bottom bar below; keep it until
// they are replaced or a Freepik Premium license is bought.
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-black bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {/* Link columns */}
        <nav aria-label="Footer">
          {/* Below lg: collapsible columns, native <details>, no JS */}
          <div className="lg:hidden">
            {FOOTER_COLUMNS.map((column, index) => (
              <details
                key={column.heading}
                className={
                  index === 0
                    ? "faq-details group"
                    : "faq-details group border-t border-[var(--nav-border)]/60"
                }
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-heading font-semibold text-[var(--nav-text)] marker:content-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)]">
                  {column.heading}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-brand-blue transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <ul className="pb-4">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="block py-1.5 text-sm text-text-secondary hover:text-[var(--nav-primary)]"
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
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.heading}>
                <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-[var(--nav-text)]">
                  {column.heading}
                </h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-text-secondary hover:text-[var(--nav-primary)]"
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
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--nav-border)]/60 pt-8 text-sm text-[var(--nav-text)]">
          <a
            href={SITE_CONTACT.phoneHref}
            className="inline-flex items-center gap-2 hover:text-[var(--nav-primary)]"
          >
            <Phone className="h-4 w-4 text-[var(--nav-primary)]" aria-hidden />
            {SITE_CONTACT.phone}
          </a>
          <a
            href={SITE_CONTACT.emailHref}
            className="inline-flex items-center gap-2 hover:text-[var(--nav-primary)]"
          >
            <Mail className="h-4 w-4 text-[var(--nav-primary)]" aria-hidden />
            {SITE_CONTACT.email}
          </a>
          <span className="inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--nav-primary)]" aria-hidden />
            {SITE_CONTACT.hours.join(", ")}
          </span>
          <span className="inline-flex items-center gap-2">
            <MapPin
              className="h-4 w-4 text-[var(--nav-primary)]"
              aria-hidden
            />
            {SITE_CONTACT.address.join(", ")}
          </span>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-text-secondary">
          {TRUST_LINE.lead} {TRUST_LINE.rest}
        </p>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[var(--nav-border)] pt-6 text-xs text-text-secondary sm:flex-row">
          <p>
            &copy; {year} {SITE_NAME}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-[var(--nav-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--nav-primary)]">
              Terms
            </Link>
            <a href="/sitemap.xml" className="hover:text-[var(--nav-primary)]">
              Sitemap
            </a>
            <a
              href="https://storyset.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--nav-text)]"
            >
              Illustrations by Storyset
              <Heart className="h-3 w-3 fill-current" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
