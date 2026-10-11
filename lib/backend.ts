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

async function get<T>(path: string, revalidate: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate },
    });
  } catch {
    throw new BackendError("The history server did not respond in time", 504);
  }
  if (!res.ok) throw new BackendError(`History server responded ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function listSnapshots(leagueId: number): Promise<SnapshotSummary[]> {
  const body = await get<{ snapshots?: SnapshotSummary[] }>(`/history/${leagueId}`, 300);
  return [...(body.snapshots ?? [])].sort((a, b) => a.gw - b.gw);
}

/** null when no snapshot exists for that gameweek. */
export async function getSnapshot(leagueId: number, gw: number): Promise<Snapshot | null> {
  try {
    return await get<Snapshot>(`/history/${leagueId}/${gw}`, 3600);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) return null;
    throw e;
  }
}
