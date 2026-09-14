import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { BRAND_ASSETS, SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type LogoVariant = "horizontal" | "stacked" | "symbol";
export type LogoTone = "original" | "navy" | "white";

export function Logo({ className, variant = "horizontal", tone = "original", href = "/", onClick, sizes }: {
  className?: string;
  variant?: LogoVariant;
  tone?: LogoTone;
  href?: string | null;
  onClick?: () => void;
  /** Match any width override supplied through className. */
  sizes?: string;
}) {
  const asset = BRAND_ASSETS[variant];
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    tone === "white"
      ? "transition-colors duration-150 hover:bg-dash-rail-hover focus-visible:ring-brand-sky focus-visible:ring-offset-brand-navy motion-reduce:transition-none"
      : "focus-visible:ring-ring focus-visible:ring-offset-surface",
    variant === "symbol" ? "h-10 w-10" : variant === "stacked" ? "w-48" : "w-36 sm:w-44",
    className,
  );
  const artwork = (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={SITE_NAME}
      sizes={sizes ?? (variant === "symbol" ? "40px" : variant === "stacked" ? "192px" : "(min-width: 640px) 176px, 144px")}
      className={cn(
        "h-auto w-full object-contain",
        tone === "white" && "brightness-0 invert",
        tone !== "white" && "dark:brightness-0 dark:invert",
        tone === "navy" && "[filter:brightness(0)_saturate(100%)_invert(20%)_sepia(31%)_saturate(2761%)_hue-rotate(211deg)_brightness(93%)_contrast(97%)] dark:[filter:brightness(0)_invert(1)]",
      )}
    />
  );
  return href === null ? <span className={classes}>{artwork}</span> : (
    <Link href={href} prefetch={false} aria-label={`${SITE_NAME} ${href === "/" ? "home" : "dashboard"}`} onClick={onClick} className={classes}>
      {artwork}
    </Link>
  );
}
