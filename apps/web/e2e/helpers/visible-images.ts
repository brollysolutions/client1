import { expect, type Page } from "@playwright/test";

/** Wait for artwork a person can currently see, without waiting for prefetches. */
export async function expectVisibleImagesLoaded(page: Page) {
  await expect.poll(() => page.evaluate(() => [...document.images].filter((image) => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0
      && box.left < innerWidth && box.right > 0
      && image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }).filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => ({ src: image.src, currentSrc: image.currentSrc, opacity: getComputedStyle(image).opacity }))), { timeout: 30_000 }).toEqual([]);
}
