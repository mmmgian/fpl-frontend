// app/layout.tsx
import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "🦞 The Lobster League",
  description: "Fantasy Premier League custom site",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      {/* attach polka dots here */}
      <body className="polka-bg">
        {/* Site chrome lives above the background */}
        <div className="site-shell">
          <header
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              background: "transparent",
              backdropFilter: "saturate(180%) blur(6px)",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              padding: "12px 16px",
            }}
          >
            <nav
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Link href="/" className="btn">Home</Link>
              <Link href="/history" className="btn">History</Link>
              <Link href="/bonus" className="btn">Bonus</Link>
              {/* Add more buttons as needed */}
            </nav>
          </header>

          <main style={{ padding: 16 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
