import { Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";

// Contact detail rows for the /contact page. Server Component, blue-only,
// small line icons (not illustrations). Flat rows on the cream section, no
// card chrome, matching the form column beside it. No external map embed
// (CSP + blue-only), a styled address block instead.
//
// TODO(contact): the phone, email, and address in ROWS below are PLACEHOLDERS
// (98765 43210 / example.com / "Sample Towers"). They render live tel:/mailto:
// links, so replace them with the client's real details before this ships to
// production, otherwise visitors will call/email a number and address that are
// not the business's.
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
    lines: ["+91 98765 43210"],
    href: "tel:+919876543210",
  },
  {
    icon: Mail,
    label: "Email us",
    lines: ["hello@example.com"],
    href: "mailto:hello@example.com",
  },
  {
    icon: Clock,
    label: "Office hours",
    lines: ["Monday to Saturday", "10:00 AM to 7:00 PM"],
  },
  {
    icon: MapPin,
    label: "Visit us",
    lines: ["1st Floor, Sample Towers", "Banjara Hills, Hyderabad 500034"],
  },
];

export function ContactInfo() {
  return (
    <div className="grid gap-7">
      {ROWS.map((row) => {
        const Icon = row.icon;
        const body = (
          <>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-[var(--nav-primary)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
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
