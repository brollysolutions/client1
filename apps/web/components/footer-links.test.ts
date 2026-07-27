import { describe, expect, it } from "vitest";

import { FOOTER_COLUMNS } from "@/components/footer-links";

// Regression test for the lookup-miss risk in footer-links.ts: FOOTER_COLUMNS
// is computed once at module load and rendered on every public page (via
// site-footer.tsx -> app/(public)/layout.tsx), so a silent id/slug drift (e.g.
// a lib/products.ts rename) must be caught here, not discovered as a missing
// link in production.
describe("FOOTER_COLUMNS integrity", () => {
  function column(heading: string) {
    const found = FOOTER_COLUMNS.find((c) => c.heading === heading);
    if (!found) throw new Error(`Missing footer column: ${heading}`);
    return found;
  }

  it("Loans column resolves all 5 core loan products", () => {
    expect(column("Loans").links.map((link) => link.label)).toEqual([
      "Personal Loan",
      "Business Loan",
      "Property Loan",
      "Vehicle Loan",
      "Education Loan",
    ]);
  });

  it("Real Estate column resolves all 5 property categories", () => {
    expect(column("Real Estate").links).toHaveLength(5);
  });

  it("Resources column resolves all 4 calculators plus the hub link", () => {
    const links = column("Resources").links;
    expect(links).toHaveLength(5);
    expect(links.at(-1)).toEqual({
      label: "All Calculators",
      href: "/calculators",
    });
  });

  it("no column silently dropped a link (every link has a label and href)", () => {
    for (const col of FOOTER_COLUMNS) {
      for (const link of col.links) {
        expect(link.href).toBeTruthy();
        expect(link.label).toBeTruthy();
      }
    }
  });
});
