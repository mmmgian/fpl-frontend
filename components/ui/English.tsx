import type { ReactNode } from "react";
import { getLocale } from "./i18n";

/**
 * Text that stays English whatever language the page is in: a newspaper's title, FPL's injury notes, the BBC's
 * headlines. On a Spanish or French page it is marked `lang="en"`, so a screen reader switches to an English voice
 * instead of mangling it with a Spanish or French one. On an English page it adds nothing.
 */
export function English({ children }: { children: ReactNode }) {
  return getLocale() === "en" ? <>{children}</> : <span lang="en">{children}</span>;
}
