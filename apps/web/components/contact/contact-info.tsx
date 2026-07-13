import { Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";

import { SITE_CONTACT } from "@/lib/site";

// Contact detail rows for the /contact page. Server Component, blue-only,
// small line icons (not illustrations). Flat rows on the cream section, no
// card chrome, matching the form column beside it. No external map embed
// (CSP + blue-only), a styled address block instead.
//
// Data lives in SITE_CONTACT (lib/site.ts) so the site footer can render the
// same phone/email/hours/address without duplicating the placeholder values.
type InfoRow = {
  icon: LucideIcon;
  label: string;
  lines: string[];
  href?: string;
};

const ROWS: InfoRow[] = [
  {
    icon: Phone,
    label: "Call us",
    lines: [SITE_CONTACT.phone],
    href: SITE_CONTACT.phoneHref,
  },
  {
    icon: Mail,
    label: "Email us",
    lines: [SITE_CONTACT.email],
    href: SITE_CONTACT.emailHref,
  },
  {
    icon: Clock,
    label: "Office hours",
    lines: SITE_CONTACT.hours,
  },
  {
    icon: MapPin,
    label: "Visit us",
    lines: SITE_CONTACT.address,
  },
];

export function ContactInfo() {
  return (
    <div className="grid gap-7">
      {ROWS.map((row) => {
        const Icon = row.icon;
        const body = (
          <>
            <Icon
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--nav-primary)]"
              aria-hidden
            />
            <div>
              <p className="font-heading text-sm font-semibold text-foreground">
                {row.label}
              </p>
              {row.lines.map((line) => (
                <p key={line} className="text-sm text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </>
        );

        return row.href ? (
          <a
            key={row.label}
            href={row.href}
            className="group flex w-fit items-start gap-4 rounded-lg transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--nav-primary)] [&_p:first-of-type]:transition-colors hover:[&_p:first-of-type]:text-[var(--nav-primary)]"
          >
            {body}
          </a>
        ) : (
          <div key={row.label} className="flex items-start gap-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
