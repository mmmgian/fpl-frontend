"use client";

import { useSyncExternalStore } from "react";
import { isTheme, THEME_LABEL, THEMES, type Theme } from "@/lib/domain";
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
  return (
    <fieldset className={styles.group}>
      <legend className="sr-only">Colour theme</legend>
      {THEMES.map((t) => (
        <label key={t} className={styles.option} data-option={t}>
          <input
            type="radio"
            name="theme"
            value={t}
            className={styles.input}
            checked={theme === t}
            onChange={() => applyTheme(t, true)}
          />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {ICON[t]}
          </svg>
          <span className="sr-only">{THEME_LABEL[t]}</span>
        </label>
      ))}
    </fieldset>
  );
}
