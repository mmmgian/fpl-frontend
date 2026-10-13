/**
 * The press conference on the manager page: seven questions (clever, daft or satirical) and seven answers in seven
 * different voices, in the order of a conversation.
 *
 * What is asked is chosen from what actually happened to this team: a blunder (a captain who blanked, points left on
 * the bench, a hit that bought nothing, an injured starter, a flopped chip), where it stands in the league, something
 * about the moment (a captain still to play, bonus FPL has not confirmed, the signed-off verdict, or the next
 * deadline's armband, fixtures, transfers and flags), and one thing from each other part of its week, never the same
 * fact twice. Only when there is too little to talk about does a timeless question fill the gap. Pure and
 * deterministic: the same seed and facts always give the same conference, and a different manager, gameweek, day or
 * FPL phase gives another.
 */
import type { Candidate, Group, InterviewContext } from "./interviewFacts";

export * from "./interviewFacts";
export * from "./tripInterview";

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
export const VOICE_LINES = 24;
/**
 * How many lines each generic voice also has about whatever was asked (quoting the topic's gist), in every language.
 * About half of the generic answers use one, so the voices that have no line written per topic still talk about it.
 */
export const VOICE_TOPICAL_LINES = 8;
/** How many ways a question can be introduced (each names the manager or the team). */
export const OPENERS = 14;
/**
 * Introductions that place the conference in its moment (mid-gameweek, bonus still provisional, signed off, the next
 * deadline ahead), per mood and in every language. They follow the ordinary ones: `OPENERS + k`.
 */
export const PHASE_OPENERS = 3;
/** Questions (and answers) in one conference. */
export const EXCHANGES = 7;
/**
 * Introductions that lean on what was said before ("Back to ...", "Moving on"), so never the
 * first question's; and the one that winds up ("Before you go"), only ever the last's. Same indexes in every language.
 */
export const OPENERS_AFTER_ANOTHER: readonly number[] = [2, 11];
export const OPENER_LAST = 13;

/** Every topic with something to say about this team, by where it comes from. Each has a question in every style. */
export const GROUP_TOPICS = {
  /** Things that went wrong with the picks. */
  blunder: ["captainBlank", "captainRegret", "captainUnused", "benchHaul", "hitTaken", "autoSubbed", "chipFlop", "badWeek", "viceBetter"],
  /** Injuries, suspensions and players who never played. */
  injury: ["injuredStarter", "injuredBench", "squadInjuries", "captainDoubt", "ghostStarter", "rotatedOut"],
  /** Goals, assists and expected goals. */
  attack: ["hatTrick", "brace", "defenderScored", "assistHaul", "blankAttack", "xgWaste", "luckyGoals", "unluckyXg", "penMiss", "ownGoal", "captainHaul"],
  /** Clean sheets, saves, cards and defensive contributions. */
  defence: ["cleanSheets", "leakyDefence", "keeperSaves", "keeperBlank", "redCard", "yellowFest", "defconHaul", "defconNear"],
  /** Who was picked, what they cost, who owns them. */
  market: ["idleBank", "expensiveFlop", "templateBlank", "differentialHit", "coldStarter", "hotBench", "tripleUp", "formation", "oneManShow", "subSaved", "toughRun"],
  /** The long view: rank, value, transfers and the season so far. */
  season: ["seasonBench", "seasonHits", "rankRise", "rankFall", "planetTop", "planetLow", "valueUp", "valueDown", "beatLow", "beatHigh", "noTransfers", "bigRevamp", "ftBanked"],
  /** The team's place in the league. */
  position: ["leader", "chasing", "midtable", "dropzone", "lastPlace", "looksUp", "looksBack", "climber", "faller"],
  /**
   * The moment: while live, a captain still to play or a crowd still to come; while FPL's bonus is provisional, that
   * bonus; once signed off, the verdict; and before the next deadline, its armband, a hard fixture, the free transfers
   * and a flag to act on.
   */
  phase: ["captainWaiting", "stillToPlay", "bonusPending", "finalVerdict", "nextCaptain", "nextFixture", "nextTransfers", "nextFlag"],
} as const satisfies Record<Group, readonly string[]>;

/** Timeless questions, used only when there is too little to ask about. Each has a question in one style. */
export const FILLER_TOPICS = {
  genius: ["variance", "armband", "luck"],
  dumb: ["pointsAim", "goalkeeper", "chipWhat"],
  satirical: ["vibes", "groupChat", "mascot"],
} as const satisfies Record<AskKind, readonly string[]>;

export type FullTopic = (typeof GROUP_TOPICS)[Group][number];
export type FillerTopic = (typeof FILLER_TOPICS)[AskKind][number];
export type TopicId = FullTopic | FillerTopic;

export const FULL_TOPICS: readonly FullTopic[] = Object.values(GROUP_TOPICS).flat();
export const ALL_TOPICS: readonly TopicId[] = [...FULL_TOPICS, ...Object.values(FILLER_TOPICS).flat()];

/**
 * Topics that ask about the same fact in different words (the gap to the leader and the gap to the team above, the
 * world rank going up and the world rank being high, ...): a conference asks at most one of each set.
 */
export const SAME_FACT: readonly (readonly string[])[] = [
  GROUP_TOPICS.position,
  ["rankRise", "rankFall", "planetTop", "planetLow"],
  ["valueUp", "valueDown"],
  ["beatLow", "beatHigh"],
  ["benchHaul", "seasonBench"],
  ["hitTaken", "seasonHits"],
  ["captainBlank", "captainRegret", "captainUnused", "captainDoubt", "captainHaul", "viceBetter", "captainWaiting"],
  ["injuredStarter", "injuredBench", "squadInjuries", "ghostStarter", "nextFlag"],
  ["captainDoubt", "nextFlag"],
  ["captainWaiting", "stillToPlay"],
  ["ftBanked", "nextTransfers"],
  ["toughRun", "nextFixture"],
  ["badWeek", "finalVerdict"],
  ["xgWaste", "luckyGoals", "unluckyXg"],
  ["hatTrick", "brace"],
  ["redCard", "yellowFest"],
  ["keeperSaves", "keeperBlank"],
  ["noTransfers", "bigRevamp", "ftBanked"],
];
const sameFact = (a: string, b: string) => a === b || SAME_FACT.some((set) => set.includes(a) && set.includes(b));

const GROUP_OF: ReadonlyMap<string, Group> = new Map(Object.entries(GROUP_TOPICS).flatMap(([group, topics]) => topics.map((t) => [t, group as Group] as const)));
/** A conference starts with a headline (what went wrong, or where the team stands) and ends on the long view, what comes next, or a light one. */
const OPEN_WITH: readonly (Group | undefined)[] = ["position", "blunder", "injury"];
const CLOSE_WITH: readonly (Group | undefined)[] = ["season", "market", "phase", undefined];

/**
 * Puts questions in the order of a conversation: a headline first, the long view or a light one last, and in between
 * no two in a row about the same part of the week or in the same style, as far as the questions allow. Up to four
 * hundred seeded orders are tried (stopping at the first perfect one) and the smoothest kept (repeating an area counts for more than repeating a style).
 * Takes whatever has `topic` and `ask`, so the altered conference shares it.
 */
export function arrange<T extends { topic: TopicId; ask: AskKind }>(items: readonly T[], next: () => number): T[] {
  if (items.length < 3) return shuffled(items, next);
  const groupOf = (r: T) => GROUP_OF.get(r.topic);
  const rough = (seq: readonly T[]) =>
    seq.reduce((sum, r, i) => (i === 0 ? 0 : sum + (groupOf(r) !== undefined && groupOf(r) === groupOf(seq[i - 1]) ? 3 : 0) + (r.ask === seq[i - 1].ask ? 1 : 0)), 0);
  let best: T[] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 400 && bestScore > 0; attempt++) {
    const rest = shuffled(items, next);
    const pull = (wanted: readonly (Group | undefined)[], fallback: number) => {
      const at = rest.findIndex((r) => wanted.includes(groupOf(r)));
      return rest.splice(at >= 0 ? at : fallback, 1)[0];
    };
    const first = pull(OPEN_WITH, 0);
    const last = pull(CLOSE_WITH, rest.length - 1);
    const seq = [first, ...rest, last];
    const score = rough(seq);
    if (score < bestScore) {
      best = seq;
      bestScore = score;
    }
  }
  return best;
}

export interface Exchange {
  ask: AskKind;
  topic: TopicId;
  answer: AnswerKind;
  /** Which of a generic voice's lines (0 .. VOICE_LINES - 1); unused for the first three voices. Differs between managers of a league. */
  line: number;
  /**
   * For a generic voice: which of its lines about what was asked (0 .. VOICE_TOPICAL_LINES - 1) it says instead of
   * `line`, or -1 for the all-purpose one. Always -1 for the first three voices.
   */
  topical: number;
  /**
   * Which way the journalist introduces the question: 0 .. OPENERS - 1 for the ordinary ones, OPENERS + k for the k-th
   * introduction of the conference's mood (only when asked for). Each is a different phrase, so no two questions open alike.
   */
  opener: number;
}

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
 * The seed for one manager in one gameweek. `salt` is the shared variety key (`varietyKey(gw, status, now)` from
 * ./gameweek): it changes every UTC day, whatever the phase, and the moment FPL moves the gameweek on (live ->
 * provisional -> final), so the conference is redrawn daily and again when FPL signs the scores off. Without a salt
 * (0) the seed is the manager's and the gameweek's alone.
 */
export const interviewSeed = (entryId: number, gw: number, salt = 0): number => (Math.imul(entryId, 31) + Math.imul(gw, 7919) + Math.imul(salt, 104729)) | 0;

/** "gian" -> "Gian", "danny lopez" -> "Danny Lopez"; names already in capitals or mixed case ("McKay") are left as they are. */
export const neatName = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => (w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

/**
 * Take one at random, the bigger the weight the likelier (squared, so a big blunder beats a small one most of the time).
 * A topic that "belongs" to this manager's place in the table today (its number plus the place plus the day's `turn`
 * is a multiple of four) counts for more, so in one league different managers lean to different topics instead of
 * all being asked the same thing, and from one day to the next the same manager leans to different ones.
 */
function draw(items: Candidate[], next: () => number, slot: number, turn: number): Candidate {
  const weights = items.map((c) => c.weight * c.weight * ((ALL_TOPICS.indexOf(c.topic) + slot + turn) % 4 === 0 ? 3 : 1));
  let r = next() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

const FILLERS: { topic: TopicId; ask: AskKind }[] = ASK_KINDS.flatMap((ask) => FILLER_TOPICS[ask].map((topic) => ({ topic: topic as TopicId, ask })));

/**
 * Seven exchanges (or `count`) in a seeded order. The conference is about this team: one thing that went wrong, then
 * the league position, then one from each other area of its week not yet asked about. Timeless questions fill in
 * only when there are fewer things to ask than that. Question styles are spread as evenly as the topics allow, and
 * `arrange` puts them in the order of a conversation. The answers go to different voices dealt at random: two or
 * three of the voices that have a line written for each question (clever, snarky, egotist), the rest generic ones
 * (dim, nonchalant, spin doctor, conspiracy theorist, drama queen), so the same question gets a different reply in a
 * different league. Openers are all different, and the ones that only fit after another question or at the very
 * end are put where they fit.
 *
 * `league` keeps managers of one league from getting the same generic line: all of them share `seed` (the same for the
 * whole league on a given day) to pick each voice's starting line, and each adds its own `slot` (its place in the
 * table), so two managers hear the same line from the same voice only if their slots are a whole cycle apart. The
 * shared seed also turns, day by day, which topics a manager leans to and which clever, snarky or egotist voice a
 * topic prefers, so a fact that stays true all week is not answered by the same voice in the same words every day.
 *
 * Generic voices talk about what was asked six times in ten (a line quoting the topic's gist, `topical`), otherwise
 * to the mood. With `moodOpeners`, that many introductions of the conference's moment join the ordinary ones.
 */
export function pickInterview(
  seed: number,
  candidates: readonly Candidate[],
  league: { slot: number; seed: number } = { slot: seed, seed: 0 },
  count = EXCHANGES,
  moodOpeners = 0,
): Exchange[] {
  const next = rng(seed);
  const slot = Math.abs(Math.trunc(league.slot));
  const shared = league.seed >>> 0;
  const turnTopic = (shared >>> 3) % 4;
  const turnVoice = (shared >>> 7) % SPECIFIC_ANSWERS.length;
  let pool = [...candidates];
  const chosen: FullTopic[] = [];
  // One thing that went wrong, one about the league, one about the moment (what is still to play, the provisional
  // bonus, the verdict or the next deadline); then one from each other area not yet asked about, so the questions are
  // about different parts of the team's week (and only then repeat an area).
  const used = new Set<Group>();
  const takeFrom = (groups: readonly Group[]) => {
    const from = pool.filter((c) => groups.includes(c.group));
    if (from.length === 0) return;
    const pick = draw(from, next, slot, turnTopic);
    used.add(pick.group);
    chosen.push(pick.topic);
    pool = pool.filter((c) => !sameFact(c.topic, pick.topic));
  };
  takeFrom(["blunder", "injury"]);
  takeFrom(["position"]);
  if (chosen.length < count) takeFrom(["phase"]);
  while (chosen.length < count && pool.length) {
    const fresh = pool.filter((c) => !used.has(c.group));
    takeFrom(fresh.length ? [...new Set(fresh.map((c) => c.group))] : [...new Set(pool.map((c) => c.group))]);
  }

  const fillers = shuffled(FILLERS, next).slice(0, count - chosen.length);
  const styleCount = new Map<AskKind, number>(ASK_KINDS.map((k) => [k, fillers.filter((f) => f.ask === k).length]));
  const rounds: { ask: AskKind; topic: TopicId }[] = [...fillers];
  for (const topic of chosen) {
    // The style used least so far, ties broken at random, so the questions are never all in one style.
    const least = Math.min(...styleCount.values());
    const ask = shuffled(ASK_KINDS.filter((k) => styleCount.get(k) === least), next)[0];
    styleCount.set(ask, (styleCount.get(ask) ?? 0) + 1);
    rounds.push({ ask, topic });
  }
  const order = arrange(rounds, next);

  const specific = shuffled(SPECIFIC_ANSWERS, next).slice(0, Math.min(count, 2 + Math.floor(next() * 2)));
  const crowd = shuffled([...specific, ...shuffled(GENERIC_ANSWERS, next).slice(0, count - specific.length)], next);
  // Where a topic is asked of several managers, they should not all hear the same voice answer it: the voice a topic
  // prefers depends on the manager's place in the table and on the day, and it gets that voice if it is one of the
  // voices dealt for the day.
  const voices: AnswerKind[] = [];
  const left = [...crowd];
  for (const r of order) {
    const preferred = SPECIFIC_ANSWERS[(ALL_TOPICS.indexOf(r.topic) + slot + turnVoice) % SPECIFIC_ANSWERS.length];
    const at = left.indexOf(preferred);
    voices.push(at >= 0 ? left.splice(at, 1)[0] : (undefined as unknown as AnswerKind));
  }
  for (let k = 0; k < voices.length; k++) if (voices[k] === undefined) voices[k] = left.shift()!;
  const start = (voice: AnswerKind, lines: number, salt = 0) => Math.floor(rng(league.seed + Math.imul(ANSWER_KINDS.indexOf(voice) + 1 + salt, 2654435761))() * lines);
  const isGeneric = (v: AnswerKind) => (GENERIC_ANSWERS as readonly string[]).includes(v);
  const topical = voices.map((v) => (isGeneric(v) && next() < 0.6 ? (start(v, VOICE_TOPICAL_LINES, 11) + slot) % VOICE_TOPICAL_LINES : -1));
  const free = shuffled(Array.from({ length: OPENERS + Math.max(0, moodOpeners) }, (_, i) => i), next);
  const last = order.length - 1;
  const opener = (i: number) => {
    // The winding-up introduction is the last question's about half the time, and nobody else's.
    const closing = i === last && i > 0 && next() < 0.5 ? free.indexOf(OPENER_LAST) : -1;
    const at = closing >= 0 ? closing : free.findIndex((k) => !(i === 0 && OPENERS_AFTER_ANOTHER.includes(k)) && k !== OPENER_LAST);
    return free.splice(at >= 0 ? at : 0, 1)[0];
  };
  return order.map((r, i) => ({ ask: r.ask, topic: r.topic, answer: voices[i], line: (start(voices[i], VOICE_LINES) + slot) % VOICE_LINES, topical: topical[i], opener: opener(i) }));
}

/** Catalog shape: one question per style the topic is written in, and an answer in each of the three topic-specific voices. */
export interface InterviewTopic {
  q: Partial<Record<AskKind, (c: InterviewContext) => string>>;
  a: Record<SpecificAnswer, (c: InterviewContext) => string>;
}

/** A generic voice: lines that answer any question, written in that voice. */
export type InterviewVoice = ((c: InterviewContext) => string)[];
/** A generic voice's lines about whatever was asked: `g` is the topic's gist ("a −4 hit", "Salah's brace"). */
export type InterviewTopicalVoice = ((c: InterviewContext, g: string) => string)[];
/** How a journalist introduces a question; `q` is the question itself. */
export type InterviewOpener = (c: InterviewContext, q: string) => string;
