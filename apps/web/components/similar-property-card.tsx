import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, MapPin } from "lucide-react";

export type SimilarPropertyCardData = {
  id: string;
  href: string;
  title: string;
  address: string;
  /** Short "why this" chip: "Same locality" / "Also in Pune" / etc. Absent
   * when nothing rose above the ranker's price-proximity fallback. */
  proximity?: string;
  price: string;
  /** Absent on the public surface: public list rows carry no area_sqft. The
   * stat row degrades to a single Price column rather than an empty cell. */
  area?: string;
  image?: string;
  type: string;
};

export function SimilarPropertyCard({ item }: { item: SimilarPropertyCardData }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-label={`${item.title}, ${item.address}, ${item.price}`}
        className="group flex gap-3 rounded-xl border border-[var(--nav-border)] bg-card p-3 transition-colors hover:border-[var(--nav-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2"
      >
        <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--nav-tint)]">
          {item.image ? (
            <Image src={item.image} alt="" aria-hidden fill sizes="80px" className="object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[var(--nav-primary)]">
              <Building2 className="h-6 w-6" aria-hidden />
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 font-medium leading-snug text-foreground transition-colors group-hover:text-[var(--nav-primary)]">
            {item.title}
          </span>
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.address}</span>
          </span>
          {item.proximity ? (
            <span className="w-fit rounded-full bg-[var(--nav-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--nav-primary)]">
              {item.proximity}
            </span>
          ) : null}

          <span className={item.area ? "mt-1 grid grid-cols-2 gap-2" : "mt-1 block"}>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-text-secondary">Price</span>
              <span className="block truncate font-heading text-sm font-semibold text-[var(--nav-primary)]">{item.price}</span>
            </span>
            {item.area ? (
              <span className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-text-secondary">Area</span>
                <span className="block truncate text-sm font-medium text-foreground">{item.area}</span>
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}
