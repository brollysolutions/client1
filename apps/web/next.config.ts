import type { NextConfig } from "next";

// Banner images live under a dedicated public/ storage prefix, served
// directly (never presigned/proxied) -- see services/storage.py::
// public_asset_url and the bucket policy's public/* allowlist. next/image
// only optimizes images from an explicitly allowed remote host; this is an
// SSRF/host-confusion guard on next/image's own fetch, NOT the access-
// control boundary itself (that's the storage bucket policy, which has no
// s3:ListBucket and only allows public/*). Dev always includes minio's
// host-published port; prod adds its real asset host from a build-time env
// var, since the storage endpoint isn't known until deploy (apps/web/
// Dockerfile ARGs NEXT_PUBLIC_ASSET_HOST into the browser bundle).
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
];
if (process.env.NEXT_PUBLIC_ASSET_HOST) {
  const assetUrl = new URL(process.env.NEXT_PUBLIC_ASSET_HOST);
  remotePatterns.push({
    protocol: assetUrl.protocol === "https:" ? "https" : "http",
    hostname: assetUrl.hostname,
    port: assetUrl.port || undefined,
    pathname: "/**",
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit .next/standalone (server.js + only the node_modules the server needs)
  // so the prod image ships that instead of the full dev+prod dependency tree.
  // Dev and `next start` behavior are unchanged.
  output: "standalone",
  // Compression is terminated at nginx (infra/nginx/default.conf gzips HTML,
  // RSC payloads, and JSON uniformly for web + api). Leaving Next's built-in
  // gzip on too would double-compress and waste CPU. If web is ever exposed
  // without nginx in front, flip this back to true.
  compress: false,
  // `radix-ui` is a barrel that re-exports ~30 primitives; a bare
  // `import { Dialog } from "radix-ui"` can pull sibling modules into a route's
  // chunk. optimizePackageImports rewrites these to direct submodule imports so
  // only the primitives a route uses are bundled (smaller client JS + faster
  // dev compile). lucide-react is already optimized by Next's defaults.
  experimental: {
    optimizePackageImports: ["radix-ui"],
  },
  images: { remotePatterns },
  async headers() {
    return [
      {
        // Illustration filenames are stable/path-referenced; a future art
        // change needs a new filename (or a shorter max-age if art starts
        // changing in place under the same path).
        source: "/illustrations/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Opposite of the illustration rule above: a fix to the push/click
        // handlers must take effect immediately, not get stuck behind a
        // long-lived cache for weeks.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
