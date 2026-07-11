"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

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
          className="text-[var(--nav-text)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary)] md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xs"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <nav aria-label="Primary mobile" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return item.children ? (
              <div key={item.href} className="py-1">
                <p className="px-3 py-2 text-xs font-geist font-semibold uppercase tracking-wide text-text-secondary">
                  {item.label}
                </p>
                {item.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={close}
                    className="group/item flex items-center gap-3 rounded-md px-3 py-2 text-base font-geist font-medium text-text-primary hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    <child.icon
                      className="h-4 w-4 shrink-0 text-[var(--nav-text)] transition-colors group-hover/item:text-[var(--nav-primary)]"
                      aria-hidden
                    />
                    {child.label}
                  </Link>
                ))}
              </div>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
