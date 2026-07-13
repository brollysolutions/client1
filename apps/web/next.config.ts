import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
