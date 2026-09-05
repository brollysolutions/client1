"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";

/* Auth CTAs route into the (auth) route group: /login, /register, /forgot-password. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--nav-text)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary)] lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col gap-6 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16 sm:max-w-xs"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <nav aria-label="Primary mobile" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return item.menu ? (
              // Native <details>/<summary>, not the (unused) shadcn Accordion:
              // matches the house pattern in faq-section.tsx (no client JS,
              // Enter/Space-native, .faq-details in globals.css supplies the
              // height transition + its own reduced-motion opt-out).
              // Collapsed by default (`open={isActive}` only) keeps the
              // drawer at 6 top-level rows until this item is expanded.
              <details key={item.href} className="faq-details group py-1" open={isActive}>
                <summary
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-base font-geist font-medium text-text-primary marker:content-none hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    isActive && "text-[var(--nav-primary)]",
                  )}
                >
                  {item.label}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <div className="pb-2">
                  {/* Desktop groups Insurance + Credit Cards into one shared
                      column (see financial-services-menu.ts); the drawer
                      flattens columns back into a flat list of separately
                      headed sections instead, since a drawer has no use for
                      that column grouping. */}
                  {item.menu.columns.flatMap((column) => column.groups).map((group) => (
                    <div key={group.key} className="pt-1">
                      <p
                        id={`m-nav-${group.key}`}
                        className="px-3 pb-1 pt-2 text-xs font-geist font-semibold uppercase tracking-wide text-text-secondary"
                      >
                        {group.heading}
                      </p>
                      <ul aria-labelledby={`m-nav-${group.key}`}>
                        {group.items.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={close}
                              className="group/item flex items-center gap-3 rounded-md py-2 pl-6 pr-3 text-base font-geist font-medium text-text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            >
                              <child.icon
                                className="h-4 w-4 shrink-0 text-[var(--nav-text)] transition-colors group-hover/item:text-[var(--nav-primary)]"
                                aria-hidden
                              />
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <Link
                    href={item.menu.overview.href}
                    onClick={close}
                    className="mt-1 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-geist font-medium text-[var(--nav-primary)] hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    {item.menu.overview.label}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </details>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-base font-geist font-medium text-text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  isActive && "bg-[var(--nav-tint)] text-[var(--nav-primary)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <Button asChild variant="outline" size="lg" className="font-geist" onClick={close}>
            <Link href="/login">Login</Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="font-geist bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
            onClick={close}
          >
            <Link href="/register">Register</Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="font-geist bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
            onClick={close}
          >
            <Link href="/contact" className="inline-flex items-center justify-center gap-2">
              <Phone className="h-4 w-4 text-white" aria-hidden />
              Contact
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
