"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";
import * as React from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { MobileNav } from "@/components/navbars/mobile-nav";
import { publicNavItems } from "@/components/navbars/nav-items";
import type { PublicServiceLink } from "@/components/navbars/financial-services-menu";
import { useScrolled } from "@/components/navbars/use-scrolled";
import { cn } from "@/lib/utils";

// A plain top-level link (Home, Earn with Us, Become a Partner): matches the dropdown triggers'
// size/spacing and gains an animated underline on hover/focus. Passed through
// NavigationMenuLink's own cn()/twMerge so it cleanly overrides that component's
// dropdown-item base — including its hover:bg, which we neutralize so these bar
// links never render a background box.
// group/navlink (not bare `group`) so the underline reacts only to this link's
// own hover — NavigationMenuList also sets `group`, which would otherwise fire
// every link's underline when any sibling is hovered.
const linkClass =
  "pressable group/navlink inline-flex h-9 flex-row items-center rounded-md px-3 text-base font-medium text-[var(--nav-text)] transition-colors hover:bg-transparent hover:text-brand-link focus:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-bg)]";

export function SiteHeader({ products = [] }: { products?: readonly PublicServiceLink[] }) {
  const items = publicNavItems(products);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const scrolled = useScrolled(8);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-[var(--nav-border)] bg-[var(--nav-bg)] transition-shadow duration-300 motion-reduce:transition-none",
        scrolled && "shadow-sm"
      )}
    >
      {/* Full-bleed 3-column grid (equal 1fr flanks) keeps the nav dead-centered
          on the bar while the actions sit flush against the page's right edge
          (only the page gutter padding separates them from the corner). */}
      <div className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
        <Logo className="col-start-1 justify-self-start" />

        <NavigationMenu className="col-start-2 hidden min-w-0 justify-self-center xl:flex">
          <NavigationMenuList>
            {items.map((item) => {
              // Active when the URL is the item's page or any child route under
              // it (e.g. /calculators/emi keeps "Calculators" lit). Home matches
              // only "/". Every nav item is a real route (Application -> /apply-as-agent).
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return item.menu ? (
                <NavigationMenuItem key={item.href}>
                  {/* group/nav-trigger (not bare group): NavigationMenuList
                      above also sets `group`, so a bare group-hover: here
                      would fire this underline whenever ANY sibling nav item
                      is hovered — the exact bug the group/navlink comment
                      below already documents for the plain-link branch. */}
                  <NavigationMenuTrigger
                    aria-current={isActive ? "page" : undefined}
                    // A pointer click navigates to the item's page (the panel
                    // already opens on hover, so click-to-toggle adds nothing
                    // for mouse/touch users). preventDefault makes Radix skip
                    // its own toggle handler. Keyboard activation (Enter/
                    // Space, event.detail === 0) is left alone so keyboard
                    // users can still open the panel and reach its items.
                    onClick={(event) => {
                      if (event.detail > 0) {
                        event.preventDefault();
                        router.push(item.href);
                      }
                    }}
                    className={cn(
                      "group/nav-trigger text-base text-[var(--nav-text)]",
                      isActive && "text-brand-link",
                    )}
                  >
                    <span
                      className={cn(
                        "relative font-geist after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:rounded-full after:bg-[var(--nav-primary)] after:transition-transform after:duration-200 motion-reduce:after:transition-none",
                        isActive
                          ? "after:scale-x-100"
                          : "after:scale-x-0 group-hover/nav-trigger:after:scale-x-100 group-focus-visible/nav-trigger:after:scale-x-100",
                      )}
                    >
                      {item.label}
                    </span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-5">
                    {/* Financial Services uses a wider Loans track. Properties
                        and Calculators use three equal category tracks. */}
                    <div className="w-[min(1080px,calc(100vw-6rem))]">
                      <div
                        className={cn(
                          "grid gap-x-8",
                          item.menu.columns.length === 3
                            ? "grid-cols-3"
                            : item.menu.columns.length === 1 ? "grid-cols-1" : "grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
                        )}
                      >
                        {item.menu.columns.map((column, columnIndex) => (
                          <div key={columnIndex} className="min-w-0">
                            {column.groups.map((group, groupIndex) => (
                              <div
                                key={group.key}
                                className={cn(
                                  groupIndex > 0 &&
                                    "mt-3 border-t border-[var(--nav-border)] pt-3",
                                )}
                              >
                                <p
                                  id={`fs-${group.key}`}
                                  className="px-2 pb-1 font-geist text-xs font-semibold uppercase tracking-wide text-text-secondary"
                                >
                                  {group.heading}
                                </p>
                                {/* Read down two columns. Derive the row count
                                    so new Admin products cannot create a third
                                    implicit column outside the dropdown. */}
                                <ul
                                  aria-labelledby={`fs-${group.key}`}
                                  style={group.items.length > 8 ? { gridTemplateRows: `repeat(${Math.ceil(group.items.length / 2)}, minmax(0, 1fr))` } : undefined}
                                  className={cn(
                                    "mt-1",
                                    group.items.length > 8 &&
                                      "grid grid-flow-col grid-cols-2 gap-x-2",
                                  )}
                                >
                                  {group.items.map((child) => (
                                    <li key={child.href}>
                                      <NavigationMenuLink
                                        asChild
                                        className="group/item min-h-11 flex-row items-center gap-2.5 px-2 py-1.5 transition-colors hover:bg-[var(--nav-tint)]/60"
                                      >
                                        <Link href={child.href} prefetch={false}>
                                          <child.icon
                                            className="h-4 w-4 shrink-0 text-text-secondary transition-colors group-hover/item:text-brand-link"
                                            aria-hidden
                                          />
                                          <span className="min-w-0 break-words text-sm font-medium leading-snug text-[var(--nav-text)] transition-colors group-hover/item:text-brand-link">
                                            {child.label}
                                          </span>
                                        </Link>
                                      </NavigationMenuLink>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 border-t border-[var(--nav-border)] pt-1">
                        <NavigationMenuLink
                          asChild
                          className="inline-flex w-auto flex-row items-center gap-1.5 px-2 py-2 text-sm font-medium text-brand-link hover:bg-transparent hover:text-[var(--nav-primary-hover)]"
                        >
                          <Link href={item.menu.overview.href} prefetch={false}>
                            {item.menu.overview.label}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </NavigationMenuLink>
                      </div>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    asChild
                    className={cn(linkClass, isActive && "text-brand-link")}
                  >
                    <Link
                      href={item.href}
                      prefetch={false}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "relative font-geist after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:origin-left after:rounded-full after:bg-[var(--nav-primary)] after:transition-transform after:duration-200 group-hover/navlink:after:scale-x-100 group-focus-visible/navlink:after:scale-x-100 motion-reduce:after:transition-none",
                          isActive ? "after:scale-x-100" : "after:scale-x-0",
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          <div className="hidden items-center gap-2 xl:flex">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-geist text-base text-[var(--nav-text)] hover:bg-[var(--nav-tint)] hover:text-brand-link focus-visible:ring-ring"
            >
              <Link href="/login" prefetch={false}>Login</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-geist bg-[var(--nav-primary)] text-base text-white shadow-sm transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:ring-ring"
            >
              <Link href="/register" prefetch={false}>Register</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-geist bg-[var(--nav-primary)] text-base text-white shadow-sm transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:ring-ring"
            >
              <Link
                href="/contact"
                prefetch={false}
                className="inline-flex items-center gap-2"
              >
                <Phone className="h-4 w-4 text-white" aria-hidden />
                Contact
              </Link>
            </Button>
          </div>
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
