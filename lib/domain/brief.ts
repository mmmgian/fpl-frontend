/**
 * The facts behind the changing copy on Tools, History and The Times: where the season is (which gameweek, in what
 * phase, which deadline is next), who the crowd is buying and selling, and what a saved table says. Pure: no I/O.
 *
 * Only the wording varies (see `varietyKey` / `pickVariant`); every fact here comes straight from FPL's numbers.
 */
import { currentEvent, gwStatus, varietyKey, type GwStatus } from "./gameweek";
import { rankMovement } from "./standings";
import type { PriceRow } from "./tools";
import type { Bootstrap, FplEvent, StandingRow } from "./types";

/** `upcoming`: before the season's first deadline. `over`: the last gameweek is final and no deadline is left. */
export type SeasonPhase = "upcoming" | "live" | "provisional" | "final" | "over";

export interface GwPhase {
  phase: SeasonPhase;
  /** The current (or latest finished) gameweek; null before the season. */
  gw: number | null;
  /** The next deadline's gameweek; null once the season is over. */
  next: number | null;
  /** The average manager's score for `gw`, once it has been played. */
  average: number | null;
  /** The salt for this visit's wording: changes every UTC day and whenever the phase moves on. */
  variety: number;
}

/** Where the season stands at `now`, from FPL's events (`finished`, then `data_checked` for final). */
export function gwPhase(events: FplEvent[], now: Date): GwPhase {
  const current = currentEvent(events);
  const nextEvent = events.find((e) => new Date(e.deadline_time) > now) ?? null;
  const status: GwStatus = current ? gwStatus(current, now) : "upcoming";
  const phase: SeasonPhase = !current || status === "upcoming" ? "upcoming" : status === "final" && !nextEvent ? "over" : status;
  const gw = current && status !== "upcoming" ? current.id : null;
  const average = current?.finished && (current.average_entry_score ?? 0) > 0 ? (current.average_entry_score ?? null) : null;
  return { phase, gw, next: nextEvent?.id ?? null, average, variety: varietyKey(gw ?? nextEvent?.id ?? 0, status, now) };
}

export interface Mover {
  name: string;
  club: string;
  /** Transfers in (or out) this gameweek, all of FPL. */
  count: number;
}

export interface TransferPulse {
  bought: Mover | null;
  sold: Mover | null;
  /** Players our estimate calls likely to rise / fall tonight, and the one with the most pressure each way. */
  rising: number;
  falling: number;
  topRiser: string | null;
  topFaller: string | null;
}

/** The crowd's week: most bought, most sold and the price pressure, from bootstrap and the price rows. */
export function transferPulse(bootstrap: Pick<Bootstrap, "elements" | "teams">, prices: PriceRow[]): TransferPulse {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const top = (count: (e: Bootstrap["elements"][number]) => number): Mover | null => {
    let best: Bootstrap["elements"][number] | null = null;
    for (const e of bootstrap.elements) if (count(e) > 0 && (!best || count(e) > count(best) || (count(e) === count(best) && e.id < best.id))) best = e;
    return best ? { name: best.web_name, club: clubs.get(best.team) ?? "—", count: count(best) } : null;
  };
  const rising = prices.filter((p) => p.status === "likelyRise").sort((a, b) => b.net - a.net || a.id - b.id);
  const falling = prices.filter((p) => p.status === "likelyFall").sort((a, b) => a.net - b.net || a.id - b.id);
  return {
    bought: top((e) => e.transfers_in_event ?? 0),
    sold: top((e) => e.transfers_out_event ?? 0),
    rising: rising.length,
    falling: falling.length,
    topRiser: rising[0]?.name ?? null,
    topFaller: falling[0]?.name ?? null,
  };
}

export interface SnapshotFacts {
  leader: { name: string; total: number };
  /** Points between first and second; null with one manager. */
  gap: number | null;
  /** The gameweek's top scorer in the league (first row wins ties). */
  best: { name: string; points: number };
  /** The biggest rise and fall in rank over the gameweek; null when nobody moved that way. */
  climber: { name: string; places: number } | null;
  faller: { name: string; places: number } | null;
}

/** What a saved table says at a glance. null for an empty table. */
export function snapshotFacts(unordered: StandingRow[]): SnapshotFacts | null {
  if (unordered.length === 0) return null;
  // The leader and the gap are read off rank order, whatever order the rows were stored in (ties keep their order).
  const rows = [...unordered].sort((a, b) => a.rank - b.rank);
  const leader = rows[0];
  const best = rows.reduce((b, r) => (r.event_total > b.event_total ? r : b), leader);
  let climber: SnapshotFacts["climber"] = null;
  let faller: SnapshotFacts["faller"] = null;
  for (const r of rows) {
    const move = rankMovement(r.rank, r.last_rank);
    if (move === null || move === 0) continue;
    if (move > 0 && (!climber || move > climber.places)) climber = { name: r.entry_name, places: move };
    if (move < 0 && (!faller || -move > faller.places)) faller = { name: r.entry_name, places: -move };
  }
  return {
    leader: { name: leader.entry_name, total: leader.total },
    gap: rows.length > 1 ? leader.total - rows[1].total : null,
    best: { name: best.entry_name, points: best.event_total },
    climber,
    faller,
  };
}

/** The history shelf's context: the newest saved table, and whether a finished gameweek is still waiting to be filed. */
export interface ShelfStatus {
  /** The newest saved gameweek (the latest final table we hold); null when none. */
  latest: number | null;
  /** The current gameweek and its phase, when FPL could be read. */
  gw: number | null;
  phase: SeasonPhase | null;
  /** True when the current gameweek is finished but its table is not on the shelf yet. */
  pending: boolean;
}

export function shelfStatus(saved: number[], phase: GwPhase | null): ShelfStatus {
  const latest = saved.length ? Math.max(...saved) : null;
  const gw = phase?.gw ?? null;
  const done = phase?.phase === "final" || phase?.phase === "provisional" || phase?.phase === "over";
  return { latest, gw, phase: phase?.phase ?? null, pending: done && gw !== null && (latest ?? 0) < gw };
}
