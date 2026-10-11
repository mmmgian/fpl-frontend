/** Gameweek rules. Pure: no I/O, no framework. */
import type { FplEvent } from "./types";

/** The gameweek the app should show by default: current, else latest finished, else null (pre-season). */
export function currentEvent(events: FplEvent[]): FplEvent | null {
  return (
    events.find((e) => e.is_current) ??
    [...events].reverse().find((e) => e.finished) ??
    null
  );
}

export type GwStatus = "upcoming" | "live" | "provisional" | "final";

export function gwStatus(event: FplEvent, now: Date = new Date()): GwStatus {
  if (new Date(event.deadline_time) > now) return "upcoming";
  if (!event.finished) return "live";
  return event.data_checked ? "final" : "provisional";
}

/** Parse a `?gw=` search param; returns null if missing or out of [min, max]. */
export function parseGw(raw: string | string[] | undefined, min: number, max: number): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

export interface GameweekSelection {
  /** The current/latest gameweek (the upper bound for navigation). */
  latest: FplEvent;
  /** The gameweek to show: the requested one if valid, else `latest`. */
  gw: number;
  event: FplEvent;
  status: GwStatus;
}

/** Resolve which gameweek a page should show. null before the season starts. */
export function selectGameweek(
  events: FplEvent[],
  requested: string | string[] | undefined,
  min = 1,
  now: Date = new Date(),
): GameweekSelection | null {
  const latest = currentEvent(events);
  if (!latest) return null;
  const gw = parseGw(requested, min, latest.id) ?? latest.id;
  const event = events.find((e) => e.id === gw)!;
  return { latest, gw, event, status: gwStatus(event, now) };
}
