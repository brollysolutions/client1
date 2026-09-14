"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import type { components } from "@contracts/generated/schema";

import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { NAV_ITEMS, isDashboardPathAllowed } from "@/features/dashboard/nav-items";
import { CALCULATORS } from "@/lib/calculators/registry";
import { apiRequest } from "@/lib/api/client";
import type { UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Destination = { label: string; href: string };
type ProductList = components["schemas"]["PublicFinancialProductListResponse"];
const PUBLIC_DESTINATIONS: Destination[] = [
  { label: "Home", href: "/" },
  { label: "Financial services", href: "/loans" },
  { label: "Real Estate", href: "/real-estate" },
  { label: "Calculators", href: "/calculators" },
  { label: "Earn with us", href: "/earn-with-us" },
  { label: "Apply as an agent", href: "/apply-as-agent" },
  { label: "Get started", href: "/get-started" },
  { label: "Help Center", href: "/help-center" },
  { label: "Contact", href: "/contact" },
  { label: "Sign in", href: "/login" },
  { label: "Register", href: "/register" },
  { label: "Terms of service", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Cookie policy", href: "/cookies" },
];

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  dashboard?: boolean;
  businessLine?: "loans" | "real_estate" | "both";
  audienceRoles?: readonly UserRole[] | null;
};

export function destinationOptions({ dashboard, businessLine = "both", audienceRoles }: Pick<Props, "dashboard" | "businessLine" | "audienceRoles">): Destination[] {
  const publicOptions = [...PUBLIC_DESTINATIONS, ...CALCULATORS.map((calculator) => ({ label: calculator.navLabel, href: `/calculators/${calculator.slug}` }))];
  if (!dashboard) return publicOptions;
  const roles = audienceRoles?.length ? audienceRoles : ["client", "agent", "employee", "telecaller"] as const;
  const lines = businessLine === "both" ? ["loans", "real_estate"] as const : [businessLine];
  const routes = [...NAV_ITEMS, ...["get-started", "help-center", "support", "settings", "terms", "privacy", "cookies"].map((name) => ({ href: `/dashboard/${name}`, label: name.replaceAll("-", " ") }))];
  // A campaign can target several roles/lines. Suggest destinations all of
  // those recipients can open; manual safe paths remain supported by the API.
  return [...publicOptions, ...routes.filter(({ href }) => roles.every((role) => lines.every((activeLine) => isDashboardPathAllowed(href, { role, activeLine, businessLine, profileLines: [activeLine] }))))];
}

export function DestinationInput({ value, onValueChange, dashboard, businessLine, audienceRoles, ...props }: Props) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [products, setProducts] = React.useState<ProductList["items"]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    void (async () => {
      const items: ProductList["items"] = [];
      for (let page = 1; ; page += 1) {
        const result = await apiRequest<ProductList>(`/api/v1/public/financial-products?page=${page}&page_size=100`);
        if (cancelled) return;
        if (!result.ok) { setLoadError(true); break; }
        items.push(...result.data.items);
        if (!result.data.items.length || items.length >= result.data.total) break;
      }
      setProducts(items);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [open, loaded]);
  const query = value.toLowerCase();
  const options = [...destinationOptions({ dashboard, businessLine, audienceRoles }), ...products.map((product) => ({ label: product.label, href: `/loans/${product.slug}` }))]
    .filter((item, i, all) => all.findIndex((candidate) => candidate.href === item.href) === i)
    .filter((item) => value === "/" || item.href.toLowerCase().includes(query) || item.label.toLowerCase().includes(query.replace(/^\//, "")));
  const activeIndex = Math.min(index, Math.max(0, options.length - 1));
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  function choose(destination: Destination) {
    onValueChange(destination.href);
    setOpen(false);
    inputRef.current?.focus();
  }
  return (
    <Popover open={open && value.startsWith("/") && !props.disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input {...props} ref={inputRef} value={value} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open && value.startsWith("/") && !props.disabled} aria-controls={listId} aria-activedescendant={open && options.length ? `${listId}-${activeIndex}` : undefined}
          onFocus={(event) => { if (value.startsWith("/")) setOpen(true); props.onFocus?.(event); }}
          onChange={(event) => { onValueChange(event.target.value); setIndex(0); setOpen(event.target.value.startsWith("/")); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { if (open) { event.preventDefault(); event.stopPropagation(); } setOpen(false); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setIndex((current) => Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
            if (event.key === "Enter" && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); }
            if (event.key === "Tab") setOpen(false);
            props.onKeyDown?.(event);
          }} />
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-2rem)]" onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(event) => { if (event.target === inputRef.current) event.preventDefault(); }}>
        <p className="border-b border-border px-3 py-2 text-xs text-text-secondary">Destinations · use ↑ ↓ then Enter</p>
        <div ref={listRef} id={listId} role="listbox" aria-label="Button destinations" className="max-h-64 overflow-y-auto p-1">
          {options.map((option, i) => <div key={option.href} id={`${listId}-${i}`} data-index={i} role="option" aria-selected={i === activeIndex} onPointerMove={() => setIndex(i)} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2", i === activeIndex && "bg-accent text-accent-foreground")}>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium capitalize">{option.label}</p><p className="break-all text-xs text-text-secondary">{option.href}</p></div><ArrowUpRight className="size-4 shrink-0" aria-hidden />
          </div>)}
          {!options.length && <p className="p-3 text-sm text-text-secondary">No suggestions. You can enter a valid same-site path.</p>}
        </div>
        {loadError && <p role="status" className="border-t border-border p-3 text-xs text-text-secondary">Product suggestions could not load. Page destinations are still available.</p>}
      </PopoverContent>
    </Popover>
  );
}
