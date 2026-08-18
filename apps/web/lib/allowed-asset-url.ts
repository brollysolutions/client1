// Shared by server-rendered public content and authenticated Client Components.
// Keep this module environment-neutral: importing a server fetch helper here
// would make every dashboard consumer fail at runtime.
export function isAllowedAssetUrl(raw: string): boolean {
  // Bundled, reviewed banner-template artwork is served by Next from public/.
  // Keep this path allowlist deliberately narrow: a generic leading slash
  // would also admit protocol-relative and backslash-normalized URLs.
  if (
    raw.startsWith("/banner-templates/") &&
    !raw.startsWith("//") &&
    !raw.includes("\\") &&
    !raw.split("/").includes("..")
  ) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const configuredHost = process.env.NEXT_PUBLIC_ASSET_HOST;
  if (configuredHost) {
    try {
      if (url.origin === new URL(configuredHost).origin) return true;
    } catch {
      // Malformed env value -- fall through to the development origin.
    }
  }
  return url.origin === "http://localhost:9000";
}
