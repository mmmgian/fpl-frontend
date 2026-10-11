import type { Locale } from "../locales";
import { clientEn, type ClientMessages } from "./en";
import { clientEs } from "./es";
import { clientFr } from "./fr";

export type { ClientMessages };

/** Messages for client components, per language. Small on purpose: this is what ships to the browser. */
export const CLIENT_MESSAGES: Record<Locale, ClientMessages> = { en: clientEn, es: clientEs, fr: clientFr };
