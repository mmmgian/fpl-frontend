/**
 * The lab: the toolkit's heavier analyses, ported to run on the page. A port of the FPL skill's engines (its Monte Carlo
 * captaincy model, rotation finder, set-piece, suspension and DefCon trackers), working from FPL's own numbers. Pure and
 * seeded: the same inputs give the same answers, so a page is stable and testable.
 *
 * What is left out on purpose: the skill also reads each player's career history, which needs one request per player;
 * here a player's own season is shrunk toward a positional baseline instead, and says so.
 */
import { BLANK_DIFFICULTY } from "./fdr";
import { expectedPoints, likelyToPlay, type NextOpponent } from "./tools";
import type { Bootstrap, FplElement, PositionId, ScheduledFixture } from "./types";

// ---------- scoring rules (as in the skill: one place to change if FPL changes them) ----------

const GOAL_POINTS: Record<PositionId, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const ASSIST_POINTS = 3;
const CLEAN_SHEET_POINTS: Record<PositionId, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const DEFCON_BONUS = 2;
const DEFCON_THRESHOLD: Record<PositionId, number> = { 1: 0, 2: 10, 3: 12, 4: 12 };
const P_YELLOW = 0.1;
const P_RED = 0.006;
const BONUS_BIG: [number, number][] = [[3, 0.35], [2, 0.3], [1, 0.15]];
const BONUS_QUIET: [number, number][] = [[3, 0.01], [2, 0.03], [1, 0.06]];

/** Per-90 expected goal involvement by position when a player has too little to go on, and the goal share of it. */
const BASELINE_XGI90: Record<PositionId, number> = { 1: 0, 2: 0.12, 3: 0.3, 4: 0.45 };
const BASELINE_GOAL_SHARE: Record<PositionId, number> = { 1: 0, 2: 0.45, 3: 0.55, 4: 0.75 };
/** Minutes at which a player's own season counts for half against the baseline. */
const K_MINUTES = 1200;
/** Fixture difficulty to attacking volume, and the home edge. */
const FDR_ATTACK: Record<number, number> = { 1: 1.35, 2: 1.22, 3: 1, 4: 0.82, 5: 0.68 };
const HOME = 1.08;
const AWAY = 0.92;

export const SUSPENSION_TIERS = [5, 10, 15] as const;
export const LAB_TRIALS = 1500;

/** Small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = (Math.trunc(seed) ^ 0x2545f491) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Knuth's Poisson sampler: fine for the small rates of a single match. */
function poisson(lambda: number, next: () => number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= next();
  } while (p > limit);
  return k - 1;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- the captaincy simulation ----------

export interface CaptainCandidate {
  id: number;
  name: string;
  teamId: number;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
  ownership: number;
  price: number;
  opponents: NextOpponent[];
  /** Expected points as a single (uncaptained) player. */
  mean: number;
  /** Chance of 10 or more points, and of 15 or more. */
  p10: number;
  p15: number;
  /** Owned by under 15% of managers. */
  differential: boolean;
}

interface MinutesModel {
  pStart: number;
  ifStart: number;
  pCameo: number;
  ifCameo: number;
}

/** How a player is likely to be used, from this season's starts and minutes, scaled by his chance of playing. */
function minutesModel(e: FplElement, gamesElapsed: number): MinutesModel {
  const starts = e.starts ?? 0;
  const minutes = e.minutes ?? 0;
  const chance = (e.chance_of_playing_next_round ?? 100) / 100;
  const pStart = Math.min(1, starts / Math.max(1, gamesElapsed)) * chance;
  const ifStart = starts > 0 ? Math.max(60, Math.min(90, minutes / starts)) : 75;
  return { pStart, ifStart, pCameo: 0.3 * chance, ifCameo: 20 };
}

/** Shrunk expected involvements per 90 and the share of them that are goals. */
function attackingRate(e: FplElement): { xgi90: number; goalShare: number } {
  const pos = e.element_type;
  const own = num(e.expected_goals_per_90) + num(e.expected_assists_per_90);
  const weight = (e.minutes ?? 0) / ((e.minutes ?? 0) + K_MINUTES);
  const xgi90 = own * weight + BASELINE_XGI90[pos] * (1 - weight);
  const ownShare = own > 0 ? num(e.expected_goals_per_90) / own : BASELINE_GOAL_SHARE[pos];
  return { xgi90, goalShare: ownShare * weight + BASELINE_GOAL_SHARE[pos] * (1 - weight) };
}

const cleanSheetProbability = (difficulty: number) => (difficulty <= 2 ? 0.45 : difficulty === 3 ? 0.3 : 0.15);

/** The simulated points of one player over a gameweek (all his matches), `trials` times. */
export function simulatePlayer(e: FplElement, opponents: NextOpponent[], gamesElapsed: number, trials: number, seed: number): { mean: number; p10: number; p15: number } {
  const next = rng(seed ^ (e.id * 2654435761));
  const pos = e.element_type;
  const m = minutesModel(e, gamesElapsed);
  const { xgi90, goalShare } = attackingRate(e);
  const dcWeight = Math.min(1, (e.minutes ?? 0) / (90 * 10));
  const defcon = DEFCON_THRESHOLD[pos] ? Math.min(1, (num(e.defensive_contribution_per_90) / DEFCON_THRESHOLD[pos]) * dcWeight) : 0;
  let total = 0;
  let ten = 0;
  let fifteen = 0;
  for (let t = 0; t < trials; t++) {
    let points = 0;
    for (const o of opponents) {
      const roll = next();
      const minutes = roll < m.pStart ? m.ifStart : roll < m.pStart + (1 - m.pStart) * m.pCameo ? m.ifCameo : 0;
      if (minutes <= 0) continue;
      const rate = xgi90 * (FDR_ATTACK[o.difficulty] ?? 1) * (o.home ? HOME : AWAY) * (minutes / 90);
      const goals = poisson(rate * goalShare, next);
      const assists = poisson(rate * (1 - goalShare), next);
      const sheet = minutes >= 60 && CLEAN_SHEET_POINTS[pos] > 0 && next() < cleanSheetProbability(o.difficulty);
      const dc = minutes >= 60 && defcon > 0 && next() < defcon;
      let bonus = 0;
      let r = next();
      for (const [value, p] of goals > 0 || assists > 0 || sheet ? BONUS_BIG : BONUS_QUIET) {
        if (r < p) {
          bonus = value;
          break;
        }
        r -= p;
      }
      points += (minutes >= 60 ? 2 : 1) + goals * GOAL_POINTS[pos] + assists * ASSIST_POINTS + (sheet ? CLEAN_SHEET_POINTS[pos] : 0) + (dc ? DEFCON_BONUS : 0) + bonus;
      if (next() < P_YELLOW) points -= 1;
      if (next() < P_RED) points -= 3;
    }
    total += points;
    if (points >= 10) ten++;
    if (points >= 15) fifteen++;
  }
  return { mean: total / trials, p10: ten / trials, p15: fifteen / trials };
}

export interface CaptainLab {
  /** By expected points, by chance of 10+, by chance of 15+: three different questions with three different answers. */
  byMean: CaptainCandidate[];
  byHaul: CaptainCandidate[];
  byCeiling: CaptainCandidate[];
  /** The manager's own players, best first (only when asked for). */
  inSquad: CaptainCandidate[];
}

export function captainLab(
  bootstrap: Pick<Bootstrap, "elements" | "teams">,
  opponents: Map<number, NextOpponent[]>,
  opts: { gamesElapsed: number; limit?: number; shortlist?: number; trials?: number; seed?: number; squad?: number[] },
): CaptainLab {
  const { gamesElapsed, limit = 5, shortlist = 30, trials = LAB_TRIALS, seed = 1, squad = [] } = opts;
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const mine = new Set(squad);
  const eligible = bootstrap.elements.filter((e) => likelyToPlay(e) && (opponents.get(e.team)?.length ?? 0) > 0 && ((e.minutes ?? 0) >= 90 || mine.has(e.id)));
  // Phase one is cheap: FPL's own expected points choose who is worth simulating. Phase two simulates them.
  const chosen = new Map<number, FplElement>();
  for (const e of [...eligible].sort((a, b) => expectedPoints(b) - expectedPoints(a) || a.id - b.id).slice(0, shortlist)) chosen.set(e.id, e);
  for (const e of eligible) if (mine.has(e.id)) chosen.set(e.id, e);

  const rows: CaptainCandidate[] = [...chosen.values()].map((e) => {
    const opp = opponents.get(e.team) ?? [];
    const sim = simulatePlayer(e, opp, gamesElapsed, trials, seed);
    const own = num(e.selected_by_percent);
    return {
      id: e.id,
      name: e.web_name,
      teamId: e.team,
      club: clubs.get(e.team)?.short_name ?? "—",
      clubCode: clubs.get(e.team)?.code ?? null,
      positionId: e.element_type,
      ownership: own,
      price: e.now_cost ?? 0,
      opponents: opp,
      mean: Math.round(sim.mean * 100) / 100,
      p10: Math.round(sim.p10 * 1000) / 1000,
      p15: Math.round(sim.p15 * 1000) / 1000,
      differential: own < 15,
    };
  });
  const by = (key: (c: CaptainCandidate) => number) => [...rows].sort((a, b) => key(b) - key(a) || b.mean - a.mean || a.id - b.id).slice(0, limit);
  return {
    byMean: by((c) => c.mean),
    byHaul: by((c) => c.p10),
    byCeiling: by((c) => c.p15),
    inSquad: rows.filter((r) => mine.has(r.id)).sort((a, b) => b.mean - a.mean || a.id - b.id),
  };
}

// ---------- rotation pairs ----------

export interface RotationPair {
  clubs: [string, string];
  /** Mean of the easier of the two clubs' fixtures over the window (blank gameweeks count as the hardest, 5). */
  average: number;
  perGw: { gw: number; club: string; difficulty: number; blank?: boolean }[];
}

/** The two clubs whose fixtures, taking the easier each week, are kindest over the next `span` gameweeks. */
export function rotationPairs(
  schedule: ScheduledFixture[],
  teams: Pick<Bootstrap["teams"][number], "id" | "short_name">[],
  fromGw: number,
  span = 5,
  limit = 5,
  /** Use each club in at most one pair, so the list is five different ideas and not one club five times. */
  distinct = true,
): RotationPair[] {
  const gws = Array.from({ length: span }, (_, i) => fromGw + i);
  const diff = new Map<number, Map<number, number>>(); // club -> gw -> easiest difficulty
  const put = (club: number, gw: number, d: number) => {
    const m = diff.get(club) ?? new Map<number, number>();
    m.set(gw, Math.min(m.get(gw) ?? 5, d));
    diff.set(club, m);
  };
  for (const f of schedule) {
    if (f.event == null || f.event < fromGw || f.event >= fromGw + span) continue;
    put(f.team_h, f.event, f.team_h_difficulty);
    put(f.team_a, f.event, f.team_a_difficulty);
  }
  const short = new Map(teams.map((t) => [t.id, t.short_name]));
  const pairs: RotationPair[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i].id;
      const b = teams[j].id;
      const perGw = gws.map((gw) => {
        const pa = diff.get(a)?.has(gw) ?? false;
        const pb = diff.get(b)?.has(gw) ?? false;
        const da = diff.get(a)?.get(gw) ?? 5;
        const db = diff.get(b)?.get(gw) ?? 5;
        // A club without a fixture is never the one to start; a week where neither plays is marked as a blank.
        if (!pa && !pb) return { gw, club: short.get(a) ?? "?", difficulty: BLANK_DIFFICULTY, blank: true };
        return pa && (!pb || da <= db) ? { gw, club: short.get(a) ?? "?", difficulty: da } : { gw, club: short.get(b) ?? "?", difficulty: db };
      });
      pairs.push({ clubs: [short.get(a) ?? "?", short.get(b) ?? "?"], average: Math.round((perGw.reduce((s, p) => s + p.difficulty, 0) / span) * 100) / 100, perGw });
    }
  }
  pairs.sort((x, y) => x.average - y.average || x.clubs.join().localeCompare(y.clubs.join()));
  if (!distinct) return pairs.slice(0, limit);
  const used = new Set<string>();
  const out: RotationPair[] = [];
  for (const p of pairs) {
    if (used.has(p.clubs[0]) || used.has(p.clubs[1])) continue;
    used.add(p.clubs[0]);
    used.add(p.clubs[1]);
    out.push(p);
    if (out.length === limit) break;
  }
  return out;
}

// ---------- set pieces, suspensions, DefCon ----------

export interface PlayerLine {
  id: number;
  name: string;
  teamId: number;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
  ownership: number;
  price: number;
  xp: number;
}

function line(e: FplElement, clubs: Map<number, { short_name: string; code: number }>): PlayerLine {
  return {
    id: e.id,
    name: e.web_name,
    teamId: e.team,
    club: clubs.get(e.team)?.short_name ?? "—",
    clubCode: clubs.get(e.team)?.code ?? null,
    positionId: e.element_type,
    ownership: num(e.selected_by_percent),
    price: e.now_cost ?? 0,
    xp: expectedPoints(e),
  };
}

const clubMap = (b: Pick<Bootstrap, "teams">) => new Map(b.teams.map((t) => [t.id, t]));

/** First-choice penalty takers who are fit to play, most promising first. */
export function penaltyTakers(bootstrap: Pick<Bootstrap, "elements" | "teams">, limit = 8): PlayerLine[] {
  const clubs = clubMap(bootstrap);
  return bootstrap.elements
    .filter((e) => e.penalties_order === 1 && likelyToPlay(e))
    .map((e) => line(e, clubs))
    .sort((a, b) => b.xp - a.xp || a.id - b.id)
    .slice(0, limit);
}

export interface SuspensionRow extends PlayerLine {
  yellows: number;
  /** The yellow-card count that brings a ban, and how many more cards that is. */
  threshold: number;
  toBan: number;
}

/** Players on the cards that bring a ban next (5, 10, 15), nearest first. Approximate: the exact cut-off dates are FPL's. */
export function suspensionWatch(bootstrap: Pick<Bootstrap, "elements" | "teams">, limit = 8): SuspensionRow[] {
  const clubs = clubMap(bootstrap);
  return bootstrap.elements
    .flatMap((e) => {
      const yellows = e.yellow_cards ?? 0;
      const threshold = SUSPENSION_TIERS.find((t) => yellows < t);
      return threshold && yellows >= threshold - 2 && yellows >= 3 ? [{ ...line(e, clubs), yellows, threshold, toBan: threshold - yellows }] : [];
    })
    .sort((a, b) => a.toBan - b.toBan || b.ownership - a.ownership || a.id - b.id)
    .slice(0, limit);
}

export interface DefconBanker extends PlayerLine {
  /** Defensive contributions per 90 minutes, and as a share of the threshold for the +2 bonus. */
  per90: number;
  share: number;
}

/** Defenders and midfielders who most often reach the DefCon threshold. */
export function defconBankers(bootstrap: Pick<Bootstrap, "elements" | "teams">, limit = 6): DefconBanker[] {
  const clubs = clubMap(bootstrap);
  return bootstrap.elements
    .filter((e) => (e.element_type === 2 || e.element_type === 3) && likelyToPlay(e) && (e.minutes ?? 0) >= 270 && num(e.defensive_contribution_per_90) > 0)
    .map((e) => ({ ...line(e, clubs), per90: num(e.defensive_contribution_per_90), share: num(e.defensive_contribution_per_90) / DEFCON_THRESHOLD[e.element_type] }))
    .sort((a, b) => b.share - a.share || a.id - b.id)
    .slice(0, limit);
}

// ---------- all of it ----------

export interface Lab {
  /** The gameweek the captain simulation is for. */
  gw: number;
  captain: CaptainLab;
  rotation: RotationPair[];
  penalties: PlayerLine[];
  suspensions: SuspensionRow[];
  defcon: DefconBanker[];
}

export function buildLab(
  bootstrap: Pick<Bootstrap, "elements" | "teams">,
  schedule: ScheduledFixture[],
  opponents: Map<number, NextOpponent[]>,
  gw: number,
  gamesElapsed: number,
  squad: number[] = [],
): Lab {
  return {
    gw,
    captain: captainLab(bootstrap, opponents, { gamesElapsed, squad, seed: gw }),
    rotation: rotationPairs(schedule, bootstrap.teams, gw),
    penalties: penaltyTakers(bootstrap),
    suspensions: suspensionWatch(bootstrap),
    defcon: defconBankers(bootstrap),
  };
}
