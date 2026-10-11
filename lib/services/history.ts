import type { SnapshotListItem, SnapshotModel } from "./models";
import type { HistoryPort } from "./ports";

/** Use case: browse the league table as it stood at the end of past gameweeks. */
export function createHistoryService(history: HistoryPort) {
  return {
    /** Newest first. */
    async list(leagueId: number): Promise<SnapshotListItem[]> {
      const snapshots = await history.list(leagueId);
      return [...snapshots].reverse().map((s) => ({ gw: s.gw, takenAt: s.taken_at }));
    },

    /** null if that gameweek hasn't been snapshotted. */
    async snapshot(leagueId: number, gw: number): Promise<SnapshotModel | null> {
      const snap = await history.get(leagueId, gw);
      if (!snap) return null;
      return {
        gw,
        leagueName: snap.data?.league?.name ?? "League",
        takenAt: snap.taken_at,
        rows: snap.data?.standings?.results ?? [],
      };
    },
  };
}
