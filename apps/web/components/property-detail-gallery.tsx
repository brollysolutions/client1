"use client";

import * as React from "react";
import Image from "next/image";
import { Building2, ImageIcon } from "lucide-react";

import type { PropertyMediaItem } from "@/lib/properties";
import { cn } from "@/lib/utils";

export function PropertyDetailGallery({
  title,
  image,
  media,
}: {
  title: string;
  image?: string;
  media?: PropertyMediaItem[];
}) {
  const images = React.useMemo(() => {
    const urls = media?.filter((item) => item.kind === "image").map((item) => item.url) ?? [];
    if (image && !urls.includes(image)) urls.unshift(image);
    return [...new Set(urls)];
  }, [image, media]);
  const [selected, setSelected] = React.useState(0);
  const activeImage = images[Math.min(selected, Math.max(images.length - 1, 0))];

  return (
    <section aria-label={`${title} photos`} className="space-y-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[var(--nav-tint)] sm:aspect-[2/1] lg:rounded-3xl">
        {activeImage ? (
          <Image
            src={activeImage}
            alt={`${title}, photo ${selected + 1}`}
            fill
            priority
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[var(--nav-primary)]">
            <div className="text-center">
              <Building2 className="mx-auto h-14 w-14" aria-hidden />
              <p className="mt-3 text-sm font-medium">Photos coming soon</p>
            </div>
          </div>
        )}
        {images.length > 0 ? (
          <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            {selected + 1} / {images.length}
          </span>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose a property photo">
          {images.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`Show photo ${index + 1} of ${images.length}`}
              aria-pressed={selected === index}
              className={cn(
                "relative h-16 w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] sm:h-20 sm:w-28",
                selected === index
                  ? "border-[var(--nav-primary)]"
                  : "border-transparent hover:border-[var(--nav-border)]",
              )}
            >
              <Image
                src={url}
                alt=""
                aria-hidden
                fill
                sizes="112px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
