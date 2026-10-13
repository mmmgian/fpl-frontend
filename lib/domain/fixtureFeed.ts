/**
 * The season's fixtures as a feed: gameweek by gameweek, match day by match day. Pure: no I/O, no framework.
 *
 * The server groups match days by UK date (Europe/London), the league's own calendar, since it can't know the
 * reader's time zone. In the browser, `regroupDays` moves each match under the reader's own date, so a late kick-off
 * seen from Sydney or Los Angeles sits under the day its clock time belongs to.
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
  /** Calendar date, YYYY-MM-DD, in the time zone the days were grouped in ("tbc" for matches with no kick-off yet). */
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

/** The league's own time zone, the server's grouping. */
export const LEAGUE_TIME_ZONE = "Europe/London";

const formats = new Map<string, { date: Intl.DateTimeFormat; label: Intl.DateTimeFormat }>();
/** Date and label formatters for a time zone, made once; an unknown zone falls back to the league's. */
function formatsFor(timeZone: string) {
  let f = formats.get(timeZone);
  if (!f) {
    try {
      f = {
        date: new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
        label: new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }),
      };
    } catch {
      return formatsFor(LEAGUE_TIME_ZONE);
    }
    formats.set(timeZone, f);
  }
  return f;
}

/** Today's date (YYYY-MM-DD) in a time zone, to match against `FeedDay.date`. */
export function dateIn(at: Date, timeZone: string): string {
  return formatsFor(timeZone).date.format(at);
}

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

function toDays(matches: FeedMatch[], timeZone = LEAGUE_TIME_ZONE): FeedDay[] {
  const { date: dateFmt, label: labelFmt } = formatsFor(timeZone);
  const days = new Map<string, FeedDay>();
  for (const m of [...matches].sort(byKickoff)) {
    const t = m.kickoff ? new Date(m.kickoff) : null;
    const valid = t && !Number.isNaN(t.getTime());
    const date = valid ? dateFmt.format(t) : "tbc";
    if (!days.has(date)) days.set(date, { date, label: valid ? labelFmt.format(t) : "Kick-off time to be confirmed", matches: [] });
    days.get(date)!.matches.push(m);
  }
  return [...days.values()];
}

/**
 * The same matches grouped under dates in another time zone (the reader's), in kick-off order. Matches without a
 * kick-off stay together at the end.
 */
export function regroupDays(days: FeedDay[], timeZone: string): FeedDay[] {
  return toDays(
    days.flatMap((d) => d.matches),
    timeZone,
  );
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
