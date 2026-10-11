/**
 * Facts about a manager's season and squad, derived from official FPL data only.
 * Ported from the FPL skill's audit rules, which exist because guessing (e.g. "0 transfers means 2 free
 * transfers") produced wrong claims. Everything here is computed, never assumed. Pure: no I/O, no framework.
 */
import type { BootstrapChip, HistoryChip, HistoryGameweek, HistorySeason, ScheduledFixture } from "./types";
import { CHIP_LABEL, allPlayers, type SheetPlayer, type TeamSheet } from "./teamSheet";

// ---------- Free transfers ----------

export const MAX_BANKED_FREE_TRANSFERS = 5;

export interface FreeTransferRow {
  gw: number;
  chip: string | null;
  made: number;
  hit: number;
  before: number;
  consumed: number;
  after: number;
}

export interface FreeTransfers {
  /** Free transfers available for the next gameweek, derived from history (FPL's own display is authoritative). */
  available: number;
  max: number;
  /** Per-gameweek ledger, so the number can be audited. */
  ledger: FreeTransferRow[];
  /**
   * False when a gameweek's hit doesn't match what the ledger predicts (4 points per transfer beyond the banked
   * free ones, none on a wildcard or free hit). That means something the history can't show, e.g. a one-off
   * top-up from FPL, so the count may be off.
   */
  verified: boolean;
}

/**
 * Rules: a team's first gameweek is squad creation (unlimited transfers), after which it has exactly 1.
 * Each later gameweek banks +1 for the next, capped at 5. Transfers use free ones first; the excess costs
 * 4 points each. Wildcard and Free Hit gameweeks do not use up banked transfers.
 */
export function freeTransfers(current: HistoryGameweek[], chips: HistoryChip[]): FreeTransfers {
  const chipIn = new Map(chips.map((c) => [c.event, c.name]));
  const ordered = [...current].sort((a, b) => a.event - b.event);

  let banked = 1;
  const ledger: FreeTransferRow[] = [];
  ordered.forEach((gw, i) => {
    const chip = chipIn.get(gw.event) ?? null;
    if (i === 0) {
      ledger.push({ gw: gw.event, chip, made: gw.event_transfers, hit: gw.event_transfers_cost, before: 1, consumed: 0, after: 1 });
      banked = 1;
      return;
    }
    const before = banked;
    const unlimited = chip === "wildcard" || chip === "freehit";
    const consumed = unlimited ? 0 : Math.min(gw.event_transfers, before);
    const after = before - consumed;
    ledger.push({ gw: gw.event, chip, made: gw.event_transfers, hit: gw.event_transfers_cost, before, consumed, after });
    banked = Math.min(MAX_BANKED_FREE_TRANSFERS, after + 1);
  });

  const verified = ledger.every((row, i) => {
    if (i === 0) return true; // squad creation
    const expected = row.chip === "wildcard" || row.chip === "freehit" ? 0 : 4 * Math.max(0, row.made - row.before);
    return row.hit === expected;
  });
  return { available: banked, max: MAX_BANKED_FREE_TRANSFERS, ledger, verified };
}

// ---------- Chips ----------

export type ChipState = "used" | "available" | "upcoming" | "expired";

export interface ChipSlot {
  name: string;
  label: string;
  start: number;
  stop: number;
  state: ChipState;
  /** Gameweek it was played in, when used. */
  usedIn: number | null;
}

const CHIP_ORDER = ["wildcard", "freehit", "bboost", "3xc"];

/**
 * Each chip comes in windows (e.g. one set for GW1-19, another for GW20-38), taken from FPL's own
 * bootstrap data. A window is "used" if the chip was played inside it, otherwise it is still
 * available, not open yet, or expired, judged against the next gameweek.
 */
export function chipStatus(windows: BootstrapChip[], used: HistoryChip[], nextGw: number): ChipSlot[] {
  return windows
    .map<ChipSlot>((w) => {
      const play = used.find((u) => u.name === w.name && u.event >= w.start_event && u.event <= w.stop_event);
      const state: ChipState = play ? "used" : nextGw > w.stop_event ? "expired" : nextGw < w.start_event ? "upcoming" : "available";
      return { name: w.name, label: CHIP_LABEL[w.name] ?? w.name, start: w.start_event, stop: w.stop_event, state, usedIn: play?.event ?? null };
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.start - b.start);
}
const rank = (name: string) => {
  const i = CHIP_ORDER.indexOf(name);
  return i === -1 ? CHIP_ORDER.length : i;
};

// ---------- Season ----------

export interface SeasonGameweek {
  gw: number;
  /** Points after the transfer hit. */
  net: number;
  hit: number;
  overallRank: number | null;
}

export interface SeasonForm {
  gameweeks: SeasonGameweek[];
  average: number;
  best: { gw: number; net: number };
  worst: { gw: number; net: number };
  /** Points lost to transfer hits this season. */
  hitPoints: number;
  benchPoints: number;
  transfers: number;
  firstRank: number | null;
  latestRank: number | null;
  bestRank: { gw: number; rank: number } | null;
  /** Squad value now and after the first gameweek, in tenths of a million. */
  value: { start: number; now: number };
}

/**
 * `settledThrough` is the last finished gameweek: a gameweek in progress has partial points, so it is left out
 * of the averages, extremes, chart and ranks (transfers and hits still count: they are real).
 */
export function seasonForm(current: HistoryGameweek[], settledThrough: number = Infinity): SeasonForm | null {
  const all = [...current].sort((a, b) => a.event - b.event);
  const ordered = all.filter((g) => g.event <= settledThrough);
  if (ordered.length === 0) return null;
  const gameweeks = ordered.map<SeasonGameweek>((g) => ({
    gw: g.event,
    net: g.points - g.event_transfers_cost,
    hit: g.event_transfers_cost,
    overallRank: g.overall_rank,
  }));
  const best = gameweeks.reduce((b, g) => (g.net > b.net ? g : b));
  const worst = gameweeks.reduce((w, g) => (g.net < w.net ? g : w));
  const ranked = gameweeks.filter((g): g is SeasonGameweek & { overallRank: number } => g.overallRank != null);
  const bestRank = ranked.length ? ranked.reduce((b, g) => (g.overallRank < b.overallRank ? g : b)) : null;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    gameweeks,
    average: gameweeks.reduce((s, g) => s + g.net, 0) / gameweeks.length,
    best: { gw: best.gw, net: best.net },
    worst: { gw: worst.gw, net: worst.net },
    hitPoints: all.reduce((s, g) => s + g.event_transfers_cost, 0),
    benchPoints: ordered.reduce((s, g) => s + g.points_on_bench, 0),
    transfers: all.reduce((s, g) => s + g.event_transfers, 0),
    firstRank: first.overall_rank,
    latestRank: last.overall_rank,
    bestRank: bestRank ? { gw: bestRank.gw, rank: bestRank.overallRank } : null,
    value: { start: first.value + first.bank, now: last.value + last.bank },
  };
}

export interface Tenure {
  /** Seasons played before this one. */
  seasons: number;
  firstSeason: string | null;
  best: { season: string; rank: number; points: number } | null;
}

export function tenure(past: HistorySeason[]): Tenure {
  const ordered = [...past].sort((a, b) => a.season_name.localeCompare(b.season_name));
  const ranked = ordered.filter((s) => s.rank > 0);
  const best = ranked.length ? ranked.reduce((b, s) => (s.rank < b.rank ? s : b)) : null;
  return {
    seasons: ordered.length,
    firstSeason: ordered[0]?.season_name ?? null,
    best: best ? { season: best.season_name, rank: best.rank, points: best.total_points } : null,
  };
}

// ---------- This gameweek ----------

export interface CaptainInsight {
  captain: { name: string; base: number; multiplier: number; points: number };
  vice: { name: string; base: number | null } | null;
  /** Highest-scoring starter so far (the captain wins ties). */
  best: { name: string; base: number };
  /**
   * "played": has minutes, so the armband can be judged. "waiting": hasn't played yet but his club still has a
   * match to come. "unused": his club's matches are over and he never played, so the armband isn't judged here.
   */
  state: "played" | "waiting" | "unused";
  /**
   * Extra points had the best starter worn the armband: (best - captain) x multiplier. Only when the captain
   * played; null otherwise.
   */
  regret: number | null;
  /** The gameweek is still in progress, so "best so far" can change. */
  provisional: boolean;
}

/** `states` says where each club is; pass null when match state is unknown (then 0 minutes reads as "waiting"). */
export function captainInsight(sheet: TeamSheet, states: Map<number, TeamState> | null = null, inProgress = false): CaptainInsight | null {
  const starters = sheet.starters.flatMap((g) => g.players);
  const captain = starters.find((p) => p.isCaptain);
  if (!captain || captain.basePoints == null) return null;

  const scored = starters.filter((p): p is SheetPlayer & { basePoints: number } => p.basePoints != null);
  const top = scored.reduce((b, p) => (p.basePoints > b.basePoints ? p : b), captain as SheetPlayer & { basePoints: number });
  const vice = starters.find((p) => p.isVice);
  const state = (captain.minutes ?? 0) > 0 ? "played" : captain.teamId != null && states?.get(captain.teamId) === "finished" ? "unused" : "waiting";
  return {
    captain: { name: captain.name, base: captain.basePoints, multiplier: captain.multiplier, points: captain.points ?? 0 },
    vice: vice ? { name: vice.name, base: vice.basePoints } : null,
    best: { name: top.name, base: top.basePoints },
    state,
    regret: state === "played" ? (top.basePoints - captain.basePoints) * captain.multiplier : null,
    provisional: inProgress,
  };
}

export interface BenchInsight {
  points: number;
  players: { name: string; points: number }[];
  /** True under Bench Boost, when bench points count towards the score. */
  counted: boolean;
}

/** null when FPL returned no player points, so there is nothing true to say about the bench. */
export function benchInsight(sheet: TeamSheet, activeChip: string | null): BenchInsight | null {
  if (sheet.bench.length === 0 || sheet.bench.every((p) => p.basePoints == null)) return null;
  const players = sheet.bench
    .map((p) => ({ name: p.name, points: p.basePoints ?? 0 }))
    .sort((a, b) => b.points - a.points);
  return { points: players.reduce((s, p) => s + p.points, 0), players, counted: activeChip === "bboost" };
}

/**
 * What the active chip added, isolated: Bench Boost is only the bench's points and Triple Captain is one
 * extra copy of the captain's points. Never compare this with a whole gameweek score.
 */
export function chipContribution(sheet: TeamSheet, activeChip: string | null): { chip: string; points: number } | null {
  if (activeChip === "bboost") {
    const bench = benchInsight(sheet, activeChip);
    return bench ? { chip: activeChip, points: bench.points } : null;
  }
  if (activeChip === "3xc") {
    const captain = sheet.starters.flatMap((g) => g.players).find((p) => p.isCaptain);
    // If the captain didn't play, the triple passes to the vice-captain: not attributable from here.
    return captain?.basePoints == null || captain.minutes === 0 ? null : { chip: activeChip, points: captain.basePoints };
  }
  return null;
}

export interface AutoSub {
  in: { name: string; points: number };
  out: { name: string; points: number };
}

/** Automatic substitutions FPL applied (only present once they have been made). */
export function autoSubs(sheet: TeamSheet, subs: { element_in: number; element_out: number }[] | undefined): AutoSub[] {
  const byId = new Map(allPlayers(sheet).map((p) => [p.id, p]));
  return (subs ?? []).flatMap((s) => {
    const inn = byId.get(s.element_in);
    const out = byId.get(s.element_out);
    return inn && out ? [{ in: { name: inn.name, points: inn.basePoints ?? 0 }, out: { name: out.name, points: out.basePoints ?? 0 } }] : [];
  });
}

// ---------- Live ----------

export type TeamState = "upcoming" | "live" | "finished";

/**
 * Where each club is in a gameweek. A club with a match still to play is "live" if one has started, else
 * "upcoming"; only when every match is over is it "finished". Clubs with no fixture are absent.
 */
export function teamStates(fixtures: Pick<ScheduledFixture, "event" | "team_h" | "team_a" | "started" | "finished" | "finished_provisional">[], gw: number): Map<number, TeamState> {
  const unfinished = new Map<number, { started: boolean }>();
  const all = new Set<number>();
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    const over = f.finished || f.finished_provisional;
    for (const id of [f.team_h, f.team_a]) {
      all.add(id);
      if (!over) unfinished.set(id, { started: Boolean(unfinished.get(id)?.started || f.started) });
    }
  }
  return new Map([...all].map((id) => [id, unfinished.has(id) ? (unfinished.get(id)!.started ? "live" : "upcoming") : "finished"]));
}

export interface RotationRisk {
  name: string;
  club: string;
  wasStarter: boolean;
}

/** Fit players whose club's matches are all over yet who recorded 0 minutes: unused subs, with the evidence. */
export function rotationRisks(sheet: TeamSheet, states: Map<number, TeamState>): RotationRisk[] {
  return allPlayers(sheet)
    .filter((p) => !(p.slot > 11 && p.positionId === 1)) // the bench goalkeeper almost never plays
    .filter((p) => p.minutes === 0 && p.status === "a" && p.teamId != null && states.get(p.teamId) === "finished")
    .map((p) => ({ name: p.name, club: p.club, wasStarter: p.slot <= 11 }))
    .sort((a, b) => Number(b.wasStarter) - Number(a.wasStarter));
}

export interface PlayersRemaining {
  /** Players who count towards the score and have not played yet, but their match is live or still to come. */
  count: number;
  /** The same, weighted by multiplier: a remaining captain counts 2 (3 with Triple Captain). */
  effective: number;
  /** Players who count and have already played. */
  played: number;
}

export function playersRemaining(sheet: TeamSheet, states: Map<number, TeamState>): PlayersRemaining {
  let count = 0;
  let effective = 0;
  let played = 0;
  for (const p of allPlayers(sheet)) {
    if (p.multiplier <= 0) continue; // bench players only count under Bench Boost
    if ((p.minutes ?? 0) > 0) played += 1;
    else if (p.teamId != null && (states.get(p.teamId) === "upcoming" || states.get(p.teamId) === "live")) {
      count += 1;
      effective += p.multiplier;
    }
  }
  return { count, effective, played };
}

/** Defensive contribution needed for the +2 bonus: defenders 10 (CBIT); midfielders and forwards 12 (CBIRT). */
export const DEFCON_THRESHOLD: Record<number, number | null> = { 1: null, 2: 10, 3: 12, 4: 12 };

export interface DefconProgress {
  name: string;
  value: number;
  threshold: number;
  /** Reached the threshold. Never claimed for a double gameweek (see `matches`). */
  reached: boolean;
  /** Matches the club plays this gameweek. In a double the live total adds both, so "reached" can't be told. */
  matches: number;
}

/** How many matches each club has in a gameweek (0 absent, 2 for a double). */
export function matchCounts(fixtures: Pick<ScheduledFixture, "event" | "team_h" | "team_a">[], gw: number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    for (const id of [f.team_h, f.team_a]) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Starters who have made a defensive contribution, closest to the threshold first. */
export function defconProgress(sheet: TeamSheet, matches: Map<number, number> | null = null): DefconProgress[] {
  return sheet.starters
    .flatMap((g) => g.players)
    .flatMap((p) => {
      const threshold = DEFCON_THRESHOLD[p.positionId];
      if (!threshold || !p.defcon) return [];
      const n = (p.teamId != null && matches?.get(p.teamId)) || 1;
      return [{ name: p.name, value: p.defcon, threshold, reached: n === 1 && p.defcon >= threshold, matches: n }];
    })
    .sort((a, b) => b.value / b.threshold - a.value / a.threshold || b.value - a.value);
}

// ---------- Squad ----------

const STATUS_LABEL: Record<string, string> = { d: "Doubtful", i: "Injured", s: "Suspended", u: "Unavailable", n: "Unavailable" };

export interface SquadFlag {
  name: string;
  club: string;
  label: string;
  chance: number | null;
  news: string;
  wasStarter: boolean;
}

/** Players FPL flags as anything other than fully available, starters first. */
export function squadFlags(sheet: TeamSheet): SquadFlag[] {
  return allPlayers(sheet)
    .filter((p) => (p.status != null && p.status !== "a") || (p.chanceOfPlaying != null && p.chanceOfPlaying < 100))
    .map((p) => ({
      name: p.name,
      club: p.club,
      label: STATUS_LABEL[p.status ?? ""] ?? (p.chanceOfPlaying != null && p.chanceOfPlaying < 100 ? "Doubtful" : "Flagged"),
      chance: p.chanceOfPlaying,
      news: p.news,
      wasStarter: p.slot <= 11,
    }))
    .sort((a, b) => Number(b.wasStarter) - Number(a.wasStarter));
}

export interface Ownership {
  /** Mean ownership of the starting XI. */
  average: number;
  /** Starters owned by under 10% of managers, rarest first (max 3). */
  differentials: { name: string; ownership: number }[];
}

export const DIFFERENTIAL_BELOW_PERCENT = 10;

export function ownership(sheet: TeamSheet): Ownership | null {
  const known = sheet.starters.flatMap((g) => g.players).filter((p): p is SheetPlayer & { ownership: number } => p.ownership != null && !Number.isNaN(p.ownership));
  if (known.length === 0) return null;
  return {
    average: known.reduce((s, p) => s + p.ownership, 0) / known.length,
    differentials: known
      .filter((p) => p.ownership < DIFFERENTIAL_BELOW_PERCENT)
      .sort((a, b) => a.ownership - b.ownership)
      .slice(0, 3)
      .map((p) => ({ name: p.name, ownership: p.ownership })),
  };
}

export interface FixtureOutlook {
  fromGw: number;
  toGw: number;
  /** Mean difficulty of the matches the starting XI's clubs play in the window. */
  average: number;
  easiest: { club: string; average: number };
  hardest: { club: string; average: number };
}

/** How kind the next few gameweeks are for the clubs in the starting XI. null if nobody has a fixture. */
export function fixtureOutlook(sheet: TeamSheet, fixtures: ScheduledFixture[], fromGw: number, span = 3): FixtureOutlook | null {
  const toGw = fromGw + span - 1;
  const clubs = new Map<number, string>();
  for (const p of sheet.starters.flatMap((g) => g.players)) if (p.teamId != null) clubs.set(p.teamId, p.club);

  const perClub = new Map<number, number[]>();
  for (const f of fixtures) {
    if (f.event == null || f.event < fromGw || f.event > toGw) continue;
    if (clubs.has(f.team_h)) perClub.set(f.team_h, [...(perClub.get(f.team_h) ?? []), f.team_h_difficulty]);
    if (clubs.has(f.team_a)) perClub.set(f.team_a, [...(perClub.get(f.team_a) ?? []), f.team_a_difficulty]);
  }
  const averages = [...perClub].map(([id, ds]) => ({ club: clubs.get(id)!, average: ds.reduce((a, b) => a + b, 0) / ds.length }));
  if (averages.length === 0) return null;

  // Weight by the number of starters from each club, so three Arsenal players count three times.
  const starters = sheet.starters.flatMap((g) => g.players);
  let sum = 0;
  let n = 0;
  for (const [id, ds] of perClub) {
    const weight = starters.filter((p) => p.teamId === id).length;
    sum += (ds.reduce((a, b) => a + b, 0) / ds.length) * weight;
    n += weight;
  }
  const sorted = [...averages].sort((a, b) => a.average - b.average || a.club.localeCompare(b.club));
  return { fromGw, toGw, average: sum / n, easiest: sorted[0], hardest: sorted[sorted.length - 1] };
}

/** One word for an outlook average: 1-2.6 kind, up to 3.4 mixed, above that tough. */
export const outlookVerdict = (average: number): "Kind" | "Mixed" | "Tough" => (average <= 2.6 ? "Kind" : average <= 3.4 ? "Mixed" : "Tough");
