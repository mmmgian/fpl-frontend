import { cache } from "react";
import { isTrip } from "./tripSlot";
import { DEFAULT_LOCALE, INTL_LOCALE, decimal, formatMoney, formatNumber, formatRank, messagesFor, oneDecimal, tripMessagesFor, type Locale, type Messages } from "@/lib/domain";

/**
 * The language of the request being rendered, readable synchronously by any server component. `cache` gives each
 * request its own slot, so concurrent requests in different languages never see each other's. The layout and every
 * page set it once, first thing (see app/locale.ts), before their views render. Without it, English.
 */
const slot = cache(() => ({ locale: DEFAULT_LOCALE as Locale }));

export function setRequestLocale(locale: Locale): void {
  slot().locale = locale;
}

export const getLocale = (): Locale => slot().locale;

/** The messages for this request. Call inside a server component: `const t = getT();`. In the altered view, its stranger words. */
export const getT = (): Messages => (isTrip() ? tripMessagesFor(getLocale()) : messagesFor(getLocale()));

/** Locale for Intl in this request (dates, numbers). */
export const getIntlLocale = (): string => INTL_LOCALE[getLocale()];

/** Number, rank, money and one-decimal formatters bound to this request's language (French: "7 295 417" and "99,9"). */
export function getFormat() {
  const locale = getLocale();
  return {
    number: (n: number) => formatNumber(n, locale),
    rank: (n: number | null | undefined) => formatRank(n, locale),
    money: (tenths: number) => formatMoney(tenths, locale),
    oneDecimal: (n: number) => oneDecimal(n, locale),
    decimal: (n: number) => decimal(n, locale),
    /** "7.3M", "148k" in the page's number style. */
    intl: INTL_LOCALE[locale],
  };
}

/** FPL names its gameweeks in English ("Gameweek 6"); this gives the same one in the page's language. Anything else is left as FPL wrote it. */
export function gameweekName(name: string): string {
  const m = /^Gameweek\s+(\d+)$/i.exec(name.trim());
  return m ? getT().common.gameweek(Number(m[1])) : name;
}

/** The short form ("GW6", "J6") of an FPL gameweek name, or the name unchanged if it isn't a numbered gameweek. */
export function gameweekShort(name: string): string {
  const m = /^Gameweek\s+(\d+)$/i.exec(name.trim());
  return m ? getT().common.gw(Number(m[1])) : name;
}
