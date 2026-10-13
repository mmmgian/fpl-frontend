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

/**
 * How often a page showing the latest gameweek should re-fetch, or null to stay still. Live games change every minute;
 * a provisional gameweek only waits for FPL to confirm bonus and set `data_checked`, so a slow poll is enough for the
 * page to flip to "final" (with its final copy) on its own, without a reload.
 */
export function refreshIntervalMs(status: GwStatus): number | null {
  if (status === "live") return 60_000;
  if (status === "provisional") return 300_000;
  return null;
}

const DAY_MS = 86_400_000;
const PHASE_SALT: Record<GwStatus, number> = { upcoming: 0x1f, live: 0x3d, provisional: 0x5b, final: 0x79 };

/**
 * A salt for seeded copy so wording never goes stale. It changes every UTC day, whatever the phase (so the days between
 * gameweeks don't repeat the same lines), and it changes the moment FPL moves the gameweek on (live -> provisional ->
 * final once `data_checked` is set), so finalised data always arrives with freshly drawn copy. Facts never depend on it.
 */
export function varietyKey(gw: number, status: GwStatus, now: Date = new Date()): number {
  const day = Math.floor(now.getTime() / DAY_MS);
  return (Math.imul(gw, 7919) + Math.imul(day, 104729) + Math.imul(PHASE_SALT[status], 2654435761)) | 0;
}

/** Deterministic pick from `items` for a key and a slot (e.g. a manager or row), so neighbours don't share a line. */
export function pickVariant<T>(items: readonly T[], key: number, slot = 0): T {
  let h = (key ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return items[((h ^ (h >>> 16)) >>> 0) % items.length];
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
