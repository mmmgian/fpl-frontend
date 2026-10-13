/**
 * Colour themes. Three, picked by the person and remembered on their device:
 *   light  the regular view
 *   night  a warm, low-glare "night reader" (think Night Shift / a reading app's night page)
 *   dark   the neutral dark mode
 * Until they choose, the device's own light/dark setting decides.
 *
 * Pure: no React and no DOM access, so it can be tested, and its inline twin (THEME_SCRIPT, run before first paint
 * so there is no flash of the wrong theme) can be checked against it. Applying a theme to a page is the UI's job.
 */

export const THEMES = ["light", "night", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "lobster-theme";

/** Browser chrome colour (status bar, tab strip) for each theme. Kept equal to each theme's --bg. */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", night: "#16110c", dark: "#0b0b0b" };

/** Browser chrome colour while the altered ("trip") view is on, whatever the theme: it paints every theme the same (app/trip.css --bg). */
export const TRIP_THEME_COLOR = "#12001f";

/** The chrome colour to show: the trip view's own when `<html data-trip="on">`, otherwise the theme's. */
export const chromeColor = (theme: Theme, trip: boolean): string => (trip ? TRIP_THEME_COLOR : THEME_COLOR[theme]);

export const THEME_LABEL: Record<Theme, string> = { light: "Regular", night: "Night reader", dark: "Dark" };

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The saved choice if it is a real theme, otherwise whatever the device prefers. Never throws on junk. */
export function resolveTheme(saved: unknown, prefersDark: boolean): Theme {
  return isTheme(saved) ? saved : prefersDark ? "dark" : "light";
}

/**
 * Runs in <head> before anything paints. Self-contained (it can't import), and kept equivalent to
 * resolveTheme + applyTheme by a test that executes this very string. Also follows the device while the
 * person hasn't chosen anything.
 */
export const THEME_SCRIPT = `(function(){
var K=${JSON.stringify(THEME_STORAGE_KEY)},C=${JSON.stringify(THEME_COLOR)},T=${JSON.stringify(TRIP_THEME_COLOR)},d=document,q=matchMedia("(prefers-color-scheme: dark)");
function saved(){try{var s=localStorage.getItem(K);return s&&C.hasOwnProperty(s)?s:null}catch(e){return null}}
function show(t){d.documentElement.dataset.theme=t;var m=d.querySelector('meta[name="theme-color"][data-theme-color]');if(!m){m=d.createElement("meta");m.name="theme-color";m.setAttribute("data-theme-color","");d.head.prepend(m)}m.content=d.documentElement.dataset.trip==="on"?T:C[t];dispatchEvent(new Event("lobster-theme"))}
show(saved()||(q.matches?"dark":"light"));
q.addEventListener&&q.addEventListener("change",function(){if(!saved())show(q.matches?"dark":"light")});
})();`;
