import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const linkCalls = vi.hoisted(() => [] as Array<{ href: string; prefetch?: boolean }>);

vi.mock("next/link", () => ({
  default: ({ children, href, prefetch, ...props }: React.ComponentProps<"a"> & {
    href: string;
    prefetch?: boolean;
  }) => {
    linkCalls.push({ href, prefetch });
    return React.createElement("a", { href, ...props }, children);
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/loans",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/navbars/use-scrolled", () => ({ useScrolled: () => false }));
vi.mock("@/components/navbars/mobile-nav", () => ({ MobileNav: () => null }));

import { SiteHeader } from "@/components/site-header";

describe("public site header navigation", () => {
  beforeEach(() => linkCalls.splice(0));

  it("does not let persistent header links create a speculative RSC burst", () => {
    renderToStaticMarkup(<SiteHeader />);

    expect(linkCalls.length).toBeGreaterThan(6);
    expect(linkCalls.every(({ prefetch }) => prefetch === false)).toBe(true);
  });
});
