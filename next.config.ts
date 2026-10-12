import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "resources.premierleague.com", pathname: "/premierleague/badges/**" },
      { protocol: "https", hostname: "fantasy.premierleague.com", pathname: "/gcs/**" },
    ],
  },
  async redirects() {
    return [
      {
        // One address for the site: www.lobsterleague.fyi goes to lobsterleague.fyi, whatever the path and query.
        source: "/:path*",
        has: [{ type: "host", value: "www.lobsterleague.fyi" }],
        destination: "https://lobsterleague.fyi/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // The Times: its PDFs, page images and text are static files, which a meta robots tag can't cover.
        // This keeps well-behaved crawlers away from them. It makes the material unlisted, not private:
        // anyone with a link (or the /times page) can open it.
        source: "/times/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
      {
        // Drawn avatars never change under the same URL (the manifest adds a content hash), so keep them for a year.
        source: "/avatars/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/mascots/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
