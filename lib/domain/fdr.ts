/**
 * Fixture difficulty (FDR) matrix. Pure: no I/O, no framework.
 *
 * Differences from the original Vue page, both deliberate:
 * - A double gameweek shows both matches and counts as their mean (the original showed only the first).
 * - Teams are ranked over the window being shown (3, 5 or 10), not always over the next 5.
 */
import type { FplEvent, FplTeam, ScheduledFixture } from "./types";

/** Windows the fixtures page offers: the next 3, 5 or 10 gameweeks. */
export const FDR_WINDOWS = [3, 5, 10] as const;
export type FdrWindow = (typeof FDR_WINDOWS)[number];
export const DEFAULT_FDR_WINDOW: FdrWindow = 5;

/** A difficulty FPL didn't give (missing or out of range) is read as this middle value. */
export const NEUTRAL_DIFFICULTY = 3;

/**
 * A blank gameweek counts as this, the hardest rating: a week without a match scores nothing, so it can never make a
 * run look easier. Rotation pairs and fixture swings use the same rule. A gameweek where nobody is scheduled yet isn't
 * a blank and isn't counted at all.
 */
export const BLANK_DIFFICULTY = 5;

export type FdrBand = 1 | 2 | 3 | 4 | 5;

export function parseFdrWindow(raw: string | string[] | undefined): FdrWindow {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (FDR_WINDOWS as readonly number[]).includes(value) ? (value as FdrWindow) : DEFAULT_FDR_WINDOW;
}

/** Clamp an FPL difficulty (1-5) into a band; anything unexpected is treated as neutral. */
export function fdrBand(difficulty: number): FdrBand {
  const rounded = Math.round(difficulty);
  return rounded >= 1 && rounded <= 5 ? (rounded as FdrBand) : (NEUTRAL_DIFFICULTY as FdrBand);
}

/**
 * Where the matrix starts by default. Given `now`, the gameweek of the next deadline: a gameweek already under way is
 * locked, so planning starts after it. Without `now`, or once no deadline is left, the current gameweek (or the next
 * one if the current one is over).
 */
export function defaultFdrStart(events: FplEvent[], now?: Date): number | null {
  if (events.length === 0) return null;
  if (now) {
    const t = now.getTime();
    const next = events
      .filter((e) => Date.parse(e.deadline_time) > t)
      .sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0];
    if (next) return next.id;
  }
  const current = events.findIndex((e) => e.is_current);
  if (current !== -1) {
    const event = events[current];
    return event.finished ? (events[current + 1]?.id ?? event.id) : event.id;
  }
  // Season over (nothing current, nothing left to play): stay on the last gameweek rather than jumping back to GW1.
  return (events.find((e) => !e.finished) ?? events[events.length - 1]).id;
}

export interface FdrMatch {
  opponentId: number;
  home: boolean;
  difficulty: number;
}

export interface FdrCell {
  gw: number;
  /** Empty for a blank gameweek, two for a double. */
  matches: FdrMatch[];
}

export interface FdrRow {
  teamId: number;
  cells: FdrCell[];
  /** Sum of each gameweek's difficulty (a double counts as the average of its two). Lower = easier. */
  score: number;
  /** `score` per scheduled gameweek: the figure rows are ranked by, so what is shown matches the order. A blank counts as 5. */
  average: number;
}

export interface FdrMatrix {
  start: number;
  window: number;
  gameweeks: number[];
  /** Easiest run first. */
  rows: FdrRow[];
}

/** FPL difficulty if it is a usable 1-5 rating; missing, null or out-of-range ratings count as neutral. */
const rating = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5 ? value : NEUTRAL_DIFFICULTY;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One gameweek's difficulty for a club: a double is the mean of its two, a blank the hardest. */
const cellDifficulty = (c: FdrCell) => (c.matches.length ? mean(c.matches.map((m) => m.difficulty)) : BLANK_DIFFICULTY);

/** Each club's matches in one gameweek (empty = blank, two = double), keyed by FPL team id. */
export function matchesByTeam(fixtures: ScheduledFixture[], gw: number): Map<number, FdrMatch[]> {
  const byTeam = new Map<number, FdrMatch[]>();
  const add = (teamId: number, match: FdrMatch) => byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), match]);
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    add(f.team_h, { opponentId: f.team_a, home: true, difficulty: rating(f.team_h_difficulty) });
    add(f.team_a, { opponentId: f.team_h, home: false, difficulty: rating(f.team_a_difficulty) });
  }
  return byTeam;
}

/**
 * Team x gameweek difficulty, sorted easiest-first over the visible window.
 * Returns null if `start` isn't a known gameweek.
 */
export function buildFdrMatrix(
  events: FplEvent[],
  teams: FplTeam[],
  fixtures: ScheduledFixture[],
  start: number,
  window: number,
): FdrMatrix | null {
  const from = events.findIndex((e) => e.id === start);
  if (from === -1) return null;
  const gameweeks = events.slice(from, from + window).map((e) => e.id);

  const byGw = new Map(gameweeks.map((gw) => [gw, matchesByTeam(fixtures, gw)]));
  // Only gameweeks with at least one fixture count: an unscheduled week is unknown, not a blank for everyone.
  const scheduled = new Set(gameweeks.filter((gw) => (byGw.get(gw)?.size ?? 0) > 0));

  const rows = teams.map<FdrRow>((team) => {
    const cells = gameweeks.map<FdrCell>((gw) => ({ gw, matches: byGw.get(gw)?.get(team.id) ?? [] }));
    const counted = cells.filter((c) => scheduled.has(c.gw));
    const score = counted.reduce((sum, c) => sum + cellDifficulty(c), 0);
    return { teamId: team.id, cells, score, average: counted.length ? score / counted.length : NEUTRAL_DIFFICULTY };
  });

  const name = new Map(teams.map((t) => [t.id, t.short_name || t.name]));
  rows.sort((a, b) => a.score - b.score || String(name.get(a.teamId)).localeCompare(String(name.get(b.teamId))));
  return { start, window, gameweeks, rows };
}

export interface FdrRun {
  teamId: number;
  /** Difficulty per gameweek over the stretch (a blank counts as 5). */
  average: number;
}

export interface FdrHighlights {
  easiest: FdrRun;
  toughest: FdrRun;
  /** The club whose fixtures ease the most from the first half of the window to the second, if it eases by a full point. */
  swing: { teamId: number; before: number; after: number; from: number } | null;
  /** The first gameweek in the window with a double, and who has it. */
  double: { gw: number; teams: number[] } | null;
  /** The first gameweek in the window with a blank, and who has it. */
  blank: { gw: number; teams: number[] } | null;
}

/** The facts worth a sentence in a difficulty matrix: best and worst run, the biggest swing, the first double and blank. */
export function fdrHighlights(matrix: FdrMatrix): FdrHighlights | null {
  const { rows, gameweeks } = matrix;
  if (rows.length === 0 || gameweeks.length === 0) return null;
  const split = Math.floor(gameweeks.length / 2);
  // As in the ranking, a gameweek nobody is scheduled in yet is left out of both halves.
  const scheduled = gameweeks.map((_, i) => rows.some((r) => r.cells[i].matches.length > 0));
  const half = (row: FdrRow, from: number, to: number) => {
    const cells = row.cells.slice(from, to).filter((_, i) => scheduled[from + i]);
    return cells.length ? mean(cells.map(cellDifficulty)) : null;
  };
  let swing: FdrHighlights["swing"] = null;
  if (split > 0) {
    for (const row of rows) {
      const before = half(row, 0, split);
      const after = half(row, split, gameweeks.length);
      if (before === null || after === null) continue;
      if (before - after >= 1 && (!swing || before - after > swing.before - swing.after)) swing = { teamId: row.teamId, before, after, from: gameweeks[split] };
    }
  }
  const first = (pick: (c: FdrCell) => boolean): { gw: number; teams: number[] } | null => {
    for (let i = 0; i < gameweeks.length; i++) {
      const teams = rows.filter((r) => pick(r.cells[i])).map((r) => r.teamId);
      // A gameweek where nobody plays yet (not scheduled) is not a blank worth flagging.
      if (teams.length > 0 && teams.length < rows.length) return { gw: gameweeks[i], teams };
    }
    return null;
  };
  const last = rows[rows.length - 1];
  return {
    easiest: { teamId: rows[0].teamId, average: rows[0].average },
    toughest: { teamId: last.teamId, average: last.average },
    swing,
    double: first((c) => c.matches.length >= 2),
    blank: first((c) => c.matches.length === 0),
  };
}
