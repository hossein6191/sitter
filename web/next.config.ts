import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// This folder is the whole site. The repository around it has a lockfile of its own, and without
// these two settings Next.js takes that outer folder for the workspace root.
const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: { root: here },
  outputFileTracingRoot: here,
  // Turbopack's on-disk cache chokes on the macOS "._" side files some drives write into .next;
  // the cache is a speed-up only, so dev runs without it (builds sweep first).
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      {
        // No page of this site may be shown inside another site's frame: a hidden frame over a
        // decoy could otherwise steer a connected visitor's clicks onto a signing button.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A click through to the explorer carries the origin only, never the whole URL.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
