"use client";

import { HTML_LANG, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_NAME, LOCALES, isLocale } from "@/lib/domain/i18n/locales";
import { useLocale, useT } from "./I18nProvider";
import styles from "./LanguageSwitcher.module.css";

/**
 * The language button. Choosing a language saves it on this device (a cookie the server reads, so the very next
 * render is in that language with no flash) and reloads the page.
 *
 * It reloads rather than calling `router.refresh()` on purpose: a soft refresh did not apply on the league page (its
 * root-level loading boundary swallows the update), and a language change is rare enough that a reload is fine. The
 * address, including a Times issue's `?p=` page, survives it.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useT();

  const change = (value: string) => {
    if (!isLocale(value) || value === locale) return;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
    window.location.reload();
  };

  return (
    <label className={styles.wrap}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
      </svg>
      <span className="sr-only">{t.language.label}</span>
      <select className={styles.select} value={locale} onChange={(e) => change(e.target.value)}>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={HTML_LANG[l]}>
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
