/** Adapter for our FastAPI backend (league history snapshots). Render's free tier can take ~40s to wake. */
import type { Snapshot, SnapshotSummary } from "./domain/types";
import type { HistoryPort } from "./services/ports";
import { backendUrl } from "./config";

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
  try {
    return (await res.json()) as T;
  } catch {
    // A waking or misrouted server can answer 200 with an HTML page: that is an upstream fault, not a crash.
    throw new BackendError("The history server sent something that isn't JSON", 502);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_GW = 38;

/** The list changes once per gameweek; the daily safety refresh covers snapshots stored outside the cron. */
/** Entries without a real gameweek (1-38) are dropped, a gameweek listed twice keeps its first entry; oldest first. */
export async function listSnapshots(leagueId: number): Promise<SnapshotSummary[]> {
  const body = await get<unknown>(`/history/${leagueId}`, {
    revalidate: 86_400,
    tags: [historyTag(leagueId)],
  });
  if (!isObject(body) || (body.snapshots !== undefined && !Array.isArray(body.snapshots))) throw new BackendError("Unexpected snapshot list from the history server", 502);
  const byGw = new Map<number, SnapshotSummary>();
  for (const s of (body.snapshots as unknown[] | undefined) ?? []) {
    if (!isObject(s)) continue;
    const gw = s.gw;
    if (typeof gw !== "number" || !Number.isInteger(gw) || gw < 1 || gw > MAX_GW || byGw.has(gw)) continue;
    byGw.set(gw, { gw, taken_at: typeof s.taken_at === "string" ? s.taken_at : "", rebuilt: s.rebuilt === true });
  }
  return [...byGw.values()].sort((a, b) => a.gw - b.gw);
}

/** null when no snapshot exists for that gameweek. A stored snapshot never changes, so cache it for a year. */
export async function getSnapshot(leagueId: number, gw: number): Promise<Snapshot | null> {
  try {
    // Not `revalidate: false`: under `dynamic = "force-dynamic"` Next treats a falsy revalidate as unset
    // and skips the cache entirely (patch-fetch `noFetchConfigAndForceDynamic`). An explicit TTL is honoured.
    const body = await get<unknown>(`/history/${leagueId}/${gw}`, { revalidate: ONE_YEAR_S, tags: [historyTag(leagueId)] });
    // The fields inside are read defensively by the history service; here it only has to be a snapshot at all.
    if (!isObject(body)) throw new BackendError("Unexpected snapshot from the history server", 502);
    return body as unknown as Snapshot;
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) return null;
    throw e;
  }
}

export const historyGateway: HistoryPort = { list: listSnapshots, get: getSnapshot };
