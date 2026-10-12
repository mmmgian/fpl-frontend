/**
 * The altered press conference: the mascot, eyes wide open, gives the manager sneaky upside tips for climbing the
 * world leaderboard, taken from this team's own numbers, from the little-owned players FPL expects to score, and from
 * the lab (captaincy simulation, rotation pairs, penalty takers, suspension and DefCon trackers).
 * Pure and deterministic, like the ordinary conference.
 */
import type { InterviewContext, InterviewFormat, InterviewInput } from "./interviewFacts";
import { PLAIN_FORMAT, nextDoor } from "./interviewFacts";

export const TRIP_TIPS = [
  "diffBuy", "captainRoulette", "riser", "sellCold", "breakTemplate", "benchBuy", "bankIdle", "ftRoll", "easyRun", "worldClimb", "hitMath", "chaos",
  "captainSim", "haulHunter", "penaltyTaker", "suspensionDanger", "defconBanker", "rotationPair", "rankTarget",
] as const;
export type TripTipId = (typeof TRIP_TIPS)[number];
export const TRIP_EXCHANGES = 7;

/**
 * Who answers the altered conference's ordinary questions: a satirical newswire, the chemist from Basel, the atomic
 * physicist, the radio scientist telling his life story, a nature-documentary narrator, a shipping-forecast reader,
 * a stargazer and the pilot on the intercom. Each has a pool of lines that work for any question. Every conference
 * hears a different four to six of the eight. (The sneaky tips are only one to three of the seven answers; the rest
 * are for the mood.)
 */
export const TRIP_VOICES = ["onion", "hofmann", "atomic", "lifesci", "nature", "forecast", "stargazer", "pilot"] as const;
export type TripVoice = (typeof TRIP_VOICES)[number];
export const TRIP_VOICE_LINES = 32;
/**
 * The first twenty-four lines of a voice answer any question; the last eight talk about what was asked. Twenty-four, so
 * that a league of twenty-one managers never hears the same all-purpose line twice from the same voice.
 */
export const TRIP_GENERAL_LINES = 24;
/** Ways the altered conference's questions are introduced. */
export const TRIP_OPENERS = 19;
/**
 * Some of those introductions belong to one voice ("Tonight on The Life Scientific" only leads into the life
 * scientist's answer); `null` ones suit any. Indexes are the same in every language.
 */
export const TRIP_OPENER_VOICE: readonly (TripVoice | null)[] = [
  "lifesci", "hofmann", null, "atomic", "onion", null, null, null, "atomic", "hofmann", "nature", "forecast", "stargazer", "pilot", null, null, null, null, null,
];
/** Journalists (each with a role of their own), and ways a tip's question or answer can be worded. */
export const TRIP_ASKERS = 8;
export const TRIP_VARIANTS = 3;
/** Closing flourishes the oracle may add to an answer. */
export const TRIP_FLOURISHES = 8;

/** The player (or pair of clubs) a tip is about, in the few numbers the words may quote. */
export interface TripSubject {
  name: string;
  club: string;
  /** Percent of managers who own him (0 when not about a player). */
  ownership: number;
  /** Expected points for the next gameweek, or a difficulty average for a pair of clubs. */
  xp: number;
  /** Chances of 10+ and 15+ points, 0..1, where a simulation gave them. */
  p10?: number;
  p15?: number;
  note?: string;
}

export interface TripTip {
  id: TripTipId;
  weight: number;
  subject: TripSubject | null;
}

export interface TripExchange {
  tip: TripTipId;
  subject: TripSubject | null;
  asker: number;
  q: number;
  a: number;
  opener: number;
  /** Which closing flourish, or -1 for none. */
  flourish: number;
}

/** What there is to advise this team on. Players it already owns are never recommended back to it. */
export function tripTips(i: InterviewInput, templateCount: number): TripTip[] {
  const owned = new Set(i.players.map((p) => p.name));
  // Not everyone in a league is sent to the same player: the k-th unowned one, k being the manager's place in the table.
  const slot = Math.abs(i.league?.rank ?? 0);
  const fresh = <T extends { name: string }>(xs: T[] | undefined) => {
    const open = (xs ?? []).filter((p) => !owned.has(p.name));
    return open.length ? open[slot % open.length] : null;
  };
  const tips: TripTip[] = [];
  const add = (id: TripTipId, weight: number, subject: TripSubject | null = null) => tips.push({ id, weight, subject });
  const player = (p: { name: string; club: string; ownership: number; xp: number }): TripSubject => ({ name: p.name, club: p.club, ownership: p.ownership, xp: p.xp });

  const diff = fresh(i.upside?.differentials);
  const gamble = fresh(i.upside?.captainGambles);
  const riser = fresh(i.upside?.risers);
  if (diff) add("diffBuy", 80, player(diff));
  if (gamble) add("captainRoulette", 85, player(gamble));
  if (riser) add("riser", 70, player(riser));

  const lab = i.lab;
  if (lab) {
    const mine = lab.captain.inSquad[0];
    if (mine) add("captainSim", 90, { name: mine.name, club: mine.club, ownership: mine.ownership, xp: mine.mean, p10: mine.p10, p15: mine.p15 });
    const ceiling = fresh(lab.captain.byCeiling);
    if (ceiling) add("haulHunter", 75, { name: ceiling.name, club: ceiling.club, ownership: ceiling.ownership, xp: ceiling.mean, p10: ceiling.p10, p15: ceiling.p15 });
    const taker = fresh(lab.penalties);
    if (taker) add("penaltyTaker", 65, player(taker));
    const risk = lab.suspensions.find((s) => owned.has(s.name));
    if (risk) add("suspensionDanger", 80, { name: risk.name, club: risk.club, ownership: risk.ownership, xp: risk.xp, note: String(risk.toBan) });
    const banker = fresh(lab.defcon);
    if (banker) add("defconBanker", 60, { ...player(banker), note: String(Math.round(banker.share * 100)) });
    const pair = lab.rotation.length ? lab.rotation[slot % lab.rotation.length] : null;
    if (pair) add("rotationPair", 60, { name: pair.clubs[0], club: pair.clubs[1], ownership: 0, xp: pair.average });
  }
  if (nextDoor(i.planet)) add("rankTarget", 70);

  if (i.players.some((p) => p.started && p.form != null && p.form <= 2)) add("sellCold", 75);
  if (templateCount >= 3) add("breakTemplate", 70);
  if (i.players.some((p) => !p.started && p.flag?.kind === "out")) add("benchBuy", 60);
  if (i.bank >= 10) add("bankIdle", 50);
  if ((i.freeTransfers ?? 0) >= 2) add("ftRoll", 55);
  if (i.outlook?.easiest) add("easyRun", 60);
  if (i.planet) add("worldClimb", 35);
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

/** Up to `count` tips in a seeded order, the likelier ones the heavier their weight. */
export function pickTrip(seed: number, tips: readonly TripTip[], openers: number, count = TRIP_EXCHANGES): TripExchange[] {
  const next = rng(seed);
  let pool = [...tips];
  const chosen: TripTip[] = [];
  const take = (t: TripTip) => {
    chosen.push(t);
    pool = pool.filter((x) => x.id !== t.id);
  };
  while (chosen.length < count && pool.length) {
    let r = next() * pool.reduce((s, t) => s + t.weight, 0);
    take(pool.find((t) => (r -= t.weight) < 0) ?? pool[pool.length - 1]);
  }
  const order = chosen.map((t) => ({ t, k: next() })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const spread = Array.from({ length: openers }, (_, k) => k).map((k) => ({ k, r: next() })).sort((a, b) => a.r - b.r).map((x) => x.k);
  const askers = Array.from({ length: TRIP_ASKERS }, (_, k) => k).map((k) => ({ k, r: next() })).sort((a, b) => a.r - b.r).map((x) => x.k);
  const flourishes = Array.from({ length: TRIP_FLOURISHES }, (_, k) => k).map((k) => ({ k, r: next() })).sort((a, b) => a.r - b.r).map((x) => x.k);
  return order.map((t, i) => ({
    tip: t.id,
    subject: t.subject,
    asker: askers[i % askers.length],
    q: Math.floor(next() * TRIP_VARIANTS),
    a: Math.floor(next() * TRIP_VARIANTS),
    opener: spread[i % spread.length],
    flourish: next() < 0.6 ? flourishes[i % flourishes.length] : -1,
  }));
}

/** The context for one tip: the ordinary one with the tip's subject filled in. */
export function tripContext(ctx: InterviewContext, subject: TripSubject | null, fmt: InterviewFormat = PLAIN_FORMAT): InterviewContext {
  if (!subject) return ctx;
  return {
    ...ctx,
    upName: subject.name,
    upClub: subject.club,
    upOwn: fmt.oneDecimal(subject.ownership),
    upXp: fmt.oneDecimal(subject.xp),
    upP10: subject.p10 == null ? "" : String(Math.round(subject.p10 * 100)),
    upP15: subject.p15 == null ? "" : String(Math.round(subject.p15 * 100)),
    upNote: subject.note ?? "",
  };
}
