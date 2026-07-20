"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, PanelLeft } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { AccountMenu } from "./account-menu";
import { EXPLORE_CATEGORIES } from "./explore-categories";
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
// expands to a labeled list when the user opens it from the toggle, and the
// mobile drawer always shows labels. The active item reads as a blue icon plus a
// left indicator bar (blue-only accent, ADR-0007). A mini account block is pinned
// at the bottom.
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
          "flex h-full w-full flex-col gap-1.5 overflow-hidden border-r border-dash-border bg-dash-rail py-4",
          labeled ? "px-3" : "px-2",
        )}
      >
        {onToggle ? (
          <RailToggle expanded={expanded} onToggle={onToggle} />
        ) : (
          // Mobile drawer: no toggle, just top spacing so items don't butt the edge.
          <div className="mb-2 mt-2" aria-hidden="true" />
        )}

        {items.map((item) => {
          const active = isActive(pathname, item.href);
          // Explore expands to an inline accordion of product categories in the
          // labeled rail (hover to open; stays open on an Explore route). The
          // collapsed rail keeps it a plain icon link.
          if (labeled && item.key === "explore") {
            return (
              <SidebarExplore
                key={item.key}
                item={item}
                active={active}
                activeText={activeText}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            );
          }
          return (
            <SidebarLink
              key={item.key}
              item={item}
              active={active}
              activeText={activeText}
              labeled={labeled}
              onNavigate={onNavigate}
            />
          );
        })}

        <AccountMenu labeled={labeled} onNavigate={onNavigate} />
      </nav>
    </TooltipProvider>
  );
}

// Desktop collapse/expand control. Collapsed, it's a centered toggle button in the
// icon slot; expanded, the toggle sits at the top with the label list below.
function RailToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  if (expanded) {
    return (
      <div className="mb-2 mt-1 flex items-center px-1">
        {/* Left slot reserved for the logo (lands later). */}
        <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          aria-expanded={true}
          className="ml-auto grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
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
      className="mx-auto mb-2 mt-1 grid h-12 w-12 cursor-pointer place-items-center rounded-xl text-text-secondary transition-colors hover:text-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
    >
      <PanelLeft className="h-5 w-5" aria-hidden="true" />
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
        "group/link relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        labeled ? "px-3 py-2.5" : "h-12 w-12 justify-center",
        // Hover: light-blue text/icon + left bar (below); the leading icon morphs
        // into a chevron. No background fill. Active stays blue with a solid bar.
        active ? activeText : "text-text-secondary hover:text-sky-500",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-cta transition-opacity",
          labeled ? "left-0" : "-left-1",
          active ? "opacity-100" : "opacity-0 group-hover/link:opacity-100",
        )}
      />
      <span className="relative grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
        <Icon
          className={cn(
            "h-5 w-5 transition-opacity",
            active ? "opacity-100" : "group-hover/link:opacity-0",
          )}
        />
        {!active && (
          <ChevronRight className="absolute h-5 w-5 opacity-0 transition-opacity group-hover/link:opacity-100" />
        )}
      </span>
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

// Explore + its inline accordion of product categories. On hover the submenu
// grows in (grid-rows 0fr -> 1fr) and pushes the items below it down; it also
// stays open whenever the user is on an Explore route. Labeled rail only.
function SidebarExplore({
  item,
  active,
  activeText,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  activeText: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { icon: Icon, label, href } = item;

  return (
    <div className="group/explore">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
          active ? activeText : "text-text-secondary hover:text-sky-500",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-cta transition-opacity",
            active ? "opacity-100" : "opacity-0 group-hover/explore:opacity-100",
          )}
        />
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-hover/explore:rotate-180",
            active && "rotate-180",
          )}
        />
      </Link>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          active ? "grid-rows-[1fr]" : "grid-rows-[0fr] group-hover/explore:grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-[1.375rem] mt-1 flex flex-col gap-1 border-l border-dash-border pl-3">
            {EXPLORE_CATEGORIES.map(({ slug, label: subLabel, icon: SubIcon }) => {
              const subActive = pathname === `/dashboard/explore/${slug}`;
              return (
                <Link
                  key={slug}
                  href={`/dashboard/explore/${slug}`}
                  aria-current={subActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                    subActive ? activeText : "text-text-secondary hover:text-sky-500",
                  )}
                >
                  <SubIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{subLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
