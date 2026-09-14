"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { BRAND_ASSETS } from "@/lib/brand";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeft } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth/session-provider";
import { useBookmarks } from "@/features/real-estate/store";
import { RE_CATEGORIES } from "@/lib/real-estate";
import { cn } from "@/lib/utils";

import { AccountMenu } from "./account-menu";
import { EXPLORE_CATEGORIES } from "./explore-categories";
import { useLine } from "./line-provider";
import {
  getDashboardPathLine,
  getNavigationSections,
  type NavItem,
} from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/dashboard" && pathname.startsWith(`${href}/`);
}

// Role-aware workspace navigation. The Client may collapse it to an icon rail;
// operational roles are always labeled on desktop, and the mobile drawer always
// shows labels. The active item reads as a blue icon plus a left indicator bar.
export function AppSidebar({
  showLabels = false,
  expanded = false,
  onToggle,
  onNavigate,
  reserveCloseSpace = false,
}: {
  showLabels?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  reserveCloseSpace?: boolean;
}) {
  const pathname = usePathname();
  const { activeLine } = useLine();
  const { count: bookmarkCount } = useBookmarks();
  const { session } = useAuth();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const toggleRef = React.useRef<HTMLButtonElement>(null);
  const restoreToggleFocus = React.useRef(false);
  const toggleSidebar = () => {
    restoreToggleFocus.current = true;
    onToggle?.();
  };
  React.useEffect(() => {
    if (restoreToggleFocus.current) {
      toggleRef.current?.focus();
      restoreToggleFocus.current = false;
    }
  }, [expanded]);

  // Labeled = the mobile drawer, or the desktop rail when the user expands it.
  const labeled = showLabels || expanded;

  // A line-specific route wins over persisted Client state so direct URLs and
  // notification destinations never render the other line's navigation.
  const screenLine =
    getDashboardPathLine(pathname) ??
    (session?.role === "client" || session?.businessLine === "both"
      ? activeLine
      : (session?.businessLine ?? activeLine));
  const activeText = "bg-brand-cta-tint text-brand-heading focus-visible:ring-ring";

  const sections = session
    ? getNavigationSections({
        role: session.role,
        businessLine: session.businessLine,
        activeLine: screenLine,
        staffFeatures: session.staffFeatures,
      })
    : [];

  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    // Direct links can select an item below the fold in the longer staff menus.
    // Move only the menu, so revealing it never scrolls the workspace itself.
    const revealActive = () => {
      const selected = scroller.querySelectorAll<HTMLElement>('[aria-current="page"]');
      const active = selected.item(selected.length - 1);
      if (!active) return;
      const bounds = scroller.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      // Leave room for the focus ring and round outward: fractional logo
      // heights can otherwise leave the last quarter-pixel of a link clipped.
      if (item.top < bounds.top + 4) scroller.scrollTop += Math.floor(item.top - bounds.top - 4);
      else if (item.bottom > bounds.bottom - 4) scroller.scrollTop += Math.ceil(item.bottom - bounds.bottom + 4);
    };
    revealActive();
    // Account data and viewport changes can resize the menu after it mounts.
    const observer = new ResizeObserver(revealActive);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [pathname, labeled, screenLine, session?.role]);

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        aria-label="Workspace"
        className={cn(
          "flex h-full min-h-0 w-full flex-col gap-1.5 overflow-hidden border-r border-white/15 bg-dash-rail pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-dash-foreground",
          labeled ? "px-3" : "px-1",
        )}
      >
        <div className={cn("relative mb-3 flex h-14 shrink-0 items-start border-b border-white/15", reserveCloseSpace && "pr-11")} data-sidebar-brand>
          <Link href="/dashboard" prefetch={false} onClick={onNavigate} aria-label="Dhanadhara dashboard" className="relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-sky">
            <Image src={BRAND_ASSETS.horizontal.src} width={960} height={176} alt="" loading="eager" sizes="192px" className={cn("absolute h-auto w-48 max-w-full object-contain brightness-0 invert transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none", labeled ? "scale-100 opacity-100" : "scale-95 opacity-0")} />
            <Image src="/brand/icon-192.png" width={192} height={192} alt="" unoptimized loading="eager" className={cn("absolute h-10 w-10 rounded-lg object-contain transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none", labeled ? "scale-95 opacity-0" : "scale-100 opacity-100")} />
          </Link>
          {onToggle && <button ref={toggleRef} type="button" onClick={toggleSidebar} aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={expanded} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-dash-foreground hover:bg-dash-rail-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-sky"><PanelLeft className="h-5 w-5" aria-hidden="true" /></button>}
        </div>

        <div
          ref={scrollRef}
          data-sidebar-scroll
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain py-1"
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.key}
              className={cn(sectionIndex > 0 && "mt-3 border-t border-white/15 pt-3")}
            >
              {labeled && section.label ? (
                <p className="mb-2 px-3 text-xs font-medium text-dash-muted">
                  {section.label}
                </p>
              ) : null}

              <div className="flex flex-col gap-1.5">
                {section.items.map((item) => {
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
                        screenLine={screenLine}
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
                      badge={
                        item.key === "bookmarks" && bookmarkCount > 0
                          ? bookmarkCount
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <AccountMenu labeled={labeled} onNavigate={onNavigate} />
      </nav>
    </TooltipProvider>
  );
}

function SidebarLink({
  item,
  active,
  activeText,
  labeled,
  onNavigate,
  badge,
}: {
  item: NavItem;
  active: boolean;
  activeText: string;
  labeled: boolean;
  onNavigate?: () => void;
  /** Small count badge, e.g. the bookmark count. */
  badge?: number;
}) {
  const { icon: Icon, label, href } = item;

  const link = (
    <Link
      href={href}
      aria-label={badge ? `${label} (${badge})` : label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "pressable group/link relative flex items-center gap-3 rounded-lg text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky focus-visible:ring-inset motion-reduce:transition-none motion-reduce:active:scale-100",
        labeled ? "min-h-11 px-3 py-2.5" : "mx-auto h-12 w-12 justify-center",
        // Hover keeps the semantic icon stable and adds a subtle tint plus the
        // left indicator. Active stays blue with a solid bar.
        active ? activeText : "text-dash-foreground hover:bg-dash-rail-hover hover:text-brand-sky",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-sky transition-opacity duration-150 motion-reduce:transition-none",
          labeled ? "left-0" : "-left-1",
          active ? "opacity-100" : "opacity-0 group-hover/link:opacity-100",
        )}
      />
      <span className="relative grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
        <Icon className="h-5 w-5" />
        {badge && !labeled ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-cta text-[9px] font-semibold text-white"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      {labeled && (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="break-words">{label}</span>
          {badge ? (
            <span className="rounded-full bg-brand-cta-tint px-1.5 py-0.5 text-xs font-semibold text-brand-link">
              {badge}
            </span>
          ) : null}
        </span>
      )}
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
  screenLine,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  activeText: string;
  pathname: string;
  screenLine: "loans" | "real_estate";
  onNavigate?: () => void;
}) {
  const { icon: Icon, label, href } = item;
  // Category catalog switches with the screen's line: loans/cards/insurance on
  // loans, the property types on real estate.
  const categories =
    screenLine === "real_estate"
      ? RE_CATEGORIES.map((c) => ({ slug: c.key, label: c.label, icon: c.icon }))
      : EXPLORE_CATEGORIES;

  return (
    <div className="group/explore">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "pressable relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky focus-visible:ring-inset motion-reduce:transition-none motion-reduce:active:scale-100",
          active ? activeText : "text-dash-foreground hover:bg-dash-rail-hover hover:text-brand-sky",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-brand-sky transition-opacity duration-150 motion-reduce:transition-none",
            active ? "opacity-100" : "opacity-0 group-hover/explore:opacity-100",
          )}
        />
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-hover/explore:rotate-180 group-focus-within/explore:rotate-180 motion-reduce:transition-none motion-reduce:group-hover/explore:rotate-0",
            active && "rotate-180",
          )}
        />
      </Link>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          active ? "grid-rows-[1fr]" : "grid-rows-[0fr] group-hover/explore:grid-rows-[1fr] group-focus-within/explore:grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-[1.375rem] mt-1 flex flex-col gap-1 border-l border-white/15 pl-3">
            {categories.map(({ slug, label: subLabel, icon: SubIcon }) => {
              // Prefix match so a loans category stays highlighted while the
              // user is on one of its product pages
              // (/dashboard/explore/loans/personal-loan).
              const categoryHref = `/dashboard/explore/${slug}`;
              const subActive =
                pathname === categoryHref || pathname.startsWith(`${categoryHref}/`);
              return (
                <Link
                  key={slug}
                  href={`/dashboard/explore/${slug}`}
                  aria-current={subActive ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky focus-visible:ring-inset motion-reduce:transition-none",
                    subActive ? activeText : "text-dash-foreground hover:bg-dash-rail-hover hover:text-brand-sky",
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
