import type { StandingRow } from "../domain";
import type { SnapshotListItem, SnapshotModel } from "./models";
import { withAvatars } from "./avatars";
import type { AvatarPort, HistoryPort } from "./ports";

/**
 * The provenance note for a rebuilt table. The data comes from our own backend but is still read defensively:
 * a malformed note means "not rebuilt", and never breaks the page.
 */
function rebuiltNote(raw: unknown, rows: StandingRow[]): SnapshotModel["rebuilt"] {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { built_at?: unknown; unresolved_ties?: unknown };
  if (typeof r.built_at !== "string") return null;
  const name = new Map(rows.map((row) => [row.entry, row.entry_name]));
  const level = (Array.isArray(r.unresolved_ties) ? r.unresolved_ties : []).flatMap((g: unknown) => {
    const group = g as { total?: unknown; entries?: unknown };
    if (typeof group?.total !== "number" || !Array.isArray(group.entries)) return [];
    const names = group.entries.flatMap((e) => (typeof e === "number" && name.has(e) ? [name.get(e)!] : []));
    return names.length > 1 ? [{ total: group.total, names }] : [];
  });
  return { builtAt: r.built_at, level, movementApproximate: rows.some((row) => row.last_rank > 0 && (row.rank_approximate === true || row.last_rank_approximate === true)) };
}

/** Use case: browse the league table as it stood at the end of past gameweeks. */
export function createHistoryService(history: HistoryPort, avatars?: AvatarPort) {
  return {
    /** Newest first. */
    async list(leagueId: number): Promise<SnapshotListItem[]> {
      const snapshots = await history.list(leagueId);
      return [...snapshots].reverse().map((s) => ({ gw: s.gw, takenAt: s.taken_at, rebuilt: s.rebuilt === true }));
    },

    /** null if that gameweek hasn't been snapshotted. */
    async snapshot(leagueId: number, gw: number): Promise<SnapshotModel | null> {
      const snap = await history.get(leagueId, gw);
      if (!snap) return null;
      const rows = withAvatars(snap.data?.standings?.results ?? [], avatars);
      return {
        gw,
        leagueName: snap.data?.league?.name ?? "League",
        takenAt: snap.taken_at,
        rows,
        rebuilt: rebuiltNote(snap.data?.reconstructed, rows),
      };
    },
  };
}
