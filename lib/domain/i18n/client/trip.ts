/**
 * Client strings for the altered view (the blotter), per language: laid over the regular client catalog by the
 * I18nProvider when the page is rendered with the trip cookie. Small on purpose: this ships to the browser.
 * Nav labels stay as short as the regular ones so the header pills fit on a phone.
 */
import type { Locale } from "../locales";
import type { ClientMessages } from "./en";

type Partial2<T> = { [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K] : T[K] extends object ? Partial<T[K]> : T[K] };

export const CLIENT_TRIP: Record<Locale, Partial2<ClientMessages>> = {
  en: {
    theme: { group: "Colour of the sky", light: "Daylight", night: "Moonlight", dark: "The void" },
    live: { updating: "Breathing in…", last: (time: string) => `Last breath ${time}`, refresh: "Breathe again" },
    errors: {
      title: "This page slipped into another dimension",
      body: "The Fantasy Premier League API didn't answer. It's usually shifting between gameweeks or overwhelmed, so breathe and try again in a minute.",
      retry: "Try again, gently",
      backToTable: "Back to the cosmos",
      historyTitle: "The memories are out of reach",
      historyBody: "The memory server didn't answer. It dreams when idle; trying again usually works once it wakes.",
    },
    nav: { table: "Cosmos", tools: "Lab", bonus: "Glow", fixtures: "Orbits", times: "Tides", home: "Home base", skip: "Skip to the trip" },
    deadline: { title: "The next portal closes in", days: "Days", hours: "Hours", mins: "Mins", secs: "Breaths", passed: "The portal has closed" },
    fdr: { difficulty: (n: number) => `, gravity ${n} of 5`, scale: "Gravity: 1 a warm bath to 5 a bad trip" },
    feed: {
      live: "Breathing",
      provisional: "Settling",
      provisionalTitle: "Full time, but the bonus glow hasn't settled yet",
      tbc: "Unwritten",
      thisWeek: "This orbit",
      played: "Echoed",
      deadline: "Portal closes",
      double: "Double orbit",
      blank: "Void",
      today: "Right now",
      jumpTo: "Teleport to",
      postponed: "Drifted away",
      postponedHeading: "Drifted off, to be pulled back in time",
      kickoffTbc: "The big bang time is still swirling",
      earlier: "Older orbits",
      showMore: "Reveal more orbits",
      end: "That's everything: the whole season, to the last echo.",
      unknownClub: "A club from another plane",
    },
  },
  es: {
    theme: { group: "Color del cielo", light: "Luz del día", night: "Luz de luna", dark: "El vacío" },
    live: { updating: "Inhalando…", last: (time: string) => `Última respiración ${time}`, refresh: "Respirar otra vez" },
    errors: {
      title: "Esta página se fue a otra dimensión",
      body: "La API de Fantasy Premier League no respondió. Suele estar cambiando de jornada o saturada: respira e inténtalo en un minuto.",
      retry: "Intentar otra vez, con calma",
      backToTable: "Volver al cosmos",
      historyTitle: "Los recuerdos están fuera de alcance",
      historyBody: "El servidor de recuerdos no respondió. Sueña cuando está inactivo; volver a intentarlo suele funcionar cuando despierta.",
    },
    nav: { table: "Cosmos", tools: "Lab", bonus: "Brillo", fixtures: "Órbitas", times: "Mareas", home: "Base", skip: "Saltar al viaje" },
    deadline: { title: "El próximo portal se cierra en", days: "Días", hours: "Horas", mins: "Min", secs: "Respiros", passed: "El portal se cerró" },
    fdr: { difficulty: (n: number) => `, gravedad ${n} de 5`, scale: "Gravedad: 1 un baño tibio, 5 un mal viaje" },
    feed: {
      live: "Respirando",
      provisional: "Asentándose",
      provisionalTitle: "Final del partido, pero el brillo extra aún no se asienta",
      tbc: "Sin escribir",
      thisWeek: "Esta órbita",
      played: "Eco",
      deadline: "Cierre del portal",
      double: "Órbita doble",
      blank: "Vacío",
      today: "Ahora mismo",
      jumpTo: "Teletransportarse a",
      postponed: "A la deriva",
      postponedHeading: "A la deriva, se traerá de vuelta en el tiempo",
      kickoffTbc: "La hora del big bang aún gira",
      earlier: "Órbitas anteriores",
      showMore: "Revelar más órbitas",
      end: "Eso es todo: la temporada entera, hasta el último eco.",
      unknownClub: "Un club de otro plano",
    },
  },
  fr: {
    theme: { group: "Couleur du ciel", light: "Plein jour", night: "Clair de lune", dark: "Le vide" },
    live: { updating: "Inspiration…", last: (time: string) => `Dernier souffle ${time}`, refresh: "Respirer encore" },
    errors: {
      title: "Cette page a glissé dans une autre dimension",
      body: "L'API de Fantasy Premier League n'a pas répondu. Elle change souvent de journée ou sature : respirez et réessayez dans une minute.",
      retry: "Réessayer, doucement",
      backToTable: "Retour au cosmos",
      historyTitle: "Les souvenirs sont hors d'atteinte",
      historyBody: "Le serveur des souvenirs n'a pas répondu. Il rêve quand il est inactif ; réessayer marche souvent une fois réveillé.",
    },
    nav: { table: "Cosmos", tools: "Labo", bonus: "Lueur", fixtures: "Orbites", times: "Marées", home: "Base", skip: "Aller au voyage" },
    deadline: { title: "Le prochain portail se ferme dans", days: "Jours", hours: "Heures", mins: "Min", secs: "Souffles", passed: "Le portail s'est refermé" },
    fdr: { difficulty: (n: number) => `, gravité ${n} sur 5`, scale: "Gravité : 1 un bain tiède, 5 un bad trip" },
    feed: {
      live: "Respire",
      provisional: "Se pose",
      provisionalTitle: "Fin du match, mais la lueur bonus ne s'est pas encore posée",
      tbc: "Pas encore écrit",
      thisWeek: "Cette orbite",
      played: "Écho",
      deadline: "Fermeture du portail",
      double: "Double orbite",
      blank: "Vide",
      today: "Maintenant",
      jumpTo: "Se téléporter à",
      postponed: "À la dérive",
      postponedHeading: "À la dérive, à ramener dans le temps",
      kickoffTbc: "L'heure du big bang tourbillonne encore",
      earlier: "Orbites précédentes",
      showMore: "Révéler plus d'orbites",
      end: "C'est tout : la saison entière, jusqu'au dernier écho.",
      unknownClub: "Un club d'un autre plan",
    },
  },
};

/** The client catalog for the altered view: each section of the regular one with the trip strings laid on top. */
export function clientTrip(base: ClientMessages, locale: Locale): ClientMessages {
  const over = CLIENT_TRIP[locale] as Record<string, object | undefined>;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) if (v) out[k] = { ...(out[k] as object), ...v };
  return out as ClientMessages;
}
