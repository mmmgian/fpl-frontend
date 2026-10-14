/** Bonus points (BPS -> bonus) and fixture state. Pure: no I/O, no framework. */
import type { Fixture } from "./types";

export type FixtureState = "upcoming" | "live" | "provisional" | "final";

export function fixtureState(f: Fixture): FixtureState {
  if (f.finished) return "final";
  if (f.finished_provisional) return "provisional";
  if (f.started) return "live";
  return "upcoming";
}

/** Kick-off order; fixtures without a time (postponed) go last, ties broken by id. */
export const compareByKickoff = (a: Fixture, b: Fixture) => {
  // A missing or unreadable time counts as "last" (a NaN here would make the sort order depend on the input order).
  const at = (f: Fixture) => {
    const t = f.kickoff_time ? Date.parse(f.kickoff_time) : Number.NaN;
    return Number.isNaN(t) ? Infinity : t;
  };
  const ta = at(a);
  const tb = at(b);
  return ta === tb ? a.id - b.id : ta < tb ? -1 : 1;
};

export const isFinished = (f: Fixture) => f.finished || f.finished_provisional;

export type BonusSource = "confirmed" | "provisional" | "projected" | "none";

export interface BonusRow {
  element: number;
  side: "h" | "a";
  bonus: number;
  bps: number | null;
}

/**
 * FPL bonus from BPS, using competition ranking across both teams:
 * rank = 1 + number of players with strictly higher BPS; rank 1 -> 3, 2 -> 2, 3 -> 1.
 * This reproduces the official tie rules (e.g. two tied first both get 3, next gets 1).
 */
export function bonusFromBps<T extends { bps: number }>(players: T[]): (T & { bonus: number })[] {
  return players
    .map((p) => {
      const rank = 1 + players.filter((q) => q.bps > p.bps).length;
      return { ...p, bonus: rank <= 3 ? 4 - rank : 0 };
    })
    .filter((p) => p.bonus > 0)
    .sort((a, b) => b.bonus - a.bonus || b.bps - a.bps);
}

/**
 * One stat for both sides. FPL's feed is not always the shape its types promise: a side can be missing or not a list,
 * entries can lack a player or a number, and a player can appear twice. Keep only usable entries, each player once.
 */
function stat(f: Fixture, id: string): { element: number; value: number; side: "h" | "a" }[] {
  const s = Array.isArray(f.stats) ? f.stats.find((x) => x?.identifier === id) : undefined;
  if (!s) return [];
  const seen = new Set<number>();
  const out: { element: number; value: number; side: "h" | "a" }[] = [];
  for (const side of ["h", "a"] as const) {
    const list: unknown = s[side];
    if (!Array.isArray(list)) continue;
    for (const v of list as { element?: unknown; value?: unknown }[]) {
      if (!v || typeof v.element !== "number" || !Number.isFinite(v.element)) continue;
      if (typeof v.value !== "number" || !Number.isFinite(v.value)) continue;
      if (seen.has(v.element)) continue;
      seen.add(v.element);
      out.push({ element: v.element, value: v.value, side });
    }
  }
  return out;
}

export function matchBonus(f: Fixture): { source: BonusSource; rows: BonusRow[] } {
  const bps = stat(f, "bps");
  const bpsOf = new Map(bps.map((b) => [b.element, b.value]));
  const official = stat(f, "bonus");

  if (official.length > 0) {
    const rows = official
      .map((b) => ({ element: b.element, side: b.side, bonus: b.value, bps: bpsOf.get(b.element) ?? null }))
      .sort((a, b) => b.bonus - a.bonus || (b.bps ?? 0) - (a.bps ?? 0));
    return { source: f.finished ? "confirmed" : "provisional", rows };
  }
  if (f.started && bps.length > 0) {
    const rows = bonusFromBps(bps.map((b) => ({ element: b.element, side: b.side, bps: b.value })));
    return { source: "projected", rows };
  }
  return { source: "none", rows: [] };
}

export interface BpsEntry {
  element: number;
  side: "h" | "a";
  bps: number;
}

/** Everyone's BPS in the match, highest first (ties keep the feed's order). */
export function bpsRanking(f: Fixture): BpsEntry[] {
  return stat(f, "bps")
    .map((b) => ({ element: b.element, side: b.side, bps: b.value }))
    .sort((a, b) => b.bps - a.bps);
}

/**
 * The players to show for one side: everyone who earned bonus, topped up with the next-best BPS so there
 * are at least `minimum` rows. (Ties can award bonus to four players of one side.)
 */
export function sideLeaders(f: Fixture, side: "h" | "a", minimum = 3, bonus: BonusRow[] = matchBonus(f).rows): (BpsEntry & { bonus: number })[] {
  const bonusOf = new Map(bonus.map((r) => [r.element, r.bonus]));
  const ranked = bpsRanking(f)
    .filter((e) => e.side === side)
    .map((e) => ({ ...e, bonus: bonusOf.get(e.element) ?? 0 }));
  const awarded = ranked.filter((e) => e.bonus > 0);
  return [...awarded, ...ranked.filter((e) => e.bonus === 0).slice(0, Math.max(0, minimum - awarded.length))];
}

export interface MatchEvent {
  element: number;
  side: "h" | "a";
  count: number;
}

export interface MatchEvents {
  goals: MatchEvent[];
  assists: MatchEvent[];
  ownGoals: MatchEvent[];
  redCards: MatchEvent[];
}

const events = (f: Fixture, id: string): MatchEvent[] =>
  stat(f, id)
    .filter((e) => e.value > 0)
    .map((e) => ({ element: e.element, side: e.side, count: e.value }));

/** Goals, assists, own goals and red cards, from the fixture's stat feed. */
export function matchEvents(f: Fixture): MatchEvents {
  return { goals: events(f, "goals_scored"), assists: events(f, "assists"), ownGoals: events(f, "own_goals"), redCards: events(f, "red_cards") };
}

export interface BonusRace {
  /** Top of the match's BPS, and the gap to second (0 = level at the top). */
  leader: BpsEntry;
  runnerUp: BpsEntry | null;
  lead: number | null;
  /** The last player inside the bonus, the first outside it, and the BPS between them. Null when nobody is outside. */
  bubble: { inside: BpsEntry; outside: BpsEntry; gap: number } | null;
}

/** How a match's bonus race stands, from its BPS feed and its bonus rows. Null before anyone has BPS. */
export function bonusRace(f: Fixture, bonus: BonusRow[] = matchBonus(f).rows): BonusRace | null {
  const ranked = bpsRanking(f);
  if (ranked.length === 0) return null;
  const awarded = new Set(bonus.filter((r) => r.bonus > 0).map((r) => r.element));
  const inside = ranked.filter((e) => awarded.has(e.element)).at(-1);
  const outside = ranked.find((e) => !awarded.has(e.element));
  const [leader, runnerUp = null] = ranked;
  return {
    leader,
    runnerUp,
    lead: runnerUp ? leader.bps - runnerUp.bps : null,
    // FPL's confirmed bonus can disagree with the BPS feed (late corrections, or a tie its data split). Only a strict gap is
    // a bubble: "0 BPS short" contradicts FPL's tie rule (equal BPS share the bonus), and a gap below zero is nonsense.
    bubble: inside && outside && inside.bps > outside.bps ? { inside, outside, gap: inside.bps - outside.bps } : null,
  };
}

/** A bonus line this close (in BPS) is worth a sentence: one save, one key pass, and it flips. */
export const BUBBLE_GAP = 3;
