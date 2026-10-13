/**
 * The season's fixtures as a feed: gameweek by gameweek, match day by match day. Pure: no I/O, no framework.
 *
 * Match days follow UK dates (Europe/London), because that is where the league is played; a viewer's own timezone
 * only changes the clock time printed on each match, not which day heading it sits under.
 */
import { fdrBand, type FdrBand } from "./fdr";
import type { FplEvent, FplTeam, ScheduledFixture } from "./types";

export type MatchState = "upcoming" | "live" | "provisional" | "finished" | "tbc";

export interface FeedMatch {
  id: number;
  kickoff: string | null;
  state: MatchState;
  /** FPL team ids. */
  home: number;
  away: number;
  /** Null until the match has started. */
  homeScore: number | null;
  awayScore: number | null;
  /** Difficulty for each side, 1 (easy) to 5 (hard). */
  homeBand: FdrBand;
  awayBand: FdrBand;
}

export interface FeedDay {
  /** UK calendar date, YYYY-MM-DD ("tbc" for matches with no kick-off yet). */
  date: string;
  /** "Saturday 17 October". */
  label: string;
  matches: FeedMatch[];
}

export interface FeedGameweek {
  /** Null for matches with no gameweek (postponed, to be rescheduled). */
  gw: number | null;
  name: string;
  deadline: string | null;
  status: "finished" | "live" | "upcoming";
  days: FeedDay[];
  matchCount: number;
  /** Teams playing twice this gameweek. */
  doubles: number[];
  /** Teams not playing at all this gameweek (only reported once the gameweek has fixtures). */
  blanks: number[];
}

const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
const ukLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });

export function matchState(f: Pick<ScheduledFixture, "kickoff_time" | "started" | "finished" | "finished_provisional">): MatchState {
  if (f.finished) return "finished";
  if (f.finished_provisional) return "provisional";
  if (f.started) return "live";
  return f.kickoff_time ? "upcoming" : "tbc";
}

function toMatch(f: ScheduledFixture): FeedMatch {
  const state = matchState(f);
  const played = state === "live" || state === "provisional" || state === "finished";
  return {
    id: f.id,
    kickoff: f.kickoff_time,
    state,
    home: f.team_h,
    away: f.team_a,
    homeScore: played ? (f.team_h_score ?? null) : null,
    awayScore: played ? (f.team_a_score ?? null) : null,
    homeBand: fdrBand(f.team_h_difficulty),
    awayBand: fdrBand(f.team_a_difficulty),
  };
}

const byKickoff = (a: FeedMatch, b: FeedMatch) => {
  // No kick-off time (or one that can't be read) sorts after everything that has one, so the order is always total.
  const at = (m: FeedMatch) => {
    const t = m.kickoff ? Date.parse(m.kickoff) : Number.NaN;
    return Number.isNaN(t) ? Infinity : t;
  };
  const ta = at(a);
  const tb = at(b);
  return ta === tb ? a.id - b.id : ta < tb ? -1 : 1;
};

function toDays(matches: FeedMatch[]): FeedDay[] {
  const days = new Map<string, FeedDay>();
  for (const m of [...matches].sort(byKickoff)) {
    const t = m.kickoff ? new Date(m.kickoff) : null;
    const valid = t && !Number.isNaN(t.getTime());
    const date = valid ? ukDate.format(t) : "tbc";
    if (!days.has(date)) days.set(date, { date, label: valid ? ukLabel.format(t) : "Kick-off time to be confirmed", matches: [] });
    days.get(date)!.matches.push(m);
  }
  return [...days.values()];
}

/** Every gameweek that has fixtures, in order, with postponed (unscheduled) matches last. */
export function buildFixtureFeed(events: FplEvent[], teams: FplTeam[], schedule: ScheduledFixture[]): FeedGameweek[] {
  const grouped = new Map<number | null, ScheduledFixture[]>();
  for (const f of schedule) {
    const key = f.event ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  const out: FeedGameweek[] = [];
  const gws = [...grouped.keys()].filter((k): k is number => k !== null).sort((a, b) => a - b);
  for (const gw of gws) {
    const matches = grouped.get(gw)!.map(toMatch);
    const event = events.find((e) => e.id === gw);
    const plays = new Map<number, number>();
    for (const m of matches) for (const t of [m.home, m.away]) plays.set(t, (plays.get(t) ?? 0) + 1);
    out.push({
      gw,
      name: event?.name ?? `Gameweek ${gw}`,
      deadline: event?.deadline_time ?? null,
      status: event?.finished ? "finished" : event?.is_current ? "live" : "upcoming",
      days: toDays(matches),
      matchCount: matches.length,
      doubles: [...plays].filter(([, n]) => n >= 2).map(([t]) => t).sort((a, b) => a - b),
      blanks: teams.filter((t) => !plays.has(t.id)).map((t) => t.id),
    });
  }

  const loose = grouped.get(null);
  if (loose?.length) {
    const matches = loose.map(toMatch);
    out.push({ gw: null, name: "Postponed, to be rescheduled", deadline: null, status: "upcoming", days: toDays(matches), matchCount: matches.length, doubles: [], blanks: [] });
  }
  return out;
}

/** Index of the gameweek to open on: `wanted` if it exists, otherwise the first that isn't finished, otherwise the last. */
export function feedStartIndex(feed: FeedGameweek[], wanted: number | null): number {
  if (feed.length === 0) return 0;
  if (wanted !== null) {
    const i = feed.findIndex((g) => g.gw === wanted);
    if (i !== -1) return i;
  }
  const open = feed.findIndex((g) => g.gw !== null && g.status !== "finished");
  return open !== -1 ? open : Math.max(0, feed.length - 1);
}

/** A short line for a score: "2–1", or "v" before kick-off. */
export function scoreLine(m: Pick<FeedMatch, "homeScore" | "awayScore">): string | null {
  return m.homeScore === null || m.awayScore === null ? null : `${m.homeScore}–${m.awayScore}`;
}
