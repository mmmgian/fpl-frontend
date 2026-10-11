/**
 * Fun, factual extras for the league table, worked out from every manager's own season history. Pure: no I/O.
 * Nothing here is estimated: each figure is a count or sum of numbers FPL published, or a plain comparison of them.
 *
 * "Net" points are a gameweek's points after any transfer hit (FPL's `points` is before the hit).
 */
import type { SquadWeek } from "./squadStats";
import type { EntryHistory, HistoryChip, HistoryGameweek, StandingRow } from "./types";

export const FORM_LENGTH = 6;
/** More managers than this and the table skips the extras: that many history requests per page view isn't reasonable. */
export const MAX_STATS_MANAGERS = 60;
export const MIN_AWARD_MANAGERS = 3;
/** "Best in the league" needs most of the league to have been counted, not just three managers. */
export const MIN_AWARD_COVERAGE = 0.75;

export interface ManagerStats {
  entry: number;
  /** Net points of the latest gameweeks, oldest first (at most FORM_LENGTH). */
  form: number[];
  formGws: number[];
  /** Season average per gameweek, after hits. */
  average: number;
  best: { gw: number; points: number };
  worst: { gw: number; points: number };
  /** Consecutive latest gameweeks above (hot) or below (cold) the league's average, if at least two. */
  streak: { kind: "hot" | "cold"; length: number } | null;
  /** Points given away in hits this season (positive number). */
  hitPoints: number;
  transfers: number;
  benchPoints: number;
  /** Team value in tenths of £m: the squad plus the bank, as the team page reports it (FPL's own `value` excludes the bank). */
  value: number;
  /** Of which cash in the bank, in tenths of £m. */
  bank: number;
  chips: HistoryChip[];
  /** League rank for the latest gameweek, 1 = best, ties share a rank. */
  weekRank: number;
  /** Net points in the latest gameweek. */
  weekPoints: number;
  /** FPL overall rank now, and how many places it moved since the previous gameweek (positive = better). */
  overallRank: number | null;
  overallMoved: number | null;
  /** Points behind the league leader, and behind the manager one place above (null for the leader). */
  behindLeader: number;
  behindNext: number | null;
}

export type AwardKey = "weekWinner" | "hotStreak" | "climber" | "rollercoaster" | "benchDisaster" | "hitMachine" | "deepPockets" | "woodenSpoon";

export interface Award {
  key: AwardKey;
  entry: number;
  /** The number behind it: points, places, gameweeks or tenths of £m, depending on the award. */
  value: number;
  /** How many other managers share this exact figure. */
  tiedWith: number;
}

export interface LeagueStats {
  /** The latest gameweek anyone has played. */
  gw: number;
  /** Enough managers have data for "best", "hot" and "cold" to mean something. Below this, show facts only. */
  comparable: boolean;
  byEntry: Record<number, ManagerStats>;
  awards: Award[];
  /** What each manager's XI did in `gw`, where that could be fetched (it takes a request per manager, so it may be missing). */
  squad?: Record<number, SquadWeek>;
}

export const netPoints = (g: Pick<HistoryGameweek, "points" | "event_transfers_cost">) => g.points - g.event_transfers_cost;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdDev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Each gameweek's league-wide average net score, over the managers who played it. */
function weeklyAverages(histories: Map<number, EntryHistory>): Map<number, number> {
  const scores = new Map<number, number[]>();
  for (const h of histories.values()) for (const g of h.current) (scores.get(g.event) ?? scores.set(g.event, []).get(g.event)!).push(netPoints(g));
  return new Map([...scores].map(([gw, xs]) => [gw, mean(xs)]));
}

function streakOf(gws: HistoryGameweek[], averages: Map<number, number>): ManagerStats["streak"] {
  const newestFirst = [...gws].sort((a, b) => b.event - a.event);
  const side = (g: HistoryGameweek) => Math.sign(netPoints(g) - (averages.get(g.event) ?? 0));
  const first = newestFirst[0] ? side(newestFirst[0]) : 0;
  if (first === 0) return null;
  let length = 0;
  for (const g of newestFirst) {
    if (side(g) !== first) break;
    length++;
  }
  return length >= 2 ? { kind: first > 0 ? "hot" : "cold", length } : null;
}

/** Competition ranking: 1 for the best, equal scores share a rank and the next rank is skipped. */
function competitionRanks(values: Map<number, number>): Map<number, number> {
  const sorted = [...values.values()].sort((a, b) => b - a);
  return new Map([...values].map(([k, v]) => [k, sorted.indexOf(v) + 1]));
}

/**
 * Stats for every manager who has a history, plus the awards. `rows` is the league table (best first); managers
 * without a history are skipped, not guessed at. Returns null when nobody has played yet.
 */
export function leagueStats(rows: StandingRow[], histories: Map<number, EntryHistory>, settledThrough: number = Infinity): LeagueStats | null {
  // A gameweek in progress has half-scored teams, so every statistic runs through the last one that is over.
  const settled = (h: EntryHistory): EntryHistory => ({ ...h, current: h.current.filter((g) => g.event <= settledThrough) });
  const have = rows.filter((r) => histories.has(r.entry) && settled(histories.get(r.entry)!).current.length > 0);
  if (have.length === 0) return null;

  const usable = new Map(have.map((r) => [r.entry, settled(histories.get(r.entry)!)]));
  const averages = weeklyAverages(usable);
  const gw = Math.max(...[...usable.values()].flatMap((h) => h.current.map((g) => g.event)));

  const weekScores = new Map<number, number>();
  for (const [entry, h] of usable) {
    const g = h.current.find((x) => x.event === gw);
    if (g) weekScores.set(entry, netPoints(g));
  }
  const weekRanks = competitionRanks(weekScores);

  const leader = rows[0];
  const byEntry: Record<number, ManagerStats> = {};
  for (const row of have) {
    const h = usable.get(row.entry)!;
    const gws = [...h.current].sort((a, b) => a.event - b.event);
    const nets = gws.map(netPoints);
    const last = gws[gws.length - 1];
    const before = gws.length > 1 ? gws[gws.length - 2] : null;
    const bestIdx = nets.indexOf(Math.max(...nets));
    const worstIdx = nets.indexOf(Math.min(...nets));
    const above = rows[rows.indexOf(row) - 1];
    const boosted = new Set(h.chips.filter((c) => c.name === "bboost").map((c) => c.event));
    byEntry[row.entry] = {
      entry: row.entry,
      form: nets.slice(-FORM_LENGTH),
      formGws: gws.slice(-FORM_LENGTH).map((g) => g.event),
      average: mean(nets),
      best: { gw: gws[bestIdx].event, points: nets[bestIdx] },
      worst: { gw: gws[worstIdx].event, points: nets[worstIdx] },
      streak: streakOf(gws, averages),
      hitPoints: gws.reduce((s, g) => s + g.event_transfers_cost, 0),
      transfers: gws.reduce((s, g) => s + g.event_transfers, 0),
      // Under Bench Boost the bench's points count towards the score, so they were not wasted.
      benchPoints: gws.filter((g) => !boosted.has(g.event)).reduce((s, g) => s + g.points_on_bench, 0),
      value: last.value + last.bank,
      bank: last.bank,
      chips: [...h.chips].sort((a, b) => a.event - b.event),
      weekRank: weekRanks.get(row.entry) ?? 0,
      weekPoints: last.event === gw ? netPoints(last) : 0,
      overallRank: last.overall_rank,
      overallMoved: before && last.overall_rank != null && before.overall_rank != null ? before.overall_rank - last.overall_rank : null,
      behindLeader: Math.max(0, leader.total - row.total),
      behindNext: above ? Math.max(0, above.total - row.total) : null,
    };
  }

  const comparable = have.length >= MIN_AWARD_MANAGERS && have.length >= Math.ceil(rows.length * MIN_AWARD_COVERAGE);
  return { gw, comparable, byEntry, awards: comparable ? awards(rows, byEntry, usable) : [] };
}

type Candidate = { entry: number; value: number };

/** The winner of one award: the highest (or lowest) figure, the earliest in the table on a tie. */
function best(candidates: Candidate[], higherIsBetter = true): { entry: number; value: number; tiedWith: number } | null {
  if (candidates.length === 0) return null;
  const top = candidates.reduce((a, b) => (higherIsBetter ? (b.value > a.value ? b : a) : b.value < a.value ? b : a));
  return { ...top, tiedWith: candidates.filter((c) => c.value === top.value).length - 1 };
}

function awards(rows: StandingRow[], stats: Record<number, ManagerStats>, histories: Map<number, EntryHistory>): Award[] {
  const inTable = rows.filter((r) => stats[r.entry]); // table order breaks ties
  const all = inTable.map((r) => stats[r.entry]);
  const out: Award[] = [];
  const add = (key: AwardKey, pick: ReturnType<typeof best>) => pick && out.push({ key, ...pick });

  // Only managers who actually played the latest gameweek can win or lose it (weekRank 0 means they didn't).
  const played = all.filter((s) => s.weekRank > 0).map((s) => ({ entry: s.entry, value: s.weekPoints }));
  add("weekWinner", best(played));
  add("woodenSpoon", played.length > 1 ? best(played, false) : null);

  const hot = best(all.filter((s) => s.streak?.kind === "hot").map((s) => ({ entry: s.entry, value: s.streak!.length })));
  add("hotStreak", hot);

  const climb = best(inTable.filter((r) => r.last_rank > 0).map((r) => ({ entry: r.entry, value: r.last_rank - r.rank })).filter((p) => p.value > 0));
  add("climber", climb);

  const swing = best(
    inTable
      .map((r) => ({ entry: r.entry, nets: histories.get(r.entry)!.current.map(netPoints) }))
      .filter((p) => p.nets.length >= 4)
      .map((p) => ({ entry: p.entry, value: Math.round(stdDev(p.nets) * 10) / 10 })),
  );
  add("rollercoaster", swing);

  add("benchDisaster", positive(best(all.map((s) => ({ entry: s.entry, value: s.benchPoints })))));
  add("hitMachine", positive(best(all.map((s) => ({ entry: s.entry, value: s.hitPoints })))));
  add("deepPockets", best(all.map((s) => ({ entry: s.entry, value: s.value }))));      // squad plus bank
  return out;
}

const positive = <T extends { value: number } | null>(p: T): T | null => (p && p.value > 0 ? p : null);
