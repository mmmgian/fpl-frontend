import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CrestFallback, SiteHeader, SkipLink } from "@/components/ui";
import { SITE_NAME } from "@/lib/config";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Live table, team sheets, bonus points and history for The Lobster League (Fantasy Premier League).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <SiteHeader siteName={SITE_NAME} />
        <main id="main" tabIndex={-1} className={`container ${styles.main}`}>
          {children}
        </main>
        <footer className={`container ${styles.footer}`}>
          <p>
            Data from the official Fantasy Premier League API. Not affiliated with the Premier League.
          </p>
        </footer>
        <CrestFallback />
      </body>
    </html>
  );
}
