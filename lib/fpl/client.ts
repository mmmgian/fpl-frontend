/**
 * Server-side client for the official FPL API.
 * - Browser-like headers (FPL often 403s bare server requests)
 * - Per-request timeout
 * - Typed errors carrying the upstream status so pages can map 404 -> notFound()
 */
import type { Bootstrap, Entry, EntryPicks, EventLive, Fixture, LeagueStandings } from "./types";

const FPL_BASE = "https://fantasy.premierleague.com/api";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  accept: "application/json,text/plain,*/*",
  referer: "https://fantasy.premierleague.com/",
};

export class FplError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FplError";
  }
}

export const isNotFound = (e: unknown) => e instanceof FplError && e.status === 404;

interface GetOptions {
  /** Seconds to keep in Next's data cache; 0 = always fresh. */
  revalidate?: number;
  timeoutMs?: number;
}

export async function fplGet<T>(path: string, { revalidate = 60, timeoutMs = 8000 }: GetOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${FPL_BASE}${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    throw new FplError(timedOut ? `FPL timed out on ${path}` : `Could not reach FPL (${path})`, 504);
  }
  if (!res.ok) {
    // FPL returns 503 "The game is being updated" between gameweeks.
    throw new FplError(`FPL responded ${res.status} for ${path}`, res.status);
  }
  return (await res.json()) as T;
}

// bootstrap-static is ~1.8 MB, close to Next's 2 MB data-cache limit, so keep it in memory instead.
const BOOTSTRAP_TTL_MS = 5 * 60_000;
let bootstrapMemo: { at: number; value: Promise<Bootstrap> } | null = null;

export function getBootstrap(): Promise<Bootstrap> {
  const now = Date.now();
  if (bootstrapMemo && now - bootstrapMemo.at < BOOTSTRAP_TTL_MS) return bootstrapMemo.value;
  const value = fplGet<Bootstrap>("/bootstrap-static/", { revalidate: 0, timeoutMs: 10_000 });
  bootstrapMemo = { at: now, value };
  value.catch(() => {
    if (bootstrapMemo?.value === value) bootstrapMemo = null; // never cache failures
  });
  return value;
}

/** All pages of a classic league (50 per page), capped to protect against runaway paging. */
export async function getLeagueStandings(leagueId: number, maxPages = 10): Promise<LeagueStandings> {
  const first = await fplGet<LeagueStandings>(`/leagues-classic/${leagueId}/standings/`, { revalidate: 60 });
  let page = 1;
  let last = first;
  while (last.standings.has_next && page < maxPages) {
    page += 1;
    last = await fplGet<LeagueStandings>(`/leagues-classic/${leagueId}/standings/?page_standings=${page}`, {
      revalidate: 60,
    });
    first.standings.results.push(...last.standings.results);
  }
  return first;
}

export const getEntry = (entryId: number) => fplGet<Entry>(`/entry/${entryId}/`, { revalidate: 300 });

export const getEntryPicks = (entryId: number, gw: number, finished: boolean) =>
  fplGet<EntryPicks>(`/entry/${entryId}/event/${gw}/picks/`, { revalidate: finished ? 3600 : 60 });

export const getEventLive = (gw: number, finished: boolean) =>
  fplGet<EventLive>(`/event/${gw}/live/`, { revalidate: finished ? 3600 : 60 });

export const getFixtures = (gw: number, finished: boolean) =>
  fplGet<Fixture[]>(`/fixtures/?event=${gw}`, { revalidate: finished ? 3600 : 60 });
