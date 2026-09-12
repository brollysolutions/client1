export const SITE_NAME = "Dhanadhara";

export const BRAND_ASSETS = {
  horizontal: { src: "/brand/logo-horizontal.png", width: 960, height: 176 },
  stacked: { src: "/brand/logo-stacked.png", width: 960, height: 850 },
  symbol: { src: "/brand/symbol.png", width: 783, height: 538 },
} as const;

export function brandedFilename(filename: string): string {
  return filename.startsWith("dhanadhara-") ? filename : `dhanadhara-${filename}`;
}

// Single-sourced trust sentence, shown on the announcement bar and echoed as a
// permanent line in the footer (the banner is dismissible, so the footer keeps
// this message on the page even after a visitor dismisses the banner).
export const TRUST_LINE = {
  lead: "We connect you with the right banks.",
  rest: "We're the bridge between customers and lenders, not a bank ourselves.",
};
