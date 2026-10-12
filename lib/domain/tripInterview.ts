/**
 * The altered press conference: the mascot, eyes wide open, gives the manager sneaky upside tips for climbing the
 * world leaderboard, taken from this team's own numbers and from the little-owned players FPL expects to score.
 * Pure and deterministic, like the ordinary conference.
 */
import type { InterviewContext, InterviewFormat, InterviewInput } from "./interviewFacts";
import { PLAIN_FORMAT } from "./interviewFacts";
import type { UpsidePick } from "./upside";

export const TRIP_TIPS = ["diffBuy", "captainRoulette", "riser", "sellCold", "breakTemplate", "benchBuy", "bankIdle", "ftRoll", "easyRun", "worldClimb", "hitMath", "chaos"] as const;
export type TripTipId = (typeof TRIP_TIPS)[number];
export const TRIP_EXCHANGES = 5;
/** Ways the journalists are introduced, and ways a question or answer can be worded. */
export const TRIP_ASKERS = 3;
export const TRIP_VARIANTS = 2;

export interface TripTip {
  id: TripTipId;
  weight: number;
  /** The player the tip is about, for the tips that name one. */
  pick: UpsidePick | null;
}

export interface TripExchange {
  tip: TripTipId;
  pick: UpsidePick | null;
  asker: number;
  q: number;
  a: number;
  opener: number;
}

/** What there is to advise this team on. Players it already owns are never recommended back to it. */
export function tripTips(i: InterviewInput, templateCount: number): TripTip[] {
  const owned = new Set(i.players.map((p) => p.name));
  const fresh = (xs: UpsidePick[] | undefined) => xs?.find((p) => !owned.has(p.name)) ?? null;
  const tips: TripTip[] = [];
  const add = (id: TripTipId, weight: number, pick: UpsidePick | null = null) => tips.push({ id, weight, pick });
  const diff = fresh(i.upside?.differentials);
  const gamble = fresh(i.upside?.captainGambles);
  const riser = fresh(i.upside?.risers);
  if (diff) add("diffBuy", 80, diff);
  if (gamble) add("captainRoulette", 85, gamble);
  if (riser) add("riser", 70, riser);
  if (i.players.some((p) => p.started && p.form != null && p.form <= 2)) add("sellCold", 75);
  if (templateCount >= 3) add("breakTemplate", 70);
  if (i.players.some((p) => !p.started && p.flag?.kind === "out")) add("benchBuy", 60);
  if (i.bank >= 10) add("bankIdle", 50);
  if ((i.freeTransfers ?? 0) >= 2) add("ftRoll", 55);
  if (i.outlook?.easiest) add("easyRun", 60);
  if (i.planet) add("worldClimb", 90);
  if (i.hit >= 4) add("hitMath", 65);
  add("chaos", 20);
  return tips;
}

function rng(seed: number): () => number {
  let a = (Math.trunc(seed) ^ 0x7f4a7c15) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to five tips in a seeded order: the world-rank one always, the rest by weight. */
export function pickTrip(seed: number, tips: readonly TripTip[], openers: number): TripExchange[] {
  const next = rng(seed);
  let pool = [...tips];
  const chosen: TripTip[] = [];
  const take = (t: TripTip) => {
    chosen.push(t);
    pool = pool.filter((x) => x.id !== t.id);
  };
  const climb = pool.find((t) => t.id === "worldClimb");
  if (climb) take(climb);
  while (chosen.length < TRIP_EXCHANGES && pool.length) {
    let r = next() * pool.reduce((s, t) => s + t.weight, 0);
    take(pool.find((t) => (r -= t.weight) < 0) ?? pool[pool.length - 1]);
  }
  const order = chosen.map((t) => ({ t, k: next() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const spread = Array.from({ length: openers }, (_, k) => k).map((k) => ({ k, r: next() })).sort((a, b) => a.r - b.r).map((x) => x.k);
  return order.map((t, i) => ({
    tip: t.id,
    pick: t.pick,
    asker: (i + Math.floor(next() * TRIP_ASKERS)) % TRIP_ASKERS,
    q: Math.floor(next() * TRIP_VARIANTS),
    a: Math.floor(next() * TRIP_VARIANTS),
    opener: spread[i % spread.length],
  }));
}

/** The context for one tip: the ordinary one with the tip's player filled in. */
export function tripContext(ctx: InterviewContext, pick: UpsidePick | null, fmt: InterviewFormat = PLAIN_FORMAT): InterviewContext {
  return pick ? { ...ctx, upName: pick.name, upClub: pick.club, upOwn: fmt.oneDecimal(pick.ownership), upXp: fmt.oneDecimal(pick.xp) } : ctx;
}
