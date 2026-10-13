import { THEME_STORAGE_KEY, chromeColor, type Theme } from "@/lib/domain";

/** Show a theme now and (when `remember`) keep it for next time. Storage may be blocked; that's fine. */
export function applyTheme(theme: Theme, remember: boolean, doc: Document = document, storage?: Pick<Storage, "setItem">): void {
  doc.documentElement.dataset.theme = theme;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]') ?? doc.createElement("meta");
  meta.name = "theme-color";
  meta.dataset.themeColor = "";
  meta.content = chromeColor(theme, doc.documentElement.dataset.trip === "on");
  if (!meta.parentNode) doc.head.prepend(meta); // before the static, media-qualified ones: the first match wins
  if (remember) {
    try {
      (storage ?? localStorage).setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* private mode or blocked storage: the choice just won't outlive this tab */
    }
  }
  doc.defaultView?.dispatchEvent(new Event("lobster-theme"));
}

