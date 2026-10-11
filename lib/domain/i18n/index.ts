export * from "./locales";
export * from "./issues";
import type { Locale } from "./locales";
import { en, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";

export type { Messages };

/** Every language's messages, keyed by locale. TypeScript checks each one has every string English has. */
export const MESSAGES: Record<Locale, Messages> = { en, es, fr };

export const messagesFor = (locale: Locale): Messages => MESSAGES[locale];
