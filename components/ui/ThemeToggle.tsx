"use client";

import { useSyncExternalStore } from "react";
// Deep import on purpose: the domain barrel would pull every language into the browser bundle.
import { isTheme, THEMES, type Theme } from "@/lib/domain/theme";
import { useT } from "./I18nProvider";
import { applyTheme } from "./applyTheme";
import styles from "./ThemeToggle.module.css";

const ICON: Record<Theme, React.ReactNode> = {
  // Regular: a sun
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  // Night reader: an open book, as in a reading app's night page
  night: (
    <>
      <path d="M12 6.5C10.4 5.3 8.2 4.8 5 4.8v12.4c3.2 0 5.4.5 7 1.7 1.6-1.2 3.8-1.7 7-1.7V4.8c-3.2 0-5.4.5-7 1.7Z" />
      <path d="M12 6.5v12.4" />
    </>
  ),
  // Dark: a crescent moon
  dark: <path d="M20.2 14.6A8.2 8.2 0 0 1 9.4 3.8a8.2 8.2 0 1 0 10.8 10.8Z" />,
};

function subscribe(onChange: () => void) {
  window.addEventListener("lobster-theme", onChange);
  return () => window.removeEventListener("lobster-theme", onChange);
}
const current = () => {
  const t = document.documentElement.dataset.theme;
  return isTheme(t) ? t : null;
};

/**
 * Regular / Night reader / Dark. Which segment looks selected is decided by CSS from <html data-theme>, so it
 * is right on first paint; React only adds the real `checked` state (for assistive tech) once it has loaded.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const t = useT();
  return (
    <fieldset className={styles.group}>
      <legend className="sr-only">{t.theme.group}</legend>
      {THEMES.map((name) => (
        <label key={name} className={styles.option} data-option={name}>
          <input
            type="radio"
            name="theme"
            value={name}
            className={styles.input}
            checked={theme === name}
            onChange={() => applyTheme(name, true)}
          />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {ICON[name]}
          </svg>
          <span className="sr-only">{t.theme[name]}</span>
        </label>
      ))}
    </fieldset>
  );
}
