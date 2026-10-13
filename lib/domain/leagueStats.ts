/**
 * Fun, factual extras for the league table, worked out from every manager's own season history. Pure: no I/O.
 * Nothing here is estimated: each figure is a count or sum of numbers FPL published, or a plain comparison of them.
 *
 * "Net" points are a gameweek's points after any transfer hit (FPL's `points` is before the hit).
 */
import type { GwStatus } from "./gameweek";
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
  /** Consecutive latest gameweeks above (hot) or below (cold) the league's average; length 1 is just this week. Null only when exactly level. */
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
  return { kind: first > 0 ? "hot" : "cold", length };
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

  const hot = best(all.filter((s) => s.streak?.kind === "hot" && s.streak.length >= 2).map((s) => ({ entry: s.entry, value: s.streak!.length }))); // "on a roll" needs a run, not one good week
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

// ------------------------------------------------------------------------------------------------ talking points

/**
 * Where the extras' week stands against FPL's current gameweek: "provisional" or "final" when the extras are about the
 * current gameweek (FPL's `data_checked` decides which), "live" when they are about the last finished week because a
 * later one is being played.
 */
export type StatsPhase = "live" | "provisional" | "final";

export function statsPhase(statsGw: number, current: { id: number; status: GwStatus } | null): StatsPhase {
  if (current && current.id === statsGw) return current.status === "final" ? "final" : "provisional";
  return current && current.id > statsGw && current.status === "live" ? "live" : "final";
}

/** Something worth a headline about the league. Every figure is read straight off the table or the managers' histories. */
export type LeagueHeadline =
  | { kind: "newLeader"; entry: number; from: number }
  | { kind: "titleRace"; entry: number; other: number; gap: number }
  | { kind: "level"; entry: number; other: number }
  | { kind: "riser"; entry: number; places: number; rank: number }
  | { kind: "faller"; entry: number; places: number; rank: number }
  | { kind: "weekHigh"; entry: number; points: number; gw: number }
  | { kind: "chips"; entry: number; chip: string; count: number; points: number; gw: number }
  | { kind: "bottom"; entry: number; gap: number };

/** A move needs this many places to be news; one place is ordinary churn. */
const NEWS_MOVE = 2;

/**
 * The league's storylines, most newsworthy first: a new leader always leads, the rest are equally good candidates for
 * the view to rotate through. `rows` is the table as FPL has it now (it moves during a live gameweek); `stats` covers
 * the last finished week.
 */
export function leagueHeadlines(rows: StandingRow[], stats: LeagueStats | null): LeagueHeadline[] {
  if (rows.length === 0) return [];
  const out: LeagueHeadline[] = [];
  const [leader, second] = rows;
  if (leader.last_rank > 1 && rows.length > 1) out.push({ kind: "newLeader", entry: leader.entry, from: leader.last_rank });
  if (second) out.push(leader.total === second.total ? { kind: "level", entry: leader.entry, other: second.entry } : { kind: "titleRace", entry: leader.entry, other: second.entry, gap: leader.total - second.total });

  const moved = rows.filter((r) => r.last_rank > 0).map((r) => ({ r, by: r.last_rank - r.rank }));
  const up = moved.reduce<(typeof moved)[number] | null>((a, b) => (b.by > (a?.by ?? 0) ? b : a), null);
  const down = moved.reduce<(typeof moved)[number] | null>((a, b) => (b.by < (a?.by ?? 0) ? b : a), null);
  if (up && up.by >= NEWS_MOVE && up.r.rank > 1) out.push({ kind: "riser", entry: up.r.entry, places: up.by, rank: up.r.rank });
  if (down && -down.by >= NEWS_MOVE) out.push({ kind: "faller", entry: down.r.entry, places: -down.by, rank: down.r.rank });

  if (stats?.comparable) {
    const inTable = rows.map((r) => stats.byEntry[r.entry]).filter((s): s is ManagerStats => Boolean(s));
    const top = inTable.find((s) => s.weekRank === 1 && s.weekPoints > 0);
    if (top) out.push({ kind: "weekHigh", entry: top.entry, points: top.weekPoints, gw: stats.gw });
    const chipped = inTable.flatMap((s) => s.chips.filter((c) => c.event === stats.gw).map((c) => ({ s, chip: c.name })));
    const star = chipped.reduce<(typeof chipped)[number] | null>((a, b) => (!a || b.s.weekPoints > a.s.weekPoints ? b : a), null);
    if (star) out.push({ kind: "chips", entry: star.s.entry, chip: star.chip, count: chipped.length, points: star.s.weekPoints, gw: stats.gw });
  }

  if (rows.length >= 4) {
    const last = rows[rows.length - 1];
    const above = rows[rows.length - 2];
    out.push({ kind: "bottom", entry: last.entry, gap: Math.max(0, above.total - last.total) });
  }
  return out;
}

/** Points between first and second, or null with fewer than two managers. */
export const leaderGap = (rows: StandingRow[]): number | null => (rows.length > 1 ? Math.max(0, rows[0].total - rows[1].total) : null);

/** One thing worth saying about a single manager's season, from their own numbers. */
export type Angle =
  | { kind: "chase"; points: number }
  | { kind: "overallUp"; places: number }
  | { kind: "overallDown"; places: number }
  | { kind: "peak"; points: number; gw: number }
  | { kind: "low"; points: number; gw: number }
  | { kind: "bench"; points: number }
  | { kind: "clean"; transfers: number };

/** Close enough to the team above that one good captain closes it. */
export const CHASE_GAP = 12;
export const BENCH_ANGLE = 15;

/** The talking points that apply to a manager for gameweek `gw` (the latest finished one). The view features one. */
export function anglesFor(s: ManagerStats, gw: number): Angle[] {
  const out: Angle[] = [];
  if (s.behindNext !== null && s.behindNext > 0 && s.behindNext <= CHASE_GAP) out.push({ kind: "chase", points: s.behindNext });
  if (s.overallMoved) out.push(s.overallMoved > 0 ? { kind: "overallUp", places: s.overallMoved } : { kind: "overallDown", places: -s.overallMoved });
  if (s.form.length >= 3 && s.best.gw === gw) out.push({ kind: "peak", points: s.best.points, gw });
  else if (s.form.length >= 3 && s.worst.gw === gw) out.push({ kind: "low", points: s.worst.points, gw });
  if (s.benchPoints >= BENCH_ANGLE) out.push({ kind: "bench", points: s.benchPoints });
  if (s.hitPoints === 0 && s.transfers >= 3) out.push({ kind: "clean", transfers: s.transfers });
  return out;
}

/** What a sentence about an award may say: the figure already formatted, plus plain numbers a language needs. */
export interface AwardCopy {
  name: string;
  /** The award's figure, formatted ("62 points", "3 weeks", "£100.4m"). */
  figure: string;
  /** "in GW5" or "this week". */
  when: string;
  /** The winner's place in the table now. */
  place: number;
}

/** What a headline may say. Fields a headline doesn't use are empty. */
export interface StoryCopy {
  name: string;
  /** A second team (the chaser in a title race). */
  other: string;
  n: number;
  /** `n` formatted with its unit ("12 points", "3 places"). */
  figure: string;
  gw: number;
  place: number;
  chip: string;
}

/** What a talking point may say. */
export interface AngleCopy {
  figure: string;
  n: number;
  gw: number;
}
