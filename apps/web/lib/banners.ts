// Display type for the homepage hero carousel, plus the fallback content
// rendered when the CMS returns zero live banners. Hand-written, not derived
// from the generated contract: PublicBannerRead has no enum needing lockstep
// (every field is a plain string or null), and the display shape intentionally
// differs from the wire shape -- a nested `cta: {label, href}` here vs the
// flat `cta_label` + `deep_link` PublicBannerRead carries. The wire-shaped
// side stays contract-typed in lib/public-banners.ts, same division of labor
// as lib/properties.ts (display/pure) vs lib/public-properties.ts (fetch/map).
export type HeroBanner = {
  id: string;
  title: string;
  subtitle?: string;
  // Kept even though no banner can supply one yet (public-banner-serving.md's
  // Out of scope section): hero-carousel.tsx's cream-placeholder branch reads
  // this field, and images land in a future slice without a component change.
  image?: string;
  cta?: { label: string; href: string };
};

// Editorial fallback, not sample data. Rendered only when the CMS returns
// zero live banners -- an empty banners table or a failed fetch, which we
// deliberately do not distinguish (see lib/public-banners.ts). Every entry
// links to a real route and makes no product claim the site can't back.
// Delete only once production is guaranteed to always hold at least one live
// banner.
export const FALLBACK_HERO_BANNERS: HeroBanner[] = [
  {
    id: "loans",
    title: "Loans, cards, and insurance that fit you",
    subtitle: "All kinds of loans, credit cards, and insurance, matched to what you need.",
    cta: { label: "Explore loans", href: "/loans" },
  },
  {
    id: "real-estate",
    title: "Buy your property with confidence",
    subtitle: "Verified properties and trusted partners, all in one place.",
    cta: { label: "Explore properties", href: "/real-estate" },
  },
  {
    id: "why-us",
    title: "One bridge between you and the banks",
    subtitle:
      "We connect you with the right banks and partners, and stay with you at every step.",
    cta: { label: "Get in touch", href: "/contact" },
  },
  {
    id: "trust",
    title: "Safe and secure, always verified",
    subtitle: "OTP login and KYC-verified partners keep every deal safe.",
    cta: { label: "Learn more", href: "#security" },
  },
];
