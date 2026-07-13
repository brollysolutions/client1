import { Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";

// Contact detail cards for the /contact page. Server Component, blue-only,
// small line icons (not illustrations). No external map embed (CSP + blue-only),
// a styled address block instead.
//
// TODO(contact): the phone, email, and address in CARDS below are PLACEHOLDERS
// (98765 43210 / example.com / "Sample Towers"). They render live tel:/mailto:
// links, so replace them with the client's real details before this ships to
// production, otherwise visitors will call/email a number and address that are
// not the business's.
type InfoCard = {
  icon: LucideIcon;
  label: string;
  lines: string[];
  href?: string;
};

const CARDS: InfoCard[] = [
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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const body = (
          <>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-[var(--nav-primary)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-heading text-sm font-semibold text-foreground">
                {card.label}
              </p>
              {card.lines.map((line) => (
                <p key={line} className="text-sm text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          </>
        );

        return card.href ? (
          <a
            key={card.label}
            href={card.href}
            className="flex items-start gap-4 rounded-2xl border border-[var(--nav-border)] bg-surface p-5 shadow-sm transition hover:border-[var(--nav-primary)]/40 hover:bg-[var(--nav-tint)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          >
            {body}
          </a>
        ) : (
          <div
            key={card.label}
            className="flex items-start gap-4 rounded-2xl border border-[var(--nav-border)] bg-surface p-5 shadow-sm"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
