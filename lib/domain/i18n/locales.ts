/**
 * Languages the site speaks. Pure: no framework, no I/O.
 *
 * Spanish is written for Central America (tú, "jornada", "banca"), which is what `es-419` (Latin American Spanish)
 * is the right Intl locale for.
 */
export const LOCALES = ["en", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The cookie that remembers a person's choice on their device. */
export const LOCALE_COOKIE = "lobster-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language in its own words, so a person can find theirs whatever language the page is in. */
export const LOCALE_NAME: Record<Locale, string> = { en: "English", es: "Español (Centroamérica)", fr: "Français" };

/** Value for <html lang>. */
export const HTML_LANG: Record<Locale, string> = { en: "en-GB", es: "es-419", fr: "fr" };

/** Locale for Intl (dates, numbers). */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", es: "es-419", fr: "fr-FR" };

export const isLocale = (value: unknown): value is Locale => typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * The best supported language for an Accept-Language header such as "es-PA,es;q=0.9,en;q=0.5": the highest-ranked
 * language we have, matched on its first part (es-PA and es-MX are both "es"). Anything else, or junk: the default.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith("q="))?.slice(2) ?? 1);
      return { lang: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((x) => x.lang).find(isLocale) ?? DEFAULT_LOCALE;
}

/** A saved choice wins; otherwise the browser's preference; otherwise English. */
export function resolveLocale(saved: unknown, acceptLanguage: string | null | undefined): Locale {
  return isLocale(saved) ? saved : negotiateLocale(acceptLanguage);
}
