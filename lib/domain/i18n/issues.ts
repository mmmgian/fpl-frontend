import type { Locale } from "./locales";

/**
 * The short blurb on each Times issue, in the languages the app speaks. The issue's title is a proper name
 * (a masthead or a headline in the printed edition) and the printed pages are English, so neither is translated;
 * only the kicker and summary around them are. An issue with no entry (a new one) falls back to its English text.
 */
type Words = { kicker?: string; summary?: string };

export const ISSUE_TEXT: Record<Exclude<Locale, "en">, Record<string, Words>> = {
  es: {
    "lobster-times-gw5": { kicker: "Vol. V · Edición 5", summary: "La gaceta de la liga: portada, la tabla final de la J5, la Auditoría del Brazalete y un expediente de cada manager." },
    "lobster-league-times-gw4": { kicker: "Edición final de la J4", summary: "La tabla final de la J4 y el libro mayor." },
    "lobster-league-times-gw3": { kicker: "Expediente maestro de inteligencia de la J3", summary: "Clasificación oficial y rendimiento de las planteles en la J3." },
  },
  fr: {
    "lobster-times-gw5": { kicker: "Vol. V · Numéro 5", summary: "La gazette de la ligue : une, classement final de la J5, l'Audit du brassard et un dossier sur chaque manager." },
    "lobster-league-times-gw4": { kicker: "Édition finale de la J4", summary: "Le classement final de la J4 et le grand livre." },
    "lobster-league-times-gw3": { kicker: "Dossier maître de renseignement de la J3", summary: "Classement officiel et performances des équipes en J3." },
  },
};

/** The issue with its kicker and summary in the reader's language (English when there is no translation). */
export function localizeIssue<T extends { id: string; kicker: string | null; summary: string | null }>(issue: T, locale: Locale): T {
  if (locale === "en") return issue;
  const words = ISSUE_TEXT[locale][issue.id];
  if (!words) return issue;
  return { ...issue, kicker: issue.kicker ? (words.kicker ?? issue.kicker) : issue.kicker, summary: issue.summary ? (words.summary ?? issue.summary) : issue.summary };
}
