import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
