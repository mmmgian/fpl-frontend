"use client";

import { useSyncExternalStore } from "react";
import { useIntlLocale, useT } from "./I18nProvider";

const subscribe = () => () => {};

interface LocalTimeProps {
  iso: string | null;
  /** Shown when the time isn't known yet (e.g. postponed fixtures). Defaults to "TBC" in the page's language. */
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
}

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

/**
 * Renders a timestamp in the viewer's timezone. The server pass uses UTC with an explicit
 * label so the first paint is correct (not wrong-by-hours) and hydration doesn't mismatch.
 */
export function LocalTime({ iso, fallback, options = DEFAULT_OPTS }: LocalTimeProps) {
  const intl = useIntlLocale();
  const t = useT();
  const none = fallback ?? t.feed.tbc;
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!iso) return <span>{none}</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span>{none}</span>;
  const text = isClient
    ? d.toLocaleString(intl, options)
    : `${d.toLocaleString(intl, { ...options, timeZone: "UTC" })} UTC`;
  return <time dateTime={d.toISOString()}>{text}</time>;
}
