import type { NextConfig } from "next";

const common = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Admin avatar uploads (2 MB cap, KTD8) must reach validation instead of failing in the framework.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      // KTD12: only the wall page may be framed by other sites.
      // /media/* is excluded: its route sets the KTD8 headers itself (one CSP, cross-origin loadable by the embed).
      {
        source: "/:path((?!w/|media/).*)",
        headers: [
          ...common,
          { key: "X-Frame-Options", value: "DENY" },
          // On /admin, /login and /setup, src/proxy.ts replaces this with a nonce policy that keeps frame-ancestors.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        source: "/w/:path*",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
