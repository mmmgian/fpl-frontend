/**
 * The altered view's words (the blotter, see lib/domain/trip.ts). Each language has a partial catalog laid over its
 * regular one: whatever it names is replaced, everything else falls through. Every function keeps its signature, so
 * the same figures land in a stranger sentence.
 */
import type { Locale } from "../locales";
import type { Messages } from "../en";
import { tripEn } from "./en";
import { tripEs } from "./es";
import { tripFr } from "./fr";

/** Optional all the way down; functions and arrays are replaced whole. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown ? T : T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** What an overlay may replace. The press conference already has its own altered voices, and the client strings travel separately. */
export type TripOverlay = DeepPartial<Omit<Messages, "interview" | "client" | "blotter">>;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `base` with `over` laid on top, without touching either. */
export function overlay<T>(base: T, over: DeepPartial<T> | undefined): T {
  if (!over) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = isPlain(v) && isPlain(out[k]) ? overlay(out[k], v as DeepPartial<unknown>) : v;
  }
  return out as T;
}

export const TRIP_OVERLAYS: Record<Locale, TripOverlay> = { en: tripEn, es: tripEs, fr: tripFr };

const built = new Map<Locale, Messages>();
/** The full catalog for the altered view in one language, built once. */
export function tripMessages(base: Messages, locale: Locale): Messages {
  const cached = built.get(locale);
  if (cached) return cached;
  const m = overlay<Messages>(base, TRIP_OVERLAYS[locale] as unknown as DeepPartial<Messages>);
  built.set(locale, m);
  return m;
}
