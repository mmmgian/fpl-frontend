import type { GwPhase, StandingRow } from "../domain";
import { cleanStandings, gwPhase, shelfStatus, snapshotFacts, varietyKey } from "../domain";
import type { HistoryShelfModel, SnapshotListItem, SnapshotModel } from "./models";
import { withAvatars } from "./avatars";
import type { AvatarPort, FplPort, HistoryPort } from "./ports";

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

interface HistoryOptions {
  replaceBadges?: boolean;
  /** FPL, for where the season stands (is the latest gameweek final, and filed yet?). Optional: without it the shelf just lists. */
  fpl?: Pick<FplPort, "bootstrap">;
  now?: () => Date;
}

/** Use case: browse the league table as it stood at the end of past gameweeks. */
export function createHistoryService(history: HistoryPort, avatars?: AvatarPort, { replaceBadges = false, fpl, now = () => new Date() }: HistoryOptions = {}) {
  const list = async (leagueId: number): Promise<SnapshotListItem[]> => {
    const snapshots = await history.list(leagueId);
    return [...snapshots].reverse().map((s) => ({ gw: s.gw, takenAt: s.taken_at, rebuilt: s.rebuilt === true }));
  };
  return {
    /** Wake the history server ahead of the visitor's next click. Best effort: never throws. */
    async warm(): Promise<void> {
      try {
        await history.warm?.();
      } catch {}
    },

    /** Newest first. */
    list,

    /**
     * The shelf under The Times: the snapshots plus where the season stands, so the page can say which table is the latest
     * final one and whether a finished gameweek is still waiting to be filed. Neither source is allowed to break the other.
     */
    async shelf(leagueId: number): Promise<HistoryShelfModel> {
      const at = now();
      const [snapshots, phase] = await Promise.all([
        list(leagueId).catch(() => null),
        fpl ? fpl.bootstrap().then((b) => gwPhase(b.events, at), () => null) : Promise.resolve<GwPhase | null>(null),
      ]);
      const status = shelfStatus((snapshots ?? []).map((s) => s.gw), phase);
      return { snapshots, status, variety: phase?.variety ?? varietyKey(status.latest ?? 0, "final", at) };
    },

    /** null if that gameweek hasn't been snapshotted. */
    async snapshot(leagueId: number, gw: number): Promise<SnapshotModel | null> {
      const snap = await history.get(leagueId, gw);
      if (!snap) return null;
      // Stored years ago by whatever FPL sent then: cleaned like a live table (names, numbers, rank order).
      const data = snap.data && typeof snap.data === "object" ? snap.data : null;
      const rows = withAvatars(cleanStandings(data?.standings?.results), avatars, { replaceBadges });
      const leagueName = data?.league?.name;
      return {
        gw,
        // No English stand-in: the view titles a nameless table in the page's language.
        leagueName: typeof leagueName === "string" && leagueName.trim() ? leagueName : null,
        takenAt: typeof snap.taken_at === "string" ? snap.taken_at : "",
        rows,
        rebuilt: rebuiltNote(snap.data?.reconstructed, rows),
        facts: snapshotFacts(rows),
        // A saved table never changes, so only the day moves its wording on.
        variety: varietyKey(gw, "final", now()),
      };
    },
  };
}
