// The footer is a short route directory. Detailed products, property categories
// and calculators remain discoverable from their dedicated catalogue pages.
export type FooterLink = { label: string; href: string };
export type FooterColumn = { heading: string; links: FooterLink[] };

export const LEGAL_LINKS: FooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Cookies", href: "/cookies" },
  { label: "Sitemap", href: "/sitemap.xml" },
];

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Explore",
    links: [
      { label: "Financial services", href: "/loans" },
      { label: "Properties", href: "/real-estate" },
      { label: "Calculators", href: "/calculators" },
      { label: "Earn with Us", href: "/earn-with-us" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Get started", href: "/get-started" },
      { label: "Help Center", href: "/help-center" },
      { label: "Become a partner", href: "/apply-as-agent" },
      { label: "Contact", href: "/contact" },
    ],
  },
];
