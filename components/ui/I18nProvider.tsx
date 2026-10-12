"use client";

import { createContext, useContext, type ReactNode } from "react";
// Deep imports on purpose: the barrel would pull the full server catalogs into the browser bundle.
import { CLIENT_MESSAGES, type ClientMessages } from "@/lib/domain/i18n/client";
import { clientTrip } from "@/lib/domain/i18n/client/trip";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/lib/domain/i18n/locales";

interface Value {
  locale: Locale;
  t: ClientMessages;
}

const Ctx = createContext<Value>({ locale: DEFAULT_LOCALE, t: CLIENT_MESSAGES[DEFAULT_LOCALE] });

/**
 * Makes the page's language available to client components (server components use getT()). Only the small locale
 * code (and whether the altered view is on) crosses from the server; the messages are looked up here.
 */
export function I18nProvider({ locale, trip = false, children }: { locale: Locale; trip?: boolean; children: ReactNode }) {
  const t = trip ? clientTrip(CLIENT_MESSAGES[locale], locale) : CLIENT_MESSAGES[locale];
  return <Ctx.Provider value={{ locale, t }}>{children}</Ctx.Provider>;
}

/** Messages for client components. */
export const useT = (): ClientMessages => useContext(Ctx).t;
export const useLocale = (): Locale => useContext(Ctx).locale;
export const useIntlLocale = (): string => INTL_LOCALE[useContext(Ctx).locale];
