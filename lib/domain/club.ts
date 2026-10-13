/**
 * A Premier League club as the club page sees it: its fixtures and results, the team news FPL publishes, and a
 * predicted line-up. Pure: no I/O, no framework.
 *
 * The predicted XI is a prediction and says so. It is built only from facts FPL publishes (who is available, and
 * how often each player has started this season); there is no official source for line-ups before kick-off.
 */
import { matchState, type MatchState } from "./fixtureFeed";
import { fdrBand, type FdrBand } from "./fdr";
import type { FplElement, FplTeam, PositionId, ScheduledFixture } from "./types";

// ---------- Fixtures and results ----------

export type Result = "W" | "D" | "L";

export interface ClubMatch {
  id: number;
  gw: number | null;
  kickoff: string | null;
  state: MatchState;
  opponentId: number;
  home: boolean;
  /** The club's own difficulty for this match, 1-5. */
  band: FdrBand;
  /** Goals for the club and against it; null before kick-off. */
  scored: number | null;
  conceded: number | null;
  result: Result | null;
}

function toClubMatch(f: ScheduledFixture, clubId: number): ClubMatch {
  const home = f.team_h === clubId;
  const state = matchState(f);
  const played = state === "finished" || state === "provisional" || state === "live";
  const [hs, as] = [f.team_h_score ?? null, f.team_a_score ?? null];
  const scored = played ? (home ? hs : as) : null;
  const conceded = played ? (home ? as : hs) : null;
  const settled = state === "finished" || state === "provisional";
  return {
    id: f.id,
    gw: f.event ?? null,
    kickoff: f.kickoff_time,
    state,
    opponentId: home ? f.team_a : f.team_h,
    home,
    band: fdrBand(home ? f.team_h_difficulty : f.team_a_difficulty),
    scored,
    conceded,
    result: settled && scored !== null && conceded !== null ? (scored > conceded ? "W" : scored < conceded ? "L" : "D") : null,
  };
}

const kickoffTime = (m: ClubMatch) => (m.kickoff ? Date.parse(m.kickoff) : Infinity);

/** The club's next matches (including one in progress) soonest first, and its latest results most recent first. */
export function clubMatches(schedule: ScheduledFixture[], clubId: number, take = 5): { next: ClubMatch[]; recent: ClubMatch[] } {
  const all = schedule.filter((f) => f.team_h === clubId || f.team_a === clubId).map((f) => toClubMatch(f, clubId));
  const upcoming = all.filter((m) => m.result === null).sort((a, b) => kickoffTime(a) - kickoffTime(b) || a.id - b.id);
  const done = all.filter((m) => m.result !== null).sort((a, b) => kickoffTime(b) - kickoffTime(a) || b.id - a.id);
  return { next: upcoming.slice(0, take), recent: done.slice(0, take) };
}

/** The last results as a form guide, oldest first (so it reads left to right in time). */
export const formGuide = (recent: ClubMatch[]): Result[] => recent.flatMap((m) => (m.result ? [m.result] : [])).reverse();

// ---------- Players and team news ----------

export interface ClubPlayer {
  id: number;
  name: string;
  position: PositionId;
  status: string;
  news: string;
  newsAdded: string | null;
  /** Chance of playing next round, 0-100, or null when FPL gives none. */
  chance: number | null;
  /** Tenths of £m. */
  cost: number;
  form: number;
  points: number;
  minutes: number;
  starts: number;
  ownership: number | null;
}

export const clubPlayers = (elements: FplElement[], teamId: number): ClubPlayer[] =>
  elements
    .filter((e) => e.team === teamId)
    .map((e) => ({
      id: e.id,
      name: e.web_name,
      position: e.element_type,
      status: e.status ?? "a",
      news: e.news ?? "",
      newsAdded: e.news_added ?? null,
      chance: e.chance_of_playing_next_round ?? null,
      cost: e.now_cost ?? 0,
      form: Number(e.form ?? 0) || 0,
      points: e.total_points ?? 0,
      minutes: e.minutes ?? 0,
      starts: e.starts ?? 0,
      ownership: e.selected_by_percent != null ? Number(e.selected_by_percent) || null : null,
    }));

export type NewsSeverity = "out" | "doubt" | "note";

export interface ClubNewsItem {
  player: ClubPlayer;
  severity: NewsSeverity;
}

/** "out": ruled out (injured, suspended, unavailable); "doubt": a fitness doubt; "note": news with no effect on selection. */
export function newsSeverity(p: Pick<ClubPlayer, "status" | "chance">): NewsSeverity {
  if (["i", "s", "u", "n"].includes(p.status)) return "out";
  if (p.status === "d" || (p.chance !== null && p.chance < 100)) return "doubt";
  return "note";
}

const SEVERITY_ORDER: Record<NewsSeverity, number> = { out: 0, doubt: 1, note: 2 };

/**
 * FPL keeps players who have left the club (sold, loaned out, released) in its data, flagged "u" (unavailable) or "n"
 * (not in the squad), with news like "Has joined Barcelona permanently". That is not team news, so it is left out.
 */
export const hasLeft = (p: Pick<ClubPlayer, "status">) => p.status === "u" || p.status === "n";

/** Everyone still at the club with news or an availability flag, most serious first and, within that, most recent first. */
export function clubNews(players: ClubPlayer[]): ClubNewsItem[] {
  return players
    .filter((p) => !hasLeft(p) && (p.news.trim() !== "" || p.status !== "a"))
    .map((player) => ({ player, severity: newsSeverity(player) }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (Date.parse(b.player.newsAdded ?? "") || 0) - (Date.parse(a.player.newsAdded ?? "") || 0) ||
        b.player.minutes - a.player.minutes,
    );
}

// ---------- Predicted XI ----------

export interface PredictedPlayer {
  player: ClubPlayer;
  /** Share of the club's matches this player has started, 0-1. */
  startRate: number;
  doubt: boolean;
}

export interface PredictedXI {
  /** The shape, e.g. "4-3-3", or null when too few players are fit for it to be stated honestly. */
  formation: string | null;
  goalkeeper: PredictedPlayer;
  defenders: PredictedPlayer[];
  midfielders: PredictedPlayer[];
  forwards: PredictedPlayer[];
  /** Places a line needs (at least 3 defenders, 2 midfielders, 1 forward) but has no fit regular starter for. */
  open: { defenders: number; midfielders: number; forwards: number };
  /** The most starts anyone at the club has made this season: how much football the rates are over. Small early on. */
  matches: number;
  /** How many fit players have started this season (including the keeper), however many make the XI. */
  fit: number;
  /** Places in the XI not filled by a named player (0 for a full side). */
  missing: number;
}

/** Fewer named players than this is not a prediction worth showing. */
const MIN_NAMED = 7;

const MIN = { 2: 3, 3: 2, 4: 1 } as const;
const MAX = { 2: 5, 3: 5, 4: 3 } as const;
type Line = 2 | 3 | 4;

/**
 * The XI the club is most likely to field, by who is available and who has started most. Only players who have
 * started this season are named: padding the side with someone who hasn't would be a guess dressed as a prediction.
 *
 * The shape is always a legal one (3-5 defenders, 2-5 midfielders, 1-3 forwards, ten outfielders). Where a line has
 * too few fit regulars, the places it needs are reported as open and the surplus from other lines makes room for
 * them, rather than printing a shape no manager would pick. With fewer than seven players to name, the result is null.
 */
export function predictedXI(players: ClubPlayer[]): PredictedXI | null {
  const matches = Math.max(0, ...players.map((p) => p.starts));
  if (matches === 0) return null;

  const rank = (a: ClubPlayer, b: ClubPlayer) => b.starts - a.starts || b.minutes - a.minutes || b.form - a.form || b.points - a.points || a.id - b.id;
  const fitRegulars = players
    .filter((p) => (p.status === "a" || p.status === "d") && (p.chance === null || p.chance >= 50) && p.starts > 0)
    .sort(rank);
  const wrap = (p: ClubPlayer): PredictedPlayer => ({ player: p, startRate: Math.min(1, p.starts / matches), doubt: p.status === "d" || (p.chance !== null && p.chance < 100) });

  const gk = fitRegulars.find((p) => p.position === 1);
  if (!gk) return null;

  const outfield = fitRegulars.filter((p) => p.position !== 1);
  const chosen: Record<Line, ClubPlayer[]> = { 2: [], 3: [], 4: [] };
  const total = () => chosen[2].length + chosen[3].length + chosen[4].length;
  // The least each line needs, from its best players; then the best of the rest, never past a line's limit.
  for (const pos of [2, 3, 4] as const) chosen[pos].push(...outfield.filter((p) => p.position === pos).slice(0, MIN[pos]));
  for (const p of outfield) {
    if (total() >= 10) break;
    const pos = p.position as Line;
    if (!chosen[pos].includes(p) && chosen[pos].length < MAX[pos]) chosen[pos].push(p);
  }

  // A line short of its minimum has open places; the players it needs room for come off the lines that have surplus.
  const open = { 2: Math.max(0, MIN[2] - chosen[2].length), 3: Math.max(0, MIN[3] - chosen[3].length), 4: Math.max(0, MIN[4] - chosen[4].length) };
  const openTotal = () => open[2] + open[3] + open[4];
  while (total() + openTotal() > 10) {
    const surplus = ([2, 3, 4] as const).filter((pos) => chosen[pos].length > MIN[pos]);
    if (surplus.length === 0) break;
    // Drop the least regular of the surplus players.
    let victim: { pos: Line; at: number } | null = null;
    for (const pos of surplus) {
      const at = chosen[pos].length - 1; // each line is already ordered best first
      if (!victim || rank(chosen[pos][at], chosen[victim.pos][victim.at]) > 0) victim = { pos, at };
    }
    chosen[victim!.pos].splice(victim!.at, 1);
  }

  const named = 1 + total();
  if (named < MIN_NAMED) return null;
  const byRank = (xs: ClubPlayer[]) => [...xs].sort(rank).map(wrap);
  const shape = [2, 3, 4].map((pos) => chosen[pos as Line].length + open[pos as Line]);
  return {
    formation: shape.reduce((a, b) => a + b, 0) === 10 ? shape.join("-") : null,
    goalkeeper: wrap(gk),
    defenders: byRank(chosen[2]),
    midfielders: byRank(chosen[3]),
    forwards: byRank(chosen[4]),
    open: { defenders: open[2], midfielders: open[3], forwards: open[4] },
    matches,
    fit: fitRegulars.length,
    missing: 11 - named,
  };
}

// ---------- Outside sources ----------

/** A European fixture from an outside source. */
export interface EuropeMatch {
  id: number;
  competition: string;
  /** ISO time; null if not yet set. */
  utcDate: string | null;
  home: string;
  away: string;
  /** Whether the club in question is the home side. */
  clubIsHome: boolean;
  status: string;
}

export interface Headline {
  title: string;
  url: string;
  /** The feed's own one-line summary, unchanged, or null. */
  summary: string | null;
  /** ISO time, or null if the feed gave none. */
  publishedAt: string | null;
}

export const clubIdentity = (t: FplTeam) => ({ id: t.id, name: t.name, short: t.short_name || t.name, code: t.code });

// ---------- Outlook ----------

export type FormMood = "hot" | "cold" | "mixed";
export type RunMood = "kind" | "tough" | "mixed";

export interface ClubOutlook {
  /** Recent results, with points per game deciding the mood (2+ hot, under 1 cold). */
  form: { played: number; wins: number; draws: number; losses: number; points: number; mood: FormMood } | null;
  /** The next few matches' difficulty for the club (2.5 or less kind, 3.5 or more tough). */
  run: { matches: number; average: number; mood: RunMood } | null;
  /** The club's top FPL scorer this season. */
  star: { name: string; points: number; ownership: number | null } | null;
  /** Ruled out, most serious and most recent first, and how many more are doubts. */
  out: string[];
  doubts: number;
}

/** What the club page's opening lines are about, all from facts already on the page. */
export function clubOutlook(form: Result[], next: ClubMatch[], players: ClubPlayer[], news: ClubNewsItem[], take = 3): ClubOutlook {
  const count = (r: Result) => form.filter((x) => x === r).length;
  const [wins, draws, losses] = [count("W"), count("D"), count("L")];
  const points = wins * 3 + draws;
  const ppg = form.length ? points / form.length : 0;
  // Not kicked off yet, dated or not: a match without a time still has its difficulty.
  const run = next.filter((m) => m.state === "upcoming" || m.state === "tbc").slice(0, take);
  const average = run.length ? run.reduce((s, m) => s + m.band, 0) / run.length : 0;
  const star = players.filter((p) => !hasLeft(p) && p.points > 0).sort((a, b) => b.points - a.points || a.id - b.id)[0];
  return {
    form: form.length ? { played: form.length, wins, draws, losses, points, mood: ppg >= 2 ? "hot" : ppg < 1 ? "cold" : "mixed" } : null,
    run: run.length ? { matches: run.length, average, mood: average <= 2.5 ? "kind" : average >= 3.5 ? "tough" : "mixed" } : null,
    star: star ? { name: star.name, points: star.points, ownership: star.ownership } : null,
    out: news.filter((n) => n.severity === "out").map((n) => n.player.name),
    doubts: news.filter((n) => n.severity === "doubt").length,
  };
}
