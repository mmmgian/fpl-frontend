/**
 * The press conference on the manager page: three questions (a clever one, a daft one, a satirical one) and three
 * answers (a genius's, a snark's, an egotist's), the answers dealt out across the questions. Pure and deterministic:
 * the same seed always gives the same conference, a different gameweek or manager gives a different one.
 */
export type AskKind = "genius" | "dumb" | "satirical";
export type AnswerKind = "genius" | "snarky" | "egotist";

/** The questions written for each kind of journalist; the copy for each lives in the message catalogs. */
export const TOPICS = {
  genius: ["variance", "regret"],
  dumb: ["pointsAim", "goalkeeper"],
  satirical: ["vibes", "groupChat"],
} as const satisfies Record<AskKind, readonly string[]>;

export type TopicId = (typeof TOPICS)[AskKind][number];

export const ASK_KINDS: readonly AskKind[] = ["genius", "dumb", "satirical"];
export const ANSWER_KINDS: readonly AnswerKind[] = ["genius", "snarky", "egotist"];

export interface Exchange {
  ask: AskKind;
  topic: TopicId;
  answer: AnswerKind;
}

/** A small, well-spread 32-bit hash step (mulberry32), enough to deal a few cards. */
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

/** The seed for one manager in one gameweek. */
export const interviewSeed = (entryId: number, gw: number): number => Math.imul(entryId, 31) + gw * 7919;

/**
 * Three exchanges in a seeded order: one question of each kind (a topic chosen at random from that kind), and the
 * three answer kinds dealt across them. The answers are never dealt "in step" (clever question to clever answer, daft
 * to snarky, satirical to egotist), because the mismatches are the joke.
 */
export function pickInterview(seed: number): Exchange[] {
  const next = rng(seed);
  const asks = shuffled(ASK_KINDS, next);
  const topics = asks.map((k) => TOPICS[k][Math.floor(next() * TOPICS[k].length)] as TopicId);
  const inStep: Record<AskKind, AnswerKind> = { genius: "genius", dumb: "snarky", satirical: "egotist" };
  let answers = shuffled(ANSWER_KINDS, next);
  // Only one of the six deals is fully in step; if we drew it, rotate by one.
  if (asks.every((k, i) => inStep[k] === answers[i])) answers = [answers[1], answers[2], answers[0]];
  return asks.map((ask, i) => ({ ask, topic: topics[i], answer: answers[i] }));
}

/** What the questions and answers may mention: always available for a team sheet. */
export interface InterviewContext {
  team: string;
  /** The manager's first name. */
  first: string;
  /** "Gameweek 6". */
  gw: string;
  points: number;
  total: number;
}

/** One question and the three possible answers to it, as written in a language. */
export interface InterviewTopic {
  q: (c: InterviewContext) => string;
  a: Record<AnswerKind, (c: InterviewContext) => string>;
}
