import { describe, expect, it } from "vitest";
import { financialServicesMenu, type PublicServiceLink } from "./financial-services-menu";
import { publicNavItems } from "./nav-items";

describe("Admin-controlled public navigation", () => {
  const products: PublicServiceLink[] = [
    { slug: "personal-loan", label: "Personal Loan", category: "loan" },
    { slug: "credit-cards", label: "Credit Cards", category: "credit_card" },
    { slug: "configured-product", label: "Configured Product", category: "loan" },
  ];

  it("uses the published catalogue for both desktop and mobile destinations", () => {
    const links = financialServicesMenu(products).flatMap((column) => column.groups).flatMap((group) => group.items);
    expect(links.map((item) => item.href)).toEqual(["/loans/personal-loan", "/loans/configured-product", "/loans/credit-card"]);
    expect(links.every((item) => item.icon)).toBe(true);
    const after = publicNavItems(products.slice(1)).find((item) => item.href === "/loans")!;
    expect(JSON.stringify(after)).not.toContain("/loans/personal-loan");
    expect(after.menu?.columns.flatMap((column) => column.groups).some((group) => group.key === "insurance")).toBe(false);
  });

  it("keeps a direct catalogue link when no products are published", () => {
    const nav = publicNavItems([]);
    expect(nav.find((item) => item.href === "/loans")).toEqual({ label: "Financial Services", href: "/loans", menu: undefined });
    expect(nav.findIndex((item) => item.href === "/calculators")).toBeLessThan(nav.findIndex((item) => item.href === "/earn-with-us"));
  });
});
