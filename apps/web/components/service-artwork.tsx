import Image from "next/image";
import * as React from "react";

import { BRAND_ASSETS } from "@/lib/brand";
import { catalogueIllustration } from "@/lib/products";

export function ServiceArtwork({ slug, sizes = "(min-width:1280px) 300px, (min-width:1024px) 31vw, (min-width:640px) 47vw, 92vw" }: { slug: string; sizes?: string }) {
  const image = catalogueIllustration(slug);
  if (!image) return null;

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--nav-tint)]/60" aria-hidden="true">
      <Image src={image} alt="" fill sizes={sizes} className="object-cover" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/95 p-2 shadow-xs">
        <Image
          src={BRAND_ASSETS.horizontal.src}
          width={BRAND_ASSETS.horizontal.width}
          height={BRAND_ASSETS.horizontal.height}
          alt=""
          sizes="112px"
          className="h-auto w-28"
        />
      </div>
    </div>
  );
}
