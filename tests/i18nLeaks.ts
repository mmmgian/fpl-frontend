/**
 * Finds English left behind on a page that should be in another language.
 *
 * Two independent nets, because each misses what the other catches:
 *  1. Catalog strings: any visible text that is exactly an English catalog string whose es/fr version is different.
 *     Catches single words ("Leader") that no word list could.
 *  2. Function words: any visible text that appears in the English render of the same page and contains common English
 *     words ("the", "your"...). Catches hard-coded sentences that were never in a catalog.
 */
import { en } from "@/lib/domain/i18n/en";
import { es } from "@/lib/domain/i18n/es";
import { fr } from "@/lib/domain/i18n/fr";
import { clientEn } from "@/lib/domain/i18n/client/en";
import { clientEs } from "@/lib/domain/i18n/client/es";
import { clientFr } from "@/lib/domain/i18n/client/fr";
import type { Locale } from "@/lib/domain/i18n/locales";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (m) => ENTITIES[m]);

/** Every piece of text a person (or a screen reader) gets: text nodes plus title / aria-label / alt / placeholder. */
export function visibleTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/>([^<>]+)</g)) out.push(m[1]);
  for (const m of html.matchAll(/\s(?:title|aria-label|aria-roledescription|aria-description|aria-valuetext|alt|placeholder)="([^"]*)"/g)) out.push(m[1]);
  return out.map((s) => decode(s).replace(/\s+/g, " ").trim()).filter((s) => /\p{L}/u.test(s));
}

/** The string leaves of a catalog (functions are skipped: their output depends on arguments). */
function leaves(value: unknown, path = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof value === "string") out.set(path, value);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) for (const [p, s] of leaves(v, `${path}.${k}`)) out.set(p, s);
  return out;
}

const CATALOGS = {
  en: new Map([...leaves(en), ...[...leaves(clientEn)].map(([k, v]) => [`client${k}`, v] as const)]),
  es: new Map([...leaves(es), ...[...leaves(clientEs)].map(([k, v]) => [`client${k}`, v] as const)]),
  fr: new Map([...leaves(fr), ...[...leaves(clientFr)].map(([k, v]) => [`client${k}`, v] as const)]),
};

/** English strings that really are different in `locale`, so seeing the English one on a translated page is a leak. */
function translatedAway(locale: Exclude<Locale, "en">): Set<string> {
  const set = new Set<string>();
  for (const [path, english] of CATALOGS.en) {
    const other = CATALOGS[locale].get(path);
    if (other !== undefined && other !== english && english.trim().length >= 3) set.add(english.trim());
  }
  return set;
}

const FUNCTION_WORDS = /\b(the|and|of|your|this|that|for|with|from|are|was|were|have|will|not|you|their|been|after|before|each|only|than|when|what|which)\b/i;

export interface LeakOptions {
  /** Text that is legitimately English whatever the language: team names, BBC headlines, proper names. */
  allow?: (string | RegExp)[];
}

export function englishLeaks(englishHtml: string, translatedHtml: string, locale: Exclude<Locale, "en">, { allow = [] }: LeakOptions = {}): string[] {
  const allowed = (s: string) => allow.some((a) => (typeof a === "string" ? s.includes(a) : a.test(s)));
  const awayFromEnglish = translatedAway(locale);
  const englishTexts = new Set(visibleTexts(englishHtml));
  const found = new Set<string>();
  for (const text of visibleTexts(translatedHtml)) {
    if (allowed(text)) continue;
    // French writes 2,4 where English writes 2.4 (Central American Spanish, like English, keeps the point).
    if (locale === "fr" && /(?<![\d.])\d+\.\d\b/.test(text)) found.add(`decimal point: ${text}`);
    if (awayFromEnglish.has(text)) found.add(`catalog: ${text}`);
    else if (englishTexts.has(text) && FUNCTION_WORDS.test(text)) found.add(`english: ${text}`);
  }
  return [...found];
}
