import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CrestFallback, I18nProvider, LanguageSwitcher, SiteHeader, SkipLink, getT } from "@/components/ui";
import { initLocale } from "./locale";
import { SITE_NAME } from "@/lib/config";
import { HTML_LANG, THEME_SCRIPT } from "@/lib/domain";
import "./globals.css";
import styles from "./layout.module.css";

export async function generateMetadata(): Promise<Metadata> {
  await initLocale();
  return { title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` }, description: getT().meta.description };
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
  return (
    // data-theme is set by the script below before first paint, so React must not treat it as a mismatch.
    <html lang={HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale}>
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
              <LanguageSwitcher />
            </div>
          </footer>
          <CrestFallback />
        </I18nProvider>
      </body>
    </html>
  );
}
