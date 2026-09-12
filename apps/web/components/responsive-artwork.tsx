import { getImageProps, type ImageProps } from "next/image";
import React from "react";

// A local, transparent fallback lets the browser select the real source only
// at the layout's visible breakpoint. CSS display:none alone does not prevent
// an eager image or its preload from downloading on phones.
const EMPTY_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E";

type ResponsiveArtworkProps = Omit<
  ImageProps,
  "alt" | "priority" | "placeholder" | "blurDataURL"
> & { media: string };

/** Decorative artwork with native responsive selection, including without JS. */
export function ResponsiveArtwork({ media, ...options }: ResponsiveArtworkProps) {
  const { props } = getImageProps({ ...options, alt: "" });
  const { src, srcSet, sizes, ...image } = props;

  return (
    <picture>
      <source media={media} srcSet={srcSet || src} sizes={sizes} />
      {/* getImageProps retains Next's dimensions, loader and responsive URLs.
          A raw img avoids an unconditional preload of the desktop source. */}
      <img {...image} alt="" src={EMPTY_IMAGE} />
    </picture>
  );
}
