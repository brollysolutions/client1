import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND_ASSETS, SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type LogoVariant = "horizontal" | "stacked" | "symbol";

export function Logo({ className, variant = "horizontal", href = "/", onClick }: {
  className?: string;
  variant?: LogoVariant;
  href?: string | null;
  onClick?: () => void;
}) {
  const asset = BRAND_ASSETS[variant];
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2",
    variant === "symbol" ? "h-10 w-10" : variant === "stacked" ? "w-48" : "w-36 sm:w-44",
    className,
  );
  const artwork = <Image src={asset.src} width={asset.width} height={asset.height} alt={SITE_NAME} unoptimized className="h-auto w-full object-contain" />;
  return href === null ? <span className={classes}>{artwork}</span> : (
    <Link href={href} prefetch={false} aria-label={`${SITE_NAME} ${href === "/" ? "home" : "dashboard"}`} onClick={onClick} className={classes}>
      {artwork}
    </Link>
  );
}
