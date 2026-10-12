/** League table rules. Pure: no I/O, no framework. */
import type { StandingRow } from "./types";

/** Positive = climbed. null when there is no previous rank (first GW / new entry). */
export function rankMovement(rank: number, lastRank: number | null | undefined): number | null {
  if (!lastRank) return null;
  return lastRank - rank;
}

export interface StandingsSummary {
  leader: { entryName: string; total: number };
  /** Highest score this gameweek; the first row wins ties. */
  best: { entryName: string; total: number };
  managers: number;
}

/** null for an empty league. */
export function summarizeStandings(rows: StandingRow[]): StandingsSummary | null {
  if (rows.length === 0) return null;
  const leader = rows[0];
  const best = rows.reduce((b, r) => (r.event_total > b.event_total ? r : b), leader);
  return {
    leader: { entryName: leader.entry_name, total: leader.total },
    best: { entryName: best.entry_name, total: best.event_total },
    managers: rows.length,
  };
}

export type Zone = "good" | "warn" | "bad";

/**
 * Where a rank sits in the table: the top four in green, fifth and sixth in amber, the bottom four in red. A league
 * too small for the three zones to be distinct (fewer than ten managers) has none.
 */
export function zoneOf(rank: number, managers: number): Zone | undefined {
  if (managers < 10) return undefined;
  if (rank <= 4) return "good";
  if (rank <= 6) return "warn";
  if (rank > managers - 4) return "bad";
  return undefined;
}
