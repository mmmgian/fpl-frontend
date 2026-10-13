import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Pages are rendered per request, which Next would otherwise re-fetch on every visit. Keeping a visited page for 30s
    // makes back/forward and hopping between tabs instant; live pages still poll (router.refresh ignores this cache), and
    // the language, theme and blotter switches reload the page, so a cached page is never in the wrong mode.
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "resources.premierleague.com", pathname: "/premierleague/badges/**" },
      { protocol: "https", hostname: "fantasy.premierleague.com", pathname: "/gcs/**" },
    ],
  },
  async redirects() {
    return [
      {
        // The past league tables now sit under The Times.
        source: "/history",
        destination: "/times#tables",
        permanent: true,
      },
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
        // The header logo's file name carries its size and never changes content: keep it for a year.
        source: "/brand/lobster-league-192.webp",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // Newspaper pages are published once; a re-publish is picked up within a day, and shown at once meanwhile.
        source: "/times/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/favicon.ico",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        source: "/psychedelic/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/brand/blotter-sun.webp",
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
          // Only directives that can't block this site's own scripts, styles or images: no framing, no plugins, no
          // foreign <base> or form targets. (A script-src policy would need nonces for Next's inline scripts.)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
