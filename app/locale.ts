import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/lib/domain";
import { setRequestLocale } from "@/components/ui/i18n";

/**
 * Work out this request's language (saved choice, else the browser's preference, else English) and make it the one
 * every server component renders in. The layout and each page call this before anything is rendered.
 */
export async function initLocale(): Promise<Locale> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(jar.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
  setRequestLocale(locale);
  return locale;
}
