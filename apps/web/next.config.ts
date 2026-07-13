import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
