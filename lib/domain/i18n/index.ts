export * from "./locales";
export * from "./issues";
import type { Locale } from "./locales";
import { en, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { tripMessages } from "./trip";

export type { Messages };

/** Every language's messages, keyed by locale. TypeScript checks each one has every string English has. */
export const MESSAGES: Record<Locale, Messages> = { en, es, fr };

export const messagesFor = (locale: Locale): Messages => MESSAGES[locale];

/** The same, for the altered view: the regular catalog with that language's trip overlay laid on top. */
export const tripMessagesFor = (locale: Locale): Messages => tripMessages(MESSAGES[locale], locale);
