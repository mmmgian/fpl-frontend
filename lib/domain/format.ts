/** Display formatting for domain values. Pure. Every formatter takes the page's language and defaults to English. */
import { INTL_LOCALE, type Locale } from "./i18n/locales";

const one = { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false } as const;

/** A real minus sign (U+2212) instead of the hyphen Intl prints: same width as "+", and it lines up in a column. */
export const minus = (s: string) => s.replace(/^-/, "\u2212");

/** FPL news uses a spaced hyphen as a dash ("Knee injury - 75% chance"); show a proper en dash. */
export const dash = (s: string) => s.replace(/ - /g, " \u2013 ");

/** Money in tenths of a million; a negative amount puts the sign before the pound: −£0.1m, not £-0.1m. */
export const formatMoney = (tenths: number, locale: Locale = "en") => `${tenths < 0 ? "\u2212" : ""}£${(Math.abs(tenths) / 10).toLocaleString(INTL_LOCALE[locale], one)}m`;
export const formatRank = (n: number | null | undefined, locale: Locale = "en") => (n ? minus(n.toLocaleString(INTL_LOCALE[locale])) : "—");
export const formatNumber = (n: number, locale: Locale = "en") => minus(n.toLocaleString(INTL_LOCALE[locale]));

/**
 * One decimal place, rounded half-up on the decimal value. `toFixed` works on the binary double, so it turns
 * 32.55 into "32.5"; adding a tiny epsilon first makes it "32.6" as a person would expect.
 */
export const oneDecimal = (n: number, locale: Locale = "en") => minus(((Math.round((n + Number.EPSILON) * 10) / 10) || 0).toLocaleString(INTL_LOCALE[locale], one)); // `|| 0` turns -0 into 0, so no "-0.0"

/** Up to one decimal place, none for a whole number: 28 -> "28", 25.8 -> "25.8" (French "25,8"). */
export const decimal = (n: number, locale: Locale = "en") => minus(n.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 1 }));

/** File size for people: 3.4 MB, 273 KB (French "3,4 Mo", "273 Ko"). Binary units, one decimal from MB up. */
export function formatBytes(bytes: number, locale: Locale = "en", units: { b: string; kb: string; mb: string } = { b: "B", kb: "KB", mb: "MB" }): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} ${units.b}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${units.kb}`;
  return `${(bytes / (1024 * 1024)).toLocaleString(INTL_LOCALE[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${units.mb}`;
}
