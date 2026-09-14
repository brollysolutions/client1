"use client";

import * as React from "react";

import { useState } from "react";
import Image from "next/image";
import { Landmark } from "lucide-react";
import { isAllowedAssetUrl } from "@/lib/allowed-asset-url";
import { cn } from "@/lib/utils";

// Official white wordmarks need their intended dark backing. Never recolour
// a bank's artwork when the application theme changes.
const WHITE_WORDMARKS = new Set([
  "/provider-logos/axis.svg",
  "/provider-logos/icici.png",
  "/provider-logos/canara.webp",
]);

export function ProviderLogo({ url, className, sizes }: {
  url?: string | null;
  className?: string;
  sizes: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const visible = url && url !== failedUrl && isAllowedAssetUrl(url);
  return (
    <span aria-hidden="true" className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border", visible ? WHITE_WORDMARKS.has(url) ? "bg-[#182648]" : "bg-white" : "bg-transparent", className)}>
      {visible ? (
        <Image src={url} alt="" fill sizes={url === "/provider-logos/yes.png" ? "256px" : sizes} onError={() => setFailedUrl(url)} className={cn("object-contain p-1", url === "/provider-logos/yes.png" && "scale-[1.65] p-0")} />
      ) : <Landmark className="size-5 text-text-secondary" />}
    </span>
  );
}
