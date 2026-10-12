/**
 * The press conference on the manager page: three questions (a clever one, a daft one, a satirical one) and three
 * answers (a genius's, a snark's, an egotist's), the answers dealt out across the questions.
 *
 * What is asked is chosen from what actually happened to this team: blunders first (a captain who blanked, points
 * left on the bench, a hit that bought nothing, an injured starter, a flopped chip), then where it stands in the
 * league. Only when there is too little to talk about does a timeless question fill the gap. Pure and deterministic:
 * the same seed and facts always give the same conference, and a different manager or gameweek gives another.
 */
export type AskKind = "genius" | "dumb" | "satirical";
/** Who answers. The first three have a line written for every question; the rest have a pool of lines for any question. */
export type AnswerKind = "genius" | "snarky" | "egotist" | "dim" | "chill" | "pr" | "conspiracy" | "dramatic";
export type SpecificAnswer = "genius" | "snarky" | "egotist";
export type GenericAnswer = Exclude<AnswerKind, SpecificAnswer>;

export const ASK_KINDS: readonly AskKind[] = ["genius", "dumb", "satirical"];
export const SPECIFIC_ANSWERS: readonly SpecificAnswer[] = ["genius", "snarky", "egotist"];
export const GENERIC_ANSWERS: readonly GenericAnswer[] = ["dim", "chill", "pr", "conspiracy", "dramatic"];
export const ANSWER_KINDS: readonly AnswerKind[] = [...SPECIFIC_ANSWERS, ...GENERIC_ANSWERS];
/** How many lines each generic voice has, in every language. */
export const VOICE_LINES = 12;
/** How many ways a question can be introduced (each names the manager or the team). */
export const OPENERS = 6;
/** Questions (and answers) in one conference. */
export const EXCHANGES = 5;

/** Topics that come from what went wrong (or oddly) for this team. Each has a question in every style. */
export const BLUNDER_TOPICS = [
  "captainBlank", "captainRegret", "captainUnused", "benchHaul", "hitTaken", "injuredStarter",
  "autoSubbed", "chipFlop", "badWeek", "seasonBench", "seasonHits", "idleBank",
] as const;

/** Topics about the team's place in the league. Each has a question in every style. */
export const POSITION_TOPICS = ["leader", "chasing", "midtable", "dropzone", "lastPlace", "looksUp", "looksBack", "climber", "faller"] as const;

/** Timeless questions, used only when there is too little to ask about. Each has a question in one style. */
export const FILLER_TOPICS = {
  genius: ["variance", "armband", "luck"],
  dumb: ["pointsAim", "goalkeeper", "chipWhat"],
  satirical: ["vibes", "groupChat", "mascot"],
} as const satisfies Record<AskKind, readonly string[]>;

export type BlunderTopic = (typeof BLUNDER_TOPICS)[number];
export type PositionTopic = (typeof POSITION_TOPICS)[number];
export type FillerTopic = (typeof FILLER_TOPICS)[AskKind][number];
export type FullTopic = BlunderTopic | PositionTopic;
export type TopicId = FullTopic | FillerTopic;

export const ALL_TOPICS: readonly TopicId[] = [...BLUNDER_TOPICS, ...POSITION_TOPICS, ...Object.values(FILLER_TOPICS).flat()];

export interface Exchange {
  ask: AskKind;
  topic: TopicId;
  answer: AnswerKind;
  /** Which of a generic voice's lines (0 .. VOICE_LINES - 1); unused for the first three voices. Differs between managers of a league. */
  line: number;
  /** Which way the journalist introduces the question (0 .. OPENERS - 1); each is a different phrase, so no two questions open alike. */
  opener: number;
}

// ---------- what happened ----------

/** The facts the conference is built from, already in the reader's words and numbers. Every part is optional-by-data. */
export interface InterviewInput {
  team: string;
  /** The manager's first name, and full name, as a journalist would say them. */
  first: string;
  manager: string;
  /** "Gameweek 6". */
  gw: string;
  /** Points scored (after any hit). */
  points: number;
  total: number;
  /** Transfer hit in points (0 = none). */
  hit: number;
  /** Money in the bank, in tenths of £m, and as the reader would see it. */
  bank: number;
  bankText: string;
  /** False while the gameweek is still being played: partial scores prove nothing, so blunders wait. */
  settled: boolean;
  league: {
    rank: number;
    size: number;
    points: number;
    leader: { team: string; points: number };
    up: { team: string; points: number } | null;
    down: { team: string; points: number } | null;
    /** Places climbed since the last gameweek (negative = fell). */
    moved: number;
  } | null;
  captain: { name: string; base: number; state: "played" | "waiting" | "unused"; bestName: string; bestBase: number; regret: number | null } | null;
  bench: { points: number; top: { name: string; points: number } | null; counted: boolean } | null;
  chip: { code: string; label: string; points: number } | null;
  /** A starter FPL flags as out or doubtful, with the flag in the reader's language. */
  flagged: { name: string; label: string } | null;
  autoSub: { out: string; in: string } | null;
  season: { average: number; benchPoints: number; hitPoints: number } | null;
}

/** What a question or answer may mention. Every field is always filled; a topic only uses what it was chosen for. */
export interface InterviewContext {
  team: string;
  first: string;
  manager: string;
  gw: string;
  points: number;
  total: number;
  rank: number;
  size: number;
  leader: string;
  leaderGap: number;
  upTeam: string;
  gapUp: number;
  downTeam: string;
  gapDown: number;
  /** Places climbed or fallen, always positive. */
  places: number;
  captain: string;
  captainPts: number;
  best: string;
  bestPts: number;
  regret: number;
  bench: number;
  benchTop: string;
  benchTopPts: number;
  hit: number;
  flagged: string;
  flaggedLabel: string;
  subOut: string;
  subIn: string;
  chip: string;
  chipPts: number;
  avg: number;
  seasonBench: number;
  seasonHits: number;
  bank: string;
}

export function interviewContext(i: InterviewInput): InterviewContext {
  const l = i.league;
  return {
    team: i.team,
    first: i.first,
    manager: i.manager,
    gw: i.gw,
    points: i.points,
    total: i.total,
    rank: l?.rank ?? 0,
    size: l?.size ?? 0,
    leader: l?.leader.team ?? "",
    leaderGap: l ? Math.max(0, l.leader.points - l.points) : 0,
    upTeam: l?.up?.team ?? "",
    gapUp: l?.up ? Math.max(0, l.up.points - l.points) : 0,
    downTeam: l?.down?.team ?? "",
    gapDown: l?.down ? Math.max(0, l.points - l.down.points) : 0,
    places: Math.abs(l?.moved ?? 0),
    captain: i.captain?.name ?? "",
    captainPts: i.captain?.base ?? 0,
    best: i.captain?.bestName ?? "",
    bestPts: i.captain?.bestBase ?? 0,
    regret: i.captain?.regret ?? 0,
    bench: i.bench?.points ?? 0,
    benchTop: i.bench?.top?.name ?? "",
    benchTopPts: i.bench?.top?.points ?? 0,
    hit: i.hit,
    flagged: i.flagged?.name ?? "",
    flaggedLabel: i.flagged?.label ?? "",
    subOut: i.autoSub?.out ?? "",
    subIn: i.autoSub?.in ?? "",
    chip: i.chip?.label ?? "",
    chipPts: i.chip?.points ?? 0,
    avg: Math.round(i.season?.average ?? 0),
    seasonBench: i.season?.benchPoints ?? 0,
    seasonHits: i.season?.hitPoints ?? 0,
    bank: i.bankText,
  };
}

export type Group = "blunder" | "position";
export interface Candidate {
  topic: FullTopic;
  group: Group;
  /** How much there is to say: bigger blunders and sharper league situations are asked about more often. */
  weight: number;
}

const BAD_CAPTAIN_BASE = 3;
const NEAR_POINTS = 15;
const BIG_BENCH = 8;
const SEASON_BENCH = 40;
const SEASON_HITS = 8;
const IDLE_BANK = 20;

/** What there is to ask this team about, with how much each is worth. Never empty only if the league is known. */
export function candidatesOf(i: InterviewInput): Candidate[] {
  const out: Candidate[] = [];
  const add = (topic: FullTopic, group: Group, weight: number) => out.push({ topic, group, weight });
  const c = i.captain;

  // blunders
  if (c?.state === "unused") add("captainUnused", "blunder", 95);
  if (i.settled && c?.state === "played" && c.regret != null) {
    if (c.base <= BAD_CAPTAIN_BASE && c.regret >= 6) add("captainBlank", "blunder", 70 + Math.min(c.regret, 30));
    else if (c.base > BAD_CAPTAIN_BASE && c.regret >= 8) add("captainRegret", "blunder", 55 + Math.min(c.regret, 30));
  }
  if (i.settled && i.bench && !i.bench.counted && i.bench.points >= BIG_BENCH && i.bench.top) add("benchHaul", "blunder", 45 + Math.min(i.bench.points * 2, 40));
  if (i.hit >= 4) add("hitTaken", "blunder", 55 + Math.min(i.hit * 2, 24));
  if (i.flagged) add("injuredStarter", "blunder", 65);
  if (i.settled && i.autoSub) add("autoSubbed", "blunder", 45);
  if (i.settled && i.chip && (i.chip.code === "3xc" ? i.chip.points <= 6 : i.chip.code === "bboost" && i.chip.points <= 8)) add("chipFlop", "blunder", 90);
  if (i.settled && i.season && i.season.average > 0 && i.points <= i.season.average * 0.75) add("badWeek", "blunder", 60 + Math.min(Math.round(i.season.average - i.points), 30));
  if (i.season && i.season.benchPoints >= SEASON_BENCH) add("seasonBench", "blunder", 35 + Math.min(Math.round(i.season.benchPoints / 4), 25));
  if (i.season && i.season.hitPoints >= SEASON_HITS) add("seasonHits", "blunder", 40 + Math.min(i.season.hitPoints, 25));
  if (i.bank >= IDLE_BANK) add("idleBank", "blunder", 30 + Math.min(i.bank, 30));

  // where it stands
  const l = i.league;
  if (l && l.size > 1) {
    const toLeader = l.leader.points - l.points;
    if (l.rank === 1) {
      if (l.down && l.points - l.down.points >= 1) add("leader", "position", 70);
    } else if (l.rank <= 4 && toLeader >= 1) add("chasing", "position", 55);
    if (l.rank === l.size) add("lastPlace", "position", 90);
    else if (l.rank > l.size - 4) add("dropzone", "position", 65);
    else if (l.rank > 4) add("midtable", "position", 40);
    if (l.rank > 1 && l.up && l.up.points - l.points >= 1 && l.up.points - l.points <= NEAR_POINTS) add("looksUp", "position", 45);
    if (l.down && l.points - l.down.points >= 1 && l.points - l.down.points <= NEAR_POINTS) add("looksBack", "position", 45);
    if (l.moved >= 2) add("climber", "position", 50);
    if (l.moved <= -2) add("faller", "position", 55);
  }
  return out;
}

// ---------- dealing the conference ----------

/** A small, well-spread 32-bit generator (mulberry32), enough to deal a few cards. */
function rng(seed: number): () => number {
  let a = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The seed for one manager in one gameweek. While the gameweek is being played, `day` (days since 1970) changes it daily,
 * so the conference is fresh each day; once the gameweek is over pass 0 and it never changes again.
 */
export const interviewSeed = (entryId: number, gw: number, day = 0): number => Math.imul(entryId, 31) + gw * 7919 + Math.imul(day, 104729);

/** "gian" -> "Gian", "danny lopez" -> "Danny Lopez"; names already in capitals or mixed case ("McKay") are left as they are. */
export const neatName = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/** Take one at random, the bigger the weight the likelier (squared, so a big blunder beats a small one most of the time). */
function draw(items: Candidate[], next: () => number): Candidate {
  const weights = items.map((c) => c.weight * c.weight);
  let r = next() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

const FILLERS: { topic: TopicId; ask: AskKind }[] = ASK_KINDS.flatMap((ask) => FILLER_TOPICS[ask].map((topic) => ({ topic: topic as TopicId, ask })));

/**
 * Five exchanges in a seeded order. The first question is about a blunder when there is one, the second about the
 * league position, the rest about whatever else there is to say, so the conference is about this team. Timeless
 * questions fill in only when there are fewer than five things to ask. Question styles are spread as evenly as the
 * topics allow. The answers go to five different voices dealt at random: at least two of the voices that have a line
 * written for each question (clever, snarky, egotist), the rest generic ones (dim, nonchalant, spin doctor,
 * conspiracy theorist, drama queen), so the same question gets a different reply in a different league.
 *
 * `league` keeps managers of one league from getting the same generic line: all of them share `seed` (the same for the
 * whole league on a given day) to pick each voice's starting line, and each adds its own `slot` (its place in the
 * table), so two managers hear the same line from the same voice only if their slots are a whole cycle apart.
 */
export function pickInterview(seed: number, candidates: readonly Candidate[], league: { slot: number; seed: number } = { slot: seed, seed: 0 }): Exchange[] {
  const next = rng(seed);
  let pool = [...candidates];
  const chosen: FullTopic[] = [];
  const take = (from: Candidate[]) => {
    if (from.length === 0) return;
    const pick = draw(from, next);
    chosen.push(pick.topic);
    pool = pool.filter((c) => c.topic !== pick.topic);
  };
  take(pool.filter((c) => c.group === "blunder"));
  take(pool.filter((c) => c.group === "position"));
  while (chosen.length < EXCHANGES && pool.length) take(pool);

  const fillers = shuffled(FILLERS, next).slice(0, EXCHANGES - chosen.length);
  const used = new Map<AskKind, number>(ASK_KINDS.map((k) => [k, fillers.filter((f) => f.ask === k).length]));
  const rounds: { ask: AskKind; topic: TopicId }[] = [...fillers];
  for (const topic of chosen) {
    // The style used least so far, ties broken at random, so five questions are never all in one style.
    const least = Math.min(...used.values());
    const ask = shuffled(ASK_KINDS.filter((k) => used.get(k) === least), next)[0];
    used.set(ask, (used.get(ask) ?? 0) + 1);
    rounds.push({ ask, topic });
  }
  const order = shuffled(rounds, next);

  const specific = shuffled(SPECIFIC_ANSWERS, next).slice(0, 2 + Math.floor(next() * 2));
  const voices = shuffled([...specific, ...shuffled(GENERIC_ANSWERS, next).slice(0, EXCHANGES - specific.length)], next);
  const start = (voice: AnswerKind) => Math.floor(rng(league.seed + Math.imul(ANSWER_KINDS.indexOf(voice) + 1, 2654435761))() * VOICE_LINES);
  const openers = shuffled(Array.from({ length: OPENERS }, (_, i) => i), next);
  return order.map((r, i) => ({ ask: r.ask, topic: r.topic, answer: voices[i], line: (start(voices[i]) + Math.abs(Math.trunc(league.slot))) % VOICE_LINES, opener: openers[i] }));
}

/** Catalog shape: one question per style the topic is written in, and an answer in each of the three topic-specific voices. */
export interface InterviewTopic {
  q: Partial<Record<AskKind, (c: InterviewContext) => string>>;
  a: Record<SpecificAnswer, (c: InterviewContext) => string>;
}

/** A generic voice: lines that answer any question, written in that voice. */
export type InterviewVoice = ((c: InterviewContext) => string)[];
