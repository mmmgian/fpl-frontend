/**
 * Is anything actually being played? FPL calls a gameweek "live" from its deadline until the last match is signed off,
 * which can be several quiet days (Friday's deadline, Saturday's kick-offs, then Monday night). Pure: no I/O.
 *
 * Kick-off times are fixed, so a match counts as "in play" from kick-off for MATCH_MS (90 minutes, half-time, stoppages
 * and a margin); the schedule itself is cached for an hour, so its `finished` flags can lag but only ever in one
 * direction (a match marked finished really is).
 */
import type { GwStatus } from "./gameweek";

export interface PulseFixture {
  event: number | null;
  kickoff_time: string | null;
  finished?: boolean;
}

export type MatchPulse = {
  /** playing: a match is on. between: none now, more to come. over: all kicked off and finished, awaiting FPL's sign-off. none: no dated matches. */
  state: "playing" | "between" | "over" | "none";
  /** The next kick-off still to come in this gameweek (ISO), if any. */
  nextKickoff: string | null;
  /** How many matches are in play right now. */
  playing: number;
};

export const MATCH_MS = 135 * 60_000;

export function matchPulse(fixtures: readonly PulseFixture[], gw: number, now: Date): MatchPulse {
  const at = now.getTime();
  let playing = 0;
  let next: number | null = null;
  let dated = 0;
  for (const f of fixtures) {
    if (f.event !== gw || !f.kickoff_time) continue;
    const k = Date.parse(f.kickoff_time);
    if (!Number.isFinite(k)) continue;
    dated++;
    if (k > at) next = next === null || k < next ? k : next;
    else if (!f.finished && at < k + MATCH_MS) playing++;
  }
  const nextKickoff = next === null ? null : new Date(next).toISOString();
  if (dated === 0) return { state: "none", nextKickoff: null, playing: 0 };
  if (playing > 0) return { state: "playing", nextKickoff, playing };
  return { state: nextKickoff ? "between" : "over", nextKickoff, playing: 0 };
}

const MINUTE = 60_000;

/**
 * How long to wait before the next refresh of a page about the latest gameweek, or null for never.
 * - Matches on: every minute.
 * - Quiet gap between matches: wake two minutes before the next kick-off, but never faster than a minute or slower than
 *   fifteen (each refresh recomputes this, so the wait shrinks as kick-off nears).
 * - Everything played, FPL still signing off (also the provisional state): every five minutes.
 * - Unknown (no schedule): behave as before, every minute while live.
 * - Upcoming or final: never; nothing on the page can change by itself.
 */
export function refreshPlan(status: GwStatus, pulse: MatchPulse | null, now: Date): number | null {
  if (status === "provisional") return 5 * MINUTE;
  if (status !== "live") return null;
  if (!pulse || pulse.state === "none" || pulse.state === "playing") return MINUTE;
  if (pulse.state === "over") return 5 * MINUTE;
  const until = pulse.nextKickoff ? Date.parse(pulse.nextKickoff) - now.getTime() - 2 * MINUTE : 15 * MINUTE;
  return Math.min(15 * MINUTE, Math.max(MINUTE, until));
}
