/** League table rules. Pure: no I/O, no framework. */
import type { StandingRow } from "./types";

// Bidi embeddings/overrides/isolates and C0/C1 control characters: invisible, and a name can use them to reorder or
// disguise the text around it ("Evil\u202Egnp.exe"). Emoji, accents and right-to-left letters are kept.
const UNSAFE = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const cleanText = (v: unknown): string => (typeof v === "string" ? v.replace(UNSAFE, "").trim() : "");
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The league table as FPL sent it, made safe to render: rows that aren't a manager are dropped, a manager listed twice
 * (the table moved between two page requests) keeps the first row, null or NaN numbers read as 0 and a missing name as
 * "#<entry>", and the rows are put in rank order (a missing rank is filled in from the row's position).
 */
export function cleanStandings(raw: unknown): StandingRow[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const rows: { row: StandingRow; at: number }[] = [];
  raw.forEach((r, at) => {
    if (!r || typeof r !== "object") return;
    const o = r as Record<string, unknown>;
    const entry = o.entry;
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry <= 0 || seen.has(entry)) return;
    seen.add(entry);
    const rank = typeof o.rank === "number" && Number.isInteger(o.rank) && o.rank > 0 ? o.rank : 0;
    const row: StandingRow = {
      entry,
      entry_name: cleanText(o.entry_name) || `#${entry}`,
      player_name: cleanText(o.player_name),
      rank,
      last_rank: Math.max(0, count(o.last_rank)),
      event_total: count(o.event_total),
      total: count(o.total),
    };
    if (o.club_badge_src === null || (typeof o.club_badge_src === "string" && /^https:\/\//.test(o.club_badge_src))) row.club_badge_src = o.club_badge_src;
    if (o.rank_approximate === true) row.rank_approximate = true;
    if (o.last_rank_approximate === true) row.last_rank_approximate = true;
    rows.push({ row, at });
  });
  // Ranked rows in rank order (ties keep FPL's order); unranked ones after them, in the order they came.
  rows.sort((a, b) => (a.row.rank || Infinity) - (b.row.rank || Infinity) || a.at - b.at);
  return rows.map(({ row }, i) => (row.rank ? row : { ...row, rank: i + 1 }));
}

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** A right-to-left name inside a sentence goes in a bidi isolate, so it can't reorder the words around it. */
export const isolateName = (name: string): string => (RTL.test(name) ? `\u2068${name}\u2069` : name);

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
