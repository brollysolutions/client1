"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useLine } from "./line-provider";
import { NAV_ITEMS, type NavItem } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/dashboard" && pathname.startsWith(`${href}/`);
}

// Apply and Documents are loans-only sub-pages. Their chrome accent must read as
// loans (green) regardless of the persisted switcher line, so the accent is
// derived from the route here rather than by mutating the shared active line.
function isLoansRoute(pathname: string): boolean {
  return pathname.startsWith("/dashboard/apply") || pathname.startsWith("/dashboard/documents");
}

// Warm-gray slim rail. Icon-only on desktop (labels in tooltips); the mobile
// drawer passes showLabels so it reads as a full list. The active item is tinted
// with the current line accent, so only one line's colour ever appears.
export function AppSidebar({
  showLabels = false,
  onNavigate,
}: {
  showLabels?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { activeLine } = useLine();

  // The screen's line: forced to loans on loans-only routes, else the active line.
  const screenLine = isLoansRoute(pathname) ? "loans" : activeLine;
  const activeClass =
    screenLine === "loans"
      ? "bg-loans-soft text-loans-accent"
      : "bg-realestate-soft text-realestate-accent";

  // Apply/Documents are loans features; when the workspace is real estate the
  // rail collapses to Home so a loans item is never offered under the RE accent.
  const items = screenLine === "real_estate" ? NAV_ITEMS.filter((i) => i.key === "home") : NAV_ITEMS;

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        aria-label="Loans workspace"
        className={cn(
          "flex h-full w-full flex-col gap-1 border-r border-dash-border bg-dash-rail py-4",
          showLabels ? "px-3" : "px-2",
        )}
      >
        {items.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={isActive(pathname, item.href)}
            activeClass={activeClass}
            showLabels={showLabels}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

function SidebarLink({
  item,
  active,
  activeClass,
  showLabels,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  activeClass: string;
  showLabels: boolean;
  onNavigate?: () => void;
}) {
  const { icon: Icon, label, href } = item;

  const link = (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        showLabels ? "px-3 py-2.5" : "h-11 w-11 justify-center",
        active
          ? activeClass
          : "text-text-secondary hover:bg-dash-rail-hover hover:text-text-primary",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {showLabels && <span>{label}</span>}
    </Link>
  );

  if (showLabels) return link;

  // Icon-only rail: the label lives in a tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-geist">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
