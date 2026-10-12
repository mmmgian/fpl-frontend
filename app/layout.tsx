import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CrestFallback, I18nProvider, LanguageSwitcher, SiteHeader, SkipLink, TripSwitch, getT, isTrip } from "@/components/ui";
import { initLocale } from "./locale";
import { SITE_NAME } from "@/lib/config";
import { HTML_LANG, THEME_SCRIPT } from "@/lib/domain";
import "./globals.css";
import "./trip.css";
import styles from "./layout.module.css";

export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  const description = getT().meta.description;
  return {
    // Shared links (chat apps, social posts) show the page's name and picture; the address of the site is fixed so they resolve.
    metadataBase: new URL(process.env.SITE_URL ?? "https://lobsterleague.fyi"),
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    description,
    openGraph: { siteName: SITE_NAME, type: "website", description, images: [{ url: "/brand/lobster-league.webp", width: 288, height: 192, alt: SITE_NAME }] },
    twitter: { card: "summary" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await initLocale();
  const t = getT();
  const trip = isTrip();
  return (
    // data-theme is set by the script below before first paint, so React must not treat it as a mismatch.
    <html lang={HTML_LANG[locale]} data-trip={trip ? "on" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale}>
          {trip ? (
            // A slow warp for pictures only (see trip.css): a few small images is cheap, the whole page would not be.
            <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
              <filter id="trip-wobble" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.015 0.02" numOctaves="2" seed="4" result="noise">
                  <animate attributeName="baseFrequency" dur="16s" values="0.015 0.02;0.025 0.012;0.015 0.02" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </svg>
          ) : null}
          <SkipLink />
          <SiteHeader siteName={SITE_NAME} />
          <main id="main" tabIndex={-1} className={`container ${styles.main}`}>
            {children}
          </main>
          <footer className={`container ${styles.footer}`}>
            <div className={styles.footerInner}>
              <div className={styles.about}>
                <p>{t.footer.disclaimer}</p>
                <p className={styles.credit}>{t.footer.credit}</p>
              </div>
              <div className={styles.controls}>
                <TripSwitch on={trip} />
                <LanguageSwitcher />
              </div>
            </div>
          </footer>
          <CrestFallback />
        </I18nProvider>
      </body>
    </html>
  );
}
