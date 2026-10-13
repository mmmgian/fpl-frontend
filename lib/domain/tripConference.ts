/**
 * The altered press conference as a whole: four to six questions about the team's week (the same facts as the
 * ordinary conference, in the same conversational order), each answered by a different one of eight strange voices,
 * and one to three sneaky upside tips from the Oracle slipped in between. Seven different journalists put the seven
 * questions, and an introduction that belongs to one voice only ever leads into that voice's answer. Pure and
 * deterministic.
 */
import type { AskKind, TopicId } from "./interview";
import { pickInterview } from "./interview";
import type { Candidate } from "./interviewFacts";
import { TRIP_ASKERS, TRIP_EXCHANGES, TRIP_GENERAL_LINES, TRIP_OPENERS, TRIP_OPENER_VOICE, TRIP_VOICES, TRIP_VOICE_LINES, pickTrip, type TripExchange, type TripTip, type TripVoice } from "./tripInterview";

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
 * their own `slot` (place in the table), as in the ordinary conference. With `moodOpeners`, that many introductions of
 * the conference's moment (indexes TRIP_OPENERS + k, suiting any voice) join the ordinary ones.
 */
export function pickTripConference(seed: number, candidates: readonly Candidate[], tips: readonly TripTip[], league: { slot: number; seed: number }, moodOpeners = 0): TripItem[] {
  const next = rng(seed);
  const slot = Math.abs(Math.trunc(league.slot));
  // Mostly two sneaky tips; sometimes one, sometimes three (if the team has that much to be advised on).
  const r = next();
  const tipItems = pickTrip(seed ^ 0x5bd1e995, tips, TRIP_OPENERS, r < 0.25 ? 1 : r < 0.8 ? 2 : 3);
  const topics = pickInterview(seed, candidates, league, TRIP_EXCHANGES - tipItems.length);
  const voices = shuffled(TRIP_VOICES, next);
  const start = (voice: TripVoice) => Math.floor(rng(league.seed + Math.imul(TRIP_VOICES.indexOf(voice) + 7, 2654435761))() * TRIP_VOICE_LINES);
  // Six times in ten the voice talks about what was asked (the gist of the topic); otherwise it speaks to the mood.
  const lineFor = (voice: TripVoice) => {
    const base = start(voice) + slot;
    return next() < 0.6 ? TRIP_GENERAL_LINES + (base % (TRIP_VOICE_LINES - TRIP_GENERAL_LINES)) : base % TRIP_GENERAL_LINES;
  };

  const asked = topics.map((x, i): TripItem => ({ kind: "topic", topic: x.topic, ask: x.ask, voice: voices[i], line: lineFor(voices[i]), asker: 0, opener: 0 }));
  // The tips are never the first thing said and never two in a row: pick their places among the later ones.
  const total = asked.length + tipItems.length;
  const room = total - 1;
  const chosen = shuffled(Array.from({ length: room - tipItems.length + 1 }, (_, k) => k), next).slice(0, tipItems.length).sort((a, b) => a - b);
  const places = new Set(chosen.map((c, k) => 1 + c + k));
  const queue = [...asked];
  const tipQueue = tipItems.map((t): TripItem => ({ kind: "tip", ...t }));
  const order = Array.from({ length: total }, (_, at) => (places.has(at) ? tipQueue.shift()! : queue.shift()!));

  // Different journalists throughout. Each introduction is used once, and a voice's own go only with that voice.
  const askers = shuffled(Array.from({ length: TRIP_ASKERS }, (_, k) => k), next);
  const free = new Set(Array.from({ length: TRIP_OPENERS + Math.max(0, moodOpeners) }, (_, k) => k));
  const voiceOf = (k: number) => (k < TRIP_OPENERS ? TRIP_OPENER_VOICE[k] : null);
  return order.map((it, i) => {
    const voice = it.kind === "topic" ? it.voice : null;
    const fits = shuffled([...free].filter((k) => voiceOf(k) === null || voiceOf(k) === voice), next);
    // Half the time a voice gets the introduction made for it.
    const own = voice !== null && next() < 0.5 ? fits.find((k) => voiceOf(k) === voice) : undefined;
    const opener = own ?? fits[0];
    free.delete(opener);
    return { ...it, asker: askers[i], opener };
  });
}
