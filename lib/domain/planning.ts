/**
 * Planning tools for the Tools page: a captain shortlist for the next gameweek, fixture swings and rotation pairs over
 * the next few gameweeks, and each club's set-piece order. Pure: no I/O.
 *
 * Accuracy, as in the FPL toolkit's rules: names are FPL's own `web_name`; figures FPL doesn't publish (simulated
 * points, averages) are labelled by the page as derived; doubtful players under 75% and clubs without a fixture are left
 * out of the captaincy rather than given a made-up difficulty; a blank gameweek is shown as a blank, never scored as a
 * match, and a double shows both matches.
 *
 * Also here: the guards that turn a malformed FPL response into something the Tools page can't trip over (see
 * `saneBootstrap` and friends). Anything unusable is dropped, never guessed at.
 */
import type { CaptainCandidate, CaptainLab } from "./lab";
import { rotationPairs } from "./lab";
import { BLANK_DIFFICULTY } from "./fdr";
import type { Bootstrap, FplElement, FplEvent, FplTeam, Pick as FplPick, PositionId, ScheduledFixture, StandingRow } from "./types";

// ---------- guards ----------

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const POSITIONS: readonly number[] = [1, 2, 3, 4];

/** Numeric fields of a player: anything that isn't a finite number (null, NaN, a string) is dropped, as if FPL left it out. */
const ELEMENT_NUMBERS = [
  "minutes", "starts", "total_points", "now_cost", "transfers_in_event", "transfers_out_event", "cost_change_event", "cost_change_start",
  "expected_goals_per_90", "expected_assists_per_90", "clean_sheets_per_90", "defensive_contribution_per_90", "yellow_cards",
  "penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order",
] as const satisfies readonly (keyof FplElement)[];
const ELEMENT_STRINGS = ["status", "news", "news_added", "selected_by_percent", "form", "ep_next", "points_per_game", "first_name", "second_name"] as const satisfies readonly (keyof FplElement)[];

function saneElement(raw: unknown): FplElement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const name = text(e.web_name);
  if (!finite(e.id) || !finite(e.team) || !name || !POSITIONS.includes(e.element_type as number)) return null;
  // Everything else FPL sent is kept as it is: only the fields below are checked, and a bad one is dropped.
  const out: Record<string, unknown> = { ...e, web_name: name, element_type: e.element_type as PositionId };
  for (const k of ELEMENT_NUMBERS) if (k in out && !finite(out[k])) delete out[k];
  for (const k of ELEMENT_STRINGS) if (k in out && typeof out[k] !== "string") delete out[k];
  // FPL sends a number for a percentage chance and null for "no news": keep both, drop anything else.
  if ("chance_of_playing_next_round" in out && !finite(out.chance_of_playing_next_round) && out.chance_of_playing_next_round !== null) delete out.chance_of_playing_next_round;
  return out as unknown as FplElement;
}

/**
 * The bootstrap file with anything the Tools page could trip over taken out: players without an id, a name, a club or
 * a position are dropped; numbers that aren't numbers are dropped; events and clubs without an id are dropped. Nothing
 * is invented: a missing value stays missing.
 */
export function saneBootstrap(raw: Bootstrap): Bootstrap {
  const r = (raw ?? {}) as Partial<Bootstrap>;
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const events: FplEvent[] = list<FplEvent>(r.events).flatMap((e) =>
    e && finite(e.id) && typeof e.deadline_time === "string"
      ? [{ ...e, name: text(e.name) ?? `Gameweek ${e.id}`, is_current: e.is_current === true, is_next: e.is_next === true, finished: e.finished === true, data_checked: e.data_checked === true }]
      : [],
  );
  const teams: FplTeam[] = list<FplTeam>(r.teams).flatMap((t) =>
    t && finite(t.id) ? [{ ...t, code: finite(t.code) ? t.code : 0, name: text(t.name) ?? text(t.short_name) ?? "—", short_name: text(t.short_name) ?? text(t.name) ?? "—" }] : [],
  );
  const { total_players, chips, ...rest } = r;
  return {
    ...rest,
    events,
    teams,
    elements: list<unknown>(r.elements).flatMap((e) => saneElement(e) ?? []),
    ...(Array.isArray(chips) ? { chips } : {}),
    ...(finite(total_players) ? { total_players } : {}),
  } as Bootstrap;
}

/** The season schedule with unusable fixtures dropped (no clubs), and difficulties outside 1-5 read as neutral (3), as the fixtures page does. */
export function saneSchedule(raw: unknown): ScheduledFixture[] | null {
  if (!Array.isArray(raw)) return null;
  const level = (d: unknown) => (finite(d) && d >= 1 && d <= 5 ? Math.round(d) : 3);
  return raw.flatMap((f: ScheduledFixture) =>
    f && finite(f.team_h) && finite(f.team_a) ? [{ ...f, event: finite(f.event) ? f.event : null, team_h_difficulty: level(f.team_h_difficulty), team_a_difficulty: level(f.team_a_difficulty) }] : [],
  );
}

/** League rows that name a team: an entry number, and text for the names (an empty name reads as "—"). */
export function saneStandings(raw: unknown): StandingRow[] {
  const results = (raw as { standings?: { results?: unknown } } | null)?.standings?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r: StandingRow) =>
    r && finite(r.entry)
      ? [{ ...r, entry_name: text(r.entry_name) ?? "—", player_name: text(r.player_name) ?? "—", rank: finite(r.rank) ? r.rank : 0, last_rank: finite(r.last_rank) ? r.last_rank : 0, total: finite(r.total) ? r.total : 0, event_total: finite(r.event_total) ? r.event_total : 0 }]
      : [],
  );
}

/** A manager's picks, or null if the response has none worth reading. Picks without a player or a multiplier are dropped. */
export function sanePicks(raw: unknown): FplPick[] | null {
  const picks = (raw as { picks?: unknown } | null)?.picks;
  if (!Array.isArray(picks)) return null;
  return picks.filter((p: FplPick) => p && finite(p.element) && finite(p.multiplier)).map((p: FplPick) => ({ ...p, is_captain: p.is_captain === true, is_vice_captain: p.is_vice_captain === true }));
}

/** A query value, cut to `max` characters without splitting a character in two. */
export function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

// ---------- the gameweeks ahead ----------

/** How many gameweeks the swing and rotation tools look ahead. */
export const PLAN_SPAN = 5;
/** The first two gameweeks are "soon", the rest "later": the skill's near/mid split. */
export const SWING_SOON = 2;
/** A swing worth a row: the average difficulty per match moves by at least this much. */
export const SWING_MIN = 0.5;

/** Up to `span` gameweeks from `from`, in order, as FPL lists them. */
export function gameweeksAhead(events: Pick<FplEvent, "id">[], from: number, span = PLAN_SPAN): number[] {
  return [...new Set(events.map((e) => e.id))].filter((id) => id >= from).sort((a, b) => a - b).slice(0, span);
}

export interface PlanMatch {
  /** The opponent's short name. */
  opponent: string;
  home: boolean;
  /** FPL's difficulty for this side, 1 (easy) to 5. */
  difficulty: number;
}

export interface PlanCell {
  gw: number;
  /** Empty for a blank gameweek, two for a double. */
  matches: PlanMatch[];
}

function cellsFor(schedule: ScheduledFixture[], teams: Pick<FplTeam, "id" | "short_name">[], gws: number[]): Map<number, PlanCell[]> {
  const short = new Map(teams.map((t) => [t.id, t.short_name]));
  const by = new Map<number, Map<number, PlanMatch[]>>();
  const add = (club: number, gw: number, m: PlanMatch) => {
    const g = by.get(club) ?? new Map<number, PlanMatch[]>();
    g.set(gw, [...(g.get(gw) ?? []), m]);
    by.set(club, g);
  };
  const wanted = new Set(gws);
  const sorted = [...schedule].sort((a, b) => String(a.kickoff_time ?? "~").localeCompare(String(b.kickoff_time ?? "~")) || a.id - b.id);
  for (const f of sorted) {
    if (f.event == null || !wanted.has(f.event)) continue;
    add(f.team_h, f.event, { opponent: short.get(f.team_a) ?? "?", home: true, difficulty: f.team_h_difficulty });
    add(f.team_a, f.event, { opponent: short.get(f.team_h) ?? "?", home: false, difficulty: f.team_a_difficulty });
  }
  return new Map(teams.map((t) => [t.id, gws.map((gw) => ({ gw, matches: by.get(t.id)?.get(gw) ?? [] }))]));
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/**
 * Average difficulty per match over some gameweeks: a double adds both matches, and a blank adds one week at the hardest
 * rating (as in the fixtures grid and rotation pairs) so it never makes a run look easier. Gameweeks nobody is scheduled
 * in yet (`scheduled`) are left out. `matches` counts real matches only.
 */
const meanPerMatch = (cells: PlanCell[], scheduled: Set<number>): { average: number | null; matches: number } => {
  const all = cells.flatMap((c) => (c.matches.length ? c.matches.map((m) => m.difficulty) : scheduled.has(c.gw) ? [BLANK_DIFFICULTY] : []));
  const matches = cells.reduce((n, c) => n + c.matches.length, 0);
  return { average: all.length ? round2(all.reduce((s, d) => s + d, 0) / all.length) : null, matches };
};

// ---------- fixture swings ----------

export interface SwingRow {
  teamId: number;
  club: string;
  clubCode: number | null;
  cells: PlanCell[];
  /** Average FPL difficulty per match in the first gameweeks and in the rest. */
  soon: number;
  later: number;
  soonMatches: number;
  laterMatches: number;
  /** `soon - later`: positive means the fixtures ease. */
  change: number;
  /** Gameweeks in the window with no match, and with two or more. */
  blanks: number[];
  doubles: number[];
}

export interface FixtureSwings {
  gws: number[];
  /** The gameweeks counted as "soon" and as "later". */
  soonGws: number[];
  laterGws: number[];
  /** Clubs whose fixtures turn green (ease) and red (harden), biggest swing first. */
  easing: SwingRow[];
  hardening: SwingRow[];
}

/**
 * Turning points: the clubs whose fixtures ease (or harden) the most from the next two gameweeks to the three after.
 * Each side is the average FPL difficulty per match, so a blank adds nothing and a double adds both matches. A club
 * with no match on one side can't be compared and is left out. Null when the window is too short or nothing is
 * scheduled in it yet.
 */
export function fixtureSwings(
  schedule: ScheduledFixture[],
  bootstrap: Pick<Bootstrap, "events" | "teams">,
  from: number,
  { span = PLAN_SPAN, limit = 5 }: { span?: number; limit?: number } = {},
): FixtureSwings | null {
  const gws = gameweeksAhead(bootstrap.events, from, span);
  if (gws.length <= SWING_SOON) return null;
  const soonGws = gws.slice(0, SWING_SOON);
  const laterGws = gws.slice(SWING_SOON);
  const cells = cellsFor(schedule, bootstrap.teams, gws);
  if (![...cells.values()].some((cs) => cs.some((c) => c.matches.length > 0))) return null;
  const scheduled = new Set(gws.filter((gw) => [...cells.values()].some((cs) => cs.some((c) => c.gw === gw && c.matches.length > 0))));
  const rows: SwingRow[] = bootstrap.teams.flatMap((t) => {
    const cs = cells.get(t.id) ?? [];
    const soon = meanPerMatch(cs.slice(0, SWING_SOON), scheduled);
    const later = meanPerMatch(cs.slice(SWING_SOON), scheduled);
    if (soon.average === null || later.average === null) return [];
    return [{
      teamId: t.id,
      club: t.short_name,
      clubCode: t.code || null,
      cells: cs,
      soon: soon.average,
      later: later.average,
      soonMatches: soon.matches,
      laterMatches: later.matches,
      change: round2(soon.average - later.average),
      blanks: cs.filter((c) => c.matches.length === 0).map((c) => c.gw),
      doubles: cs.filter((c) => c.matches.length >= 2).map((c) => c.gw),
    }];
  });
  const byName = (a: SwingRow, b: SwingRow) => a.club.localeCompare(b.club);
  return {
    gws,
    soonGws,
    laterGws,
    easing: rows.filter((r) => r.change >= SWING_MIN).sort((a, b) => b.change - a.change || byName(a, b)).slice(0, limit),
    hardening: rows.filter((r) => r.change <= -SWING_MIN).sort((a, b) => a.change - b.change || byName(a, b)).slice(0, limit),
  };
}

// ---------- rotation pairs ----------

export interface RotationWeek {
  gw: number;
  /** The club to start (the easier match of the two); null when neither plays. */
  club: string | null;
  difficulty: number | null;
  /** How many matches that club has in the gameweek (2 for a double). */
  matches: number;
}

export interface RotationPlanPair {
  clubs: [string, string];
  /** Average of the easier difficulty each gameweek, a gameweek where neither club plays counting as 5 (the hardest). */
  average: number;
  weeks: RotationWeek[];
  /** Gameweeks in which neither club plays. */
  blanks: number;
}

export interface RotationPlan {
  gws: number[];
  pairs: RotationPlanPair[];
}

/**
 * The best two-club rotations over the next few gameweeks, ranked by the lab's `rotationPairs`. Each week names the
 * club that actually plays the easier match: a club without a fixture is never the one to start, and a week where
 * neither plays is shown as such rather than as a match.
 */
export function rotationPlan(schedule: ScheduledFixture[], bootstrap: Pick<Bootstrap, "events" | "teams">, from: number, { span = PLAN_SPAN, limit = 5 }: { span?: number; limit?: number } = {}): RotationPlan | null {
  const gws = gameweeksAhead(bootstrap.events, from, span);
  if (gws.length < 2 || gws.some((gw, i) => i > 0 && gw !== gws[i - 1] + 1)) return null;
  const cells = cellsFor(schedule, bootstrap.teams, gws);
  if (![...cells.values()].some((cs) => cs.some((c) => c.matches.length > 0))) return null;
  const idOf = new Map(bootstrap.teams.map((t) => [t.short_name, t.id]));
  const pairs = rotationPairs(schedule, bootstrap.teams, gws[0], gws.length, limit).flatMap((p): RotationPlanPair[] => {
    const ids = p.clubs.map((c) => idOf.get(c));
    if (ids.some((id) => id === undefined)) return [];
    const weeks = gws.map((gw, i): RotationWeek => {
      const options = p.clubs
        .map((club, k) => ({ club, matches: cells.get(ids[k]!)?.[i]?.matches ?? [] }))
        .filter((o) => o.matches.length > 0)
        .map((o) => ({ club: o.club, matches: o.matches.length, difficulty: Math.min(...o.matches.map((m) => m.difficulty)) }))
        .sort((a, b) => a.difficulty - b.difficulty || b.matches - a.matches);
      const best = options[0];
      return best ? { gw, club: best.club, difficulty: best.difficulty, matches: best.matches } : { gw, club: null, difficulty: null, matches: 0 };
    });
    return [{ clubs: p.clubs, average: p.average, weeks, blanks: weeks.filter((w) => w.club === null).length }];
  });
  return pairs.length ? { gws, pairs } : null;
}

// ---------- captain shortlist ----------

export interface CaptainShortlist {
  gw: number;
  trials: number;
  /** Highest simulated points (the safe armband), best chance of 10+ (a haul), best chance of 15+ (a Triple Captain punt). */
  safest: CaptainCandidate[];
  haul: CaptainCandidate[];
  punt: CaptainCandidate[];
  /** Clubs with no fixture in the gameweek (their players are left out), and clubs with two or more. */
  blanks: string[];
  doubles: string[];
}

/** The lab's captaincy simulation, framed as a shortlist for the next gameweek. Null when nobody qualifies (pre-season, say). */
export function captainShortlist(captain: CaptainLab, schedule: ScheduledFixture[], teams: Pick<FplTeam, "id" | "short_name">[], gw: number, trials: number, limit = 5): CaptainShortlist | null {
  if (captain.byMean.length === 0) return null;
  const count = new Map<number, number>();
  for (const f of schedule) {
    if (f.event !== gw) continue;
    count.set(f.team_h, (count.get(f.team_h) ?? 0) + 1);
    count.set(f.team_a, (count.get(f.team_a) ?? 0) + 1);
  }
  const named = (ok: (n: number) => boolean) => teams.filter((t) => ok(count.get(t.id) ?? 0)).map((t) => t.short_name).sort((a, b) => a.localeCompare(b));
  // Only a gameweek that is (at least partly) scheduled has blanks: an empty one just isn't scheduled yet.
  return {
    gw,
    trials,
    safest: captain.byMean.slice(0, limit),
    haul: captain.byHaul.slice(0, limit),
    punt: captain.byCeiling.slice(0, limit),
    blanks: count.size > 0 ? named((n) => n === 0) : [],
    doubles: named((n) => n >= 2),
  };
}

// ---------- set pieces ----------

export type TakerFitness = "fit" | "doubt" | "out";

export interface SetPieceTaker {
  id: number;
  name: string;
  /** FPL's order for this set piece: 1 is first choice. */
  order: number;
  fitness: TakerFitness;
  /** FPL's chance of playing next round, when it gives one. */
  chance: number | null;
}

export interface SetPieceRow {
  teamId: number;
  club: string;
  clubName: string;
  clubCode: number | null;
  penalties: SetPieceTaker[];
  freeKicks: SetPieceTaker[];
  corners: SetPieceTaker[];
}

/** How fit a taker is, from FPL's status: available, doubtful (with FPL's chance) or out (injured, suspended, unavailable, gone). */
export function fitness(e: Pick<FplElement, "status" | "chance_of_playing_next_round">): TakerFitness {
  const s = e.status ?? "a";
  if (s === "a") return "fit";
  if (s === "d") return "doubt";
  return "out";
}

/**
 * Each club's penalty, direct free-kick and corner order, exactly as FPL lists it (FPL keeps these notes by hand).
 * Clubs with nothing listed are left out; null when FPL lists nothing at all (or the data predates these fields).
 */
export function setPieceOrders(bootstrap: Pick<Bootstrap, "elements" | "teams">, perList = 3): SetPieceRow[] | null {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const rows = new Map<number, SetPieceRow>();
  const keys = [["penalties", "penalties_order"], ["freeKicks", "direct_freekicks_order"], ["corners", "corners_and_indirect_freekicks_order"]] as const;
  for (const e of bootstrap.elements) {
    const club = clubs.get(e.team);
    if (!club) continue;
    for (const [list, field] of keys) {
      const order = e[field];
      if (!finite(order) || order < 1) continue;
      const row = rows.get(club.id) ?? { teamId: club.id, club: club.short_name, clubName: club.name, clubCode: club.code || null, penalties: [], freeKicks: [], corners: [] };
      row[list].push({ id: e.id, name: e.web_name, order, fitness: fitness(e), chance: finite(e.chance_of_playing_next_round) ? e.chance_of_playing_next_round : null });
      rows.set(club.id, row);
    }
  }
  if (rows.size === 0) return null;
  const tidy = (xs: SetPieceTaker[]) => xs.sort((a, b) => a.order - b.order || a.id - b.id).slice(0, perList);
  return [...rows.values()]
    .map((r) => ({ ...r, penalties: tidy(r.penalties), freeKicks: tidy(r.freeKicks), corners: tidy(r.corners) }))
    .sort((a, b) => a.clubName.localeCompare(b.clubName) || a.teamId - b.teamId);
}

// ---------- all of it ----------

export interface Planning {
  /** The gameweek the plan starts from (the next deadline's). */
  gw: number;
  captain: CaptainShortlist | null;
  swings: FixtureSwings | null;
  rotation: RotationPlan | null;
  setPieces: SetPieceRow[] | null;
}

/** Runs one tool, and gives null instead of taking the others down if it can't be worked out. */
export function attempt<T>(work: () => T | null): T | null {
  try {
    return work();
  } catch {
    return null;
  }
}

/**
 * Every planning tool that can be worked out. Set pieces need only bootstrap; the rest need a gameweek ahead and the
 * schedule; the captain shortlist also needs the lab's simulation. Each is independent: one failing leaves the others.
 */
export function buildPlanning(
  bootstrap: Pick<Bootstrap, "events" | "teams" | "elements">,
  schedule: ScheduledFixture[] | null,
  next: number | null,
  captain: { lab: CaptainLab; trials: number } | null,
): Planning | null {
  const setPieces = attempt(() => setPieceOrders(bootstrap));
  const plan: Planning = {
    gw: next ?? 0,
    captain: next !== null && schedule && captain ? attempt(() => captainShortlist(captain.lab, schedule, bootstrap.teams, next, captain.trials)) : null,
    swings: next !== null && schedule ? attempt(() => fixtureSwings(schedule, bootstrap, next)) : null,
    rotation: next !== null && schedule ? attempt(() => rotationPlan(schedule, bootstrap, next)) : null,
    setPieces,
  };
  return plan.captain || plan.swings || plan.rotation || plan.setPieces ? plan : null;
}
