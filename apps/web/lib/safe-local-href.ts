// Shared defense for any stored/server-delivered href rendered by Next.js or
// used by the service worker. A leading slash alone is not sufficient because
// `//host` and `/\\host` are interpreted as cross-origin by browsers.
export function isSafeLocalHref(href: string): boolean {
  if (!/^\/(?![/\\])/.test(href)) return false;
  if (href.includes("\\") || /[\u0000-\u001f]/.test(href)) return false;
  if (/^\/%(?:2f|5c)/i.test(href)) return false;

  try {
    return new URL(href, "https://dhanadhara.invalid").origin === "https://dhanadhara.invalid";
  } catch {
    return false;
  }
}
