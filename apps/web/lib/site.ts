// Canonical site origin, used for metadataBase, canonical URLs, the sitemap, and
// JSON-LD. Override with NEXT_PUBLIC_SITE_URL in the environment; the fallback
// keeps builds and previews working before the production domain is wired.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.example.com"
).replace(/\/$/, "");

export const SITE_NAME = "Loans & Real Estate";

// TODO(contact): PLACEHOLDER phone/email/address. Consumed by both /contact
// and the site footer. Replace with the client's real details before this
// ships to production, otherwise visitors will call/email a number and
// address that are not the business's.
export const SITE_CONTACT = {
  phone: "+91 98765 43210",
  phoneHref: "tel:+919876543210",
  email: "hello@example.com",
  emailHref: "mailto:hello@example.com",
  hours: ["Monday to Saturday", "10:00 AM to 7:00 PM"],
  address: ["1st Floor, Sample Towers", "Banjara Hills, Hyderabad 500034"],
};

// Single-sourced trust sentence, shown on the announcement bar and echoed as a
// permanent line in the footer (the banner is dismissible, so the footer keeps
// this message on the page even after a visitor dismisses the banner).
export const TRUST_LINE = {
  lead: "We connect you with the right banks.",
  rest: "We're the bridge between customers and lenders, not a bank ourselves.",
};
