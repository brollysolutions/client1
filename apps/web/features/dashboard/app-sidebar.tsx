"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";

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
// loans regardless of the persisted switcher line, so the accent is derived from
// the route here rather than by mutating the shared active line.
function isLoansRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/apply") ||
    pathname.startsWith("/dashboard/documents") ||
    pathname.startsWith("/dashboard/loans")
  );
}

// Slim workspace rail. Icon-only when collapsed (names live in tooltips); it
// expands to a labeled list when the user opens it from the logo toggle, and the
// mobile drawer always shows labels. The active item reads as a blue icon plus a
// left indicator bar (blue-only accent, ADR-0007).
export function AppSidebar({
  showLabels = false,
  expanded = false,
  onToggle,
  onNavigate,
}: {
  showLabels?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { activeLine } = useLine();

  // Labeled = the mobile drawer, or the desktop rail when the user expands it.
  const labeled = showLabels || expanded;

  // The screen's line: forced to loans on loans-only routes, else the active line.
  const screenLine = isLoansRoute(pathname) ? "loans" : activeLine;
  const activeText = screenLine === "loans" ? "text-loans-accent" : "text-realestate-accent";

  // Apply/Documents are loans features; on the real-estate workspace they drop
  // out so a loans item is never offered under the RE accent. Home + the
  // identity-level items stay.
  const items = screenLine === "real_estate" ? NAV_ITEMS.filter((i) => !i.loansOnly) : NAV_ITEMS;

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        aria-label="Workspace"
        className={cn(
          "flex h-full w-full flex-col gap-1 overflow-hidden border-r border-dash-border bg-dash-rail py-4",
          labeled ? "px-3" : "px-2",
        )}
      >
        {onToggle ? (
          <RailToggle expanded={expanded} onToggle={onToggle} />
        ) : (
          // Mobile drawer: static logo, no toggle. Placeholder mark.
          <Link
            href="/dashboard"
            aria-label="Home"
            onClick={onNavigate}
            className="mb-4 mt-2 flex items-center rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            <LogoMark />
          </Link>
        )}

        {items.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            active={isActive(pathname, item.href)}
            activeText={activeText}
            labeled={labeled}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

// Placeholder brand mark. Real logo lands later.
function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-cta text-sm font-bold text-white"
    >
      L
    </span>
  );
}

// Desktop logo slot that doubles as the collapse/expand control. Collapsed, it
// shows the logo mark and swaps to a PanelLeft icon on hover; expanded, it shows
// the mark + wordmark with a PanelLeft toggle at the end.
function RailToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  if (expanded) {
    return (
      <div className="mb-4 mt-2 flex items-center px-1">
        <LogoMark />
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          className="ml-auto grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          <PanelLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Expand sidebar"
      aria-expanded={false}
      className="group/logo relative mx-auto mb-4 mt-2 grid h-12 w-12 cursor-pointer place-items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <span className="transition-opacity duration-200 group-hover/logo:opacity-0">
        <LogoMark />
      </span>
      <PanelLeft
        aria-hidden="true"
        className="absolute h-6 w-6 text-text-secondary opacity-0 transition-opacity duration-200 group-hover/logo:opacity-100"
      />
    </button>
  );
}

function SidebarLink({
  item,
  active,
  activeText,
  labeled,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  activeText: string;
  labeled: boolean;
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
        "relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        labeled ? "px-3 py-2.5" : "h-12 w-12 justify-center",
        // No hover fill: icons are gray by default and turn blue on hover. The
        // active item stays blue and gets a left indicator bar (below).
        active ? activeText : "text-text-secondary hover:text-brand-cta",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-cta",
            labeled ? "left-0" : "-left-1",
          )}
        />
      )}
      <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
      {labeled && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );

  if (labeled) return link;

  // Icon-only rail: the name lives in a tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="font-geist">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
