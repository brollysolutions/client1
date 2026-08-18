"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Phone } from "lucide-react";

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
import { NAV_ITEMS } from "@/components/navbars/nav-items";
import { useScrolled } from "@/components/navbars/use-scrolled";
import { cn } from "@/lib/utils";

// A plain top-level link (Calculator, Application): matches the dropdown triggers'
// size/spacing and gains an animated underline on hover/focus. Passed through
// NavigationMenuLink's own cn()/twMerge so it cleanly overrides that component's
// dropdown-item base — including its hover:bg, which we neutralize so these bar
// links never render a background box.
// group/navlink (not bare `group`) so the underline reacts only to this link's
// own hover — NavigationMenuList also sets `group`, which would otherwise fire
// every link's underline when any sibling is hovered.
const linkClass =
  "group/navlink inline-flex h-9 flex-row items-center rounded-md px-3 text-base font-medium text-[var(--nav-text)] transition-colors hover:bg-transparent hover:text-[var(--nav-primary)] focus:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nav-bg)]";

export function SiteHeader() {
  const pathname = usePathname() ?? "";
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
        <div className="col-start-1 justify-self-start" />

        <NavigationMenu className="col-start-2 hidden min-w-0 justify-self-center lg:flex">
          <NavigationMenuList>
            {NAV_ITEMS.map((item) => {
              // Active when the URL is the item's page or any child route under
              // it (e.g. /calculators/emi keeps "Calculator" lit). Home matches
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
                    className={cn(
                      "group/nav-trigger text-base text-[var(--nav-text)]",
                      isActive && "text-[var(--nav-primary)]",
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
                  <NavigationMenuContent>
                    {/* Financial Services uses two tracks: Loans | (Insurance
                        + Credit Cards stacked). Properties has three equal
                        tracks for Residential | Plots | Commercial. */}
                    <div
                      className={cn(
                        item.menu.columns.length === 3
                          ? "w-[min(900px,calc(100vw-2rem))]"
                          : "w-[min(700px,calc(100vw-2rem))]",
                      )}
                    >
                      <div
                        className={cn(
                          "grid gap-x-6",
                          item.menu.columns.length === 3
                            ? "grid-cols-3"
                            : "grid-cols-[27rem_1fr]",
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
                                {/* grid-flow-col + grid-rows-6 makes an
                                    11-item list (Loans) read DOWN two
                                    sub-columns (1-6, then 7-11) instead of one
                                    11-row column, so the panel is ~230px tall
                                    instead of ~420px. DOM order stays 1->11,
                                    so tab/screen-reader order is unaffected.
                                    Shorter lists fall through to one column. */}
                                <ul
                                  aria-labelledby={`fs-${group.key}`}
                                  className={cn(
                                    "mt-1",
                                    group.items.length > 6 &&
                                      "grid grid-flow-col grid-rows-6 grid-cols-2 gap-x-2",
                                  )}
                                >
                                  {group.items.map((child) => (
                                    <li key={child.href}>
                                      <NavigationMenuLink
                                        asChild
                                        className="group/item flex-row items-center gap-2 px-2 py-2 transition-colors hover:bg-[var(--nav-tint)]/60"
                                      >
                                        <Link href={child.href}>
                                          <child.icon
                                            className="h-4 w-4 shrink-0 text-text-secondary transition-colors group-hover/item:text-[var(--nav-primary)]"
                                            aria-hidden
                                          />
                                          <span className="truncate text-sm font-medium text-[var(--nav-text)] transition-colors group-hover/item:text-[var(--nav-primary)]">
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
                          className="inline-flex w-auto flex-row items-center gap-1.5 px-2 py-2 text-sm font-medium text-[var(--nav-primary)] hover:bg-transparent hover:text-[var(--nav-primary-hover)]"
                        >
                          <Link href={item.menu.overview.href}>
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
                    className={cn(linkClass, isActive && "text-[var(--nav-primary)]")}
                  >
                    <Link href={item.href} aria-current={isActive ? "page" : undefined}>
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
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-geist text-base text-[var(--nav-text)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary)] focus-visible:ring-[var(--nav-primary)]"
            >
              <Link href="/login">Login</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-geist bg-[var(--nav-primary)] text-base text-white shadow-sm transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
            >
              <Link href="/register">Register</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-geist bg-[var(--nav-primary)] text-base text-white shadow-sm transition-colors hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
            >
              <Link href="/contact" className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4 text-white" aria-hidden />
                Contact
              </Link>
            </Button>
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
