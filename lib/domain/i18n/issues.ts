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
    "gw3-golden-deadline": { kicker: "Expediente de la J3", summary: "Chips, traspasos y capitanes del puesto 1 al 20." },
    "gw3-preview": { kicker: "Inteligencia del sistema", summary: "Forma, chips y planteles rumbo al cierre de la J3." },
    "gw2-recap": { kicker: "Clasificación completa", summary: "Clasificación completa de la J2, con capitanes y chips." },
    "gw2-surreal-recap": { kicker: "Edición surrealista", summary: "La clasificación de la J2, validada oficialmente, y las métricas que hay debajo." },
    "gw3-squad-deep-dive": { kicker: "Gaucho F.C. · J3", summary: "Métricas de fondo y una auditoría de jugadas a balón parado." },
    "gw4-free-hit-dossier": { kicker: "Gaucho F.C. · Expediente de estrategia de la J4", summary: "Una historia de la J4: si conviene jugar el Free Hit." },
    "gw5-transfers-report": { kicker: "Inteligencia de la liga", summary: "La actividad de traspasos de cada manager activo." },
    "gw5-gian-jaen-plan": { kicker: "Gian Jaen · Gaucho F.C.", summary: "La selección del equipo para la J5." },
    "gw5-bart-simp-plan": { kicker: "Bart Simp · Bart's Team", summary: "La selección del equipo para la J5." },
    "gw6-gian-jaen-dossier": { kicker: "Gian Jaen · Gaucho F.C.", summary: "Revisión del equipo y plan después de la pausa de selecciones." },
    "gw6-bart-simp-dossier": { kicker: "Bart Simp · Bart's Team", summary: "Revisión del equipo y plan después de la pausa de selecciones." },
    "gw6-top2-plan": { kicker: "Gaucho F.C. · Plan de la J6", summary: "Seguir en segundo lugar y acercarse al primero." },
    "gw6-saturday-debrief": { kicker: "Gaucho F.C. · J6", summary: "La tabla en vivo después del sábado, quién todavía juega y qué podría cambiar." },
    "gw3-gian-jaen-plan": { kicker: "Gian Jaen · Gaucho F.C.", summary: "Chips, traspasos gratis y el plan para la J3." },
    "gw3-khang-dang-plan": { kicker: "Khang Dang · Dang Football Club", summary: "Estado de los chips, traspasos gratis y qué hacer en la J3." },
    "gw3-khang-dang-turnaround": { kicker: "Khang Dang · J3", summary: "Por qué se perdieron puntos en la J1 y la J2, y qué cambiar." },
    "gw3-khang-dang-debrief": { kicker: "Khang Dang · Despegue en la J3", summary: "Un despegue en la J3 y qué lo impulsó." },
  },
  fr: {
    "lobster-times-gw5": { kicker: "Vol. V · Numéro 5", summary: "La gazette de la ligue : une, classement final de la J5, l'Audit du brassard et un dossier sur chaque manager." },
    "lobster-league-times-gw4": { kicker: "Édition finale de la J4", summary: "Le classement final de la J4 et le grand livre." },
    "lobster-league-times-gw3": { kicker: "Dossier maître de renseignement de la J3", summary: "Classement officiel et performances des équipes en J3." },
    "gw3-golden-deadline": { kicker: "Dossier de la J3", summary: "Chips, transferts et capitaines du rang 1 au rang 20." },
    "gw3-preview": { kicker: "Renseignement système", summary: "Forme, chips et équipes à l'approche de la clôture de la J3." },
    "gw2-recap": { kicker: "Classement complet", summary: "Classement complet de la J2, avec capitaines et chips." },
    "gw2-surreal-recap": { kicker: "Édition surréaliste", summary: "Le classement de la J2, validé officiellement, et les statistiques qui le sous-tendent." },
    "gw3-squad-deep-dive": { kicker: "Gaucho F.C. · J3", summary: "Statistiques de fond et audit des coups de pied arrêtés." },
    "gw4-free-hit-dossier": { kicker: "Gaucho F.C. · Dossier stratégique de la J4", summary: "Une histoire de la J4 : faut-il jouer le Free Hit ?" },
    "gw5-transfers-report": { kicker: "Renseignement de la ligue", summary: "L'activité de transferts de chaque manager actif." },
    "gw5-gian-jaen-plan": { kicker: "Gian Jaen · Gaucho F.C.", summary: "La composition d'équipe pour la J5." },
    "gw5-bart-simp-plan": { kicker: "Bart Simp · Bart's Team", summary: "La composition d'équipe pour la J5." },
    "gw6-gian-jaen-dossier": { kicker: "Gian Jaen · Gaucho F.C.", summary: "Bilan de l'équipe et plan après la trêve internationale." },
    "gw6-bart-simp-dossier": { kicker: "Bart Simp · Bart's Team", summary: "Bilan de l'équipe et plan après la trêve internationale." },
    "gw6-top2-plan": { kicker: "Gaucho F.C. · Plan de la J6", summary: "Rester deuxième et revenir à portée du premier." },
    "gw6-saturday-debrief": { kicker: "Gaucho F.C. · J6", summary: "Le classement en direct après le samedi, qui joue encore, et ce qui pourrait changer." },
    "gw3-gian-jaen-plan": { kicker: "Gian Jaen · Gaucho F.C.", summary: "Chips, transferts gratuits et plan pour la J3." },
    "gw3-khang-dang-plan": { kicker: "Khang Dang · Dang Football Club", summary: "État des chips, transferts gratuits et que faire en J3." },
    "gw3-khang-dang-turnaround": { kicker: "Khang Dang · J3", summary: "Pourquoi des points ont été perdus en J1 et J2, et ce qu'il faut changer." },
    "gw3-khang-dang-debrief": { kicker: "Khang Dang · Percée en J3", summary: "Une percée en J3, et ce qui l'a provoquée." },
  },
};

/** The issue with its kicker and summary in the reader's language (English when there is no translation). */
export function localizeIssue<T extends { id: string; kicker: string | null; summary: string | null }>(issue: T, locale: Locale): T {
  if (locale === "en") return issue;
  const words = ISSUE_TEXT[locale][issue.id];
  if (!words) return issue;
  return { ...issue, kicker: issue.kicker ? (words.kicker ?? issue.kicker) : issue.kicker, summary: issue.summary ? (words.summary ?? issue.summary) : issue.summary };
}
