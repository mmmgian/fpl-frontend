/** Client for our FastAPI backend (league history snapshots). Render's free tier can take ~40s to wake. */
import { backendUrl } from "./config";
import type { LeagueStandings } from "./fpl/types";

export interface SnapshotSummary {
  gw: number;
  taken_at: string;
}

export interface Snapshot extends SnapshotSummary {
  league_id: number;
  data: LeagueStandings;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

const TIMEOUT_MS = 50_000;
const ONE_YEAR_S = 31_536_000;

/**
 * Cache tag for one league's history. The cron route revalidates it when the backend stores a new snapshot,
 * so visitors are served from Next's data cache and almost never wait for a sleeping Render instance.
 * Only 200 responses are cached, so a 404/502 from a waking server is never stored.
 */
export const historyTag = (leagueId: number) => `history:${leagueId}`;

async function get<T>(path: string, cache: { revalidate: number; tags: string[] }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: cache,
    });
  } catch {
    throw new BackendError("The history server did not respond in time", 504);
  }
  if (!res.ok) throw new BackendError(`History server responded ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** The list changes once per gameweek; the daily safety refresh covers snapshots stored outside the cron. */
export async function listSnapshots(leagueId: number): Promise<SnapshotSummary[]> {
  const body = await get<{ snapshots?: SnapshotSummary[] }>(`/history/${leagueId}`, {
    revalidate: 86_400,
    tags: [historyTag(leagueId)],
  });
  return [...(body.snapshots ?? [])].sort((a, b) => a.gw - b.gw);
}

/** null when no snapshot exists for that gameweek. A stored snapshot never changes, so cache it for a year. */
export async function getSnapshot(leagueId: number, gw: number): Promise<Snapshot | null> {
  try {
    // Not `revalidate: false`: under `dynamic = "force-dynamic"` Next treats a falsy revalidate as unset
    // and skips the cache entirely (patch-fetch `noFetchConfigAndForceDynamic`). An explicit TTL is honoured.
    return await get<Snapshot>(`/history/${leagueId}/${gw}`, { revalidate: ONE_YEAR_S, tags: [historyTag(leagueId)] });
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) return null;
    throw e;
  }
}
