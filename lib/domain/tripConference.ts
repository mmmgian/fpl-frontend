/**
 * The altered press conference as a whole: three questions about the team's week (the same facts as the ordinary
 * conference), answered by a satirical newswire, the chemist from Basel, an atomic physicist or a radio scientist, and
 * two sneaky upside tips from the Oracle. Pure and deterministic.
 */
import type { AskKind, TopicId } from "./interview";
import { pickInterview } from "./interview";
import type { Candidate } from "./interviewFacts";
import { TRIP_ASKERS, TRIP_GENERAL_LINES, TRIP_OPENERS, TRIP_TOPICS, TRIP_VOICES, TRIP_VOICE_LINES, pickTrip, type TripExchange, type TripTip, type TripVoice } from "./tripInterview";

export type TripItem =
  | { kind: "topic"; topic: TopicId; ask: AskKind; voice: TripVoice; line: number; asker: number; opener: number }
  | ({ kind: "tip" } & TripExchange);

function rng(seed: number): () => number {
  let a = (Math.trunc(seed) ^ 0x1b873593) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffled = <T>(xs: readonly T[], next: () => number): T[] =>
  xs
    .map((x) => ({ x, k: next() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.x);

/**
 * `league` keeps managers of one league from hearing the same line from the same voice: they share `seed` and add
 * their own `slot` (place in the table), as in the ordinary conference.
 */
export function pickTripConference(seed: number, candidates: readonly Candidate[], tips: readonly TripTip[], league: { slot: number; seed: number }): TripItem[] {
  const next = rng(seed);
  const slot = Math.abs(Math.trunc(league.slot));
  const topics = pickInterview(seed, candidates, league).slice(0, TRIP_TOPICS);
  const voices = shuffled(TRIP_VOICES, next);
  const start = (voice: TripVoice) => Math.floor(rng(league.seed + Math.imul(TRIP_VOICES.indexOf(voice) + 7, 2654435761))() * TRIP_VOICE_LINES);
  // Six times in ten the voice talks about what was asked (the gist of the topic); otherwise it speaks to the mood.
  const lineFor = (voice: TripVoice) => {
    const base = start(voice) + slot;
    return next() < 0.6 ? TRIP_GENERAL_LINES + (base % (TRIP_VOICE_LINES - TRIP_GENERAL_LINES)) : base % TRIP_GENERAL_LINES;
  };

  const items: TripItem[] = [
    ...topics.map((x, i): TripItem => ({
      kind: "topic",
      topic: x.topic,
      ask: x.ask,
      voice: voices[i % voices.length],
      line: lineFor(voices[i % voices.length]),
      asker: Math.floor(next() * TRIP_ASKERS),
      opener: 0,
    })),
    ...pickTrip(seed ^ 0x5bd1e995, tips, TRIP_OPENERS, 5 - topics.length).map((t): TripItem => ({ kind: "tip", ...t })),
  ];
  const order = shuffled(items, next);
  const openers = shuffled(Array.from({ length: TRIP_OPENERS }, (_, k) => k), next);
  return order.map((it, i) => ({ ...it, opener: openers[i % openers.length] }));
}
