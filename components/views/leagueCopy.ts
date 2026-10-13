/**
 * The words for the league table's extras, in the page's language. They live in the catalogs
 * (lib/domain/i18n); this turns an award or a run into its sentence. Playful, but every sentence states only what the
 * numbers say.
 *
 * Most messages come in several phrasings. Which one shows is decided by the page's `variety` key (see varietyKey: it
 * changes every day and whenever FPL moves the gameweek on) and a slot (a manager, an award), so the page reads fresh
 * week to week and neighbours don't echo each other. Without a key (frozen tables, tests) the first phrasing is used.
 */
import { getFormat, getT, isTrip } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { Angle, Award, AwardCopy, AwardKey, Dare, GwStatus, LeagueHeadline, ManagerStats, StatsPhase, StoryCopy } from "@/lib/domain";

/** The phrasing for `slot` under `key`; the first one when there is no key. */
export const vary = <T>(items: readonly T[], key: number | undefined, slot = 0): T => (key === undefined ? items[0] : pickVariant(items, key, slot));

const AWARD_SLOT: Record<AwardKey, number> = { weekWinner: 1, woodenSpoon: 2, hotStreak: 3, climber: 4, rollercoaster: 5, benchDisaster: 6, hitMachine: 7, deepPockets: 8 };

export const awardTitle = (key: AwardKey): string => (isTrip() ? getT().blotter.titles[key] : getT().awards.titles[key]);

/** The award's figure as it reads inside a sentence ("62 points", "3 weeks", "£100.4m"). */
function awardFigureText(a: Award): string {
  const c = getT().common;
  const f = getFormat();
  switch (a.key) {
    case "hotStreak":
      return c.weeks(a.value);
    case "climber":
      return c.places(a.value);
    case "rollercoaster":
      return f.decimal(a.value);
    case "deepPockets":
      return f.money(a.value);
    default:
      return c.points(a.value);
  }
}

/**
 * How the award reads for its winner. `name` is the winner's team name; `gw` names the week the award is for; `place`
 * is the winner's table position now; `variety` picks the phrasing.
 */
export function awardLine(a: Award, name: string, gw?: number, { place = 0, variety }: { place?: number; variety?: number } = {}): string {
  const t = getT();
  const when = gw ? t.awards.inGw(gw) : t.awards.thisWeek;
  // The altered view says the same figures through other words; the lines share one shape, so only the catalog swaps.
  const L: Pick<typeof t.awards, AwardKey> = isTrip() ? t.blotter.lines : t.awards;
  const copy: AwardCopy = { name, figure: awardFigureText(a), when, place };
  // Phrasings that name the table position need one.
  const lines = place > 0 ? L[a.key] : L[a.key].slice(0, 1);
  return vary(lines, variety, a.entry * 16 + AWARD_SLOT[a.key])(copy);
}

/** The big number on an award card. */
export function awardFigure(a: Award): string {
  const t = getT();
  const f = getFormat();
  switch (a.key) {
    case "hotStreak":
      return t.awards.weeksFigure(a.value);
    case "climber":
      return `▲${a.value}`;
    case "deepPockets":
      return f.money(a.value);
    case "hitMachine":
      return `−${a.value}`;
    case "rollercoaster":
      return f.decimal(a.value);
    default:
      return String(a.value);
  }
}

export const tiedNote = (a: Award): string | null => (a.tiedWith > 0 ? getT().awards.shared(a.tiedWith) : null);

/** Under the awards heading: which week they are for and how settled it is (live elsewhere, provisional or final). */
export function awardsPhaseLine(phase: StatsPhase, gw: number, liveGw: number | null, variety?: number): string {
  const t = getT();
  const lines = (isTrip() ? t.blotter.phase : t.awards.phase)[phase];
  return vary(lines, variety, 101)(gw, liveGw ?? gw + 1);
}

/** The altered view's line under the visions' heading. */
export const visionsLede = (variety?: number): string => vary(getT().blotter.awardsLedes, variety, 102);

/** A one-line verdict on a manager's current run, or null if there isn't one. The altered view's catalog says it its own way. */
export function streakLabel(s: ManagerStats, variety?: number): string | null {
  if (!s.streak) return null;
  const t = getT().stats;
  return vary(s.streak.kind === "hot" ? t.hotLines : t.coldLines, variety, s.entry)(s.streak.length);
}

/** One talking point as a sentence. Every figure in it comes from the manager's own numbers. */
export function angleLine(a: Angle, slot: number, variety?: number): string {
  const t = getT();
  const c = t.common;
  const f = getFormat();
  const A = t.stats.angles;
  const pick = <K extends keyof typeof A>(k: K) => vary(A[k], variety, slot);
  // "120,431 places": the catalog's unit, with the count in the page's number format.
  const places = (n: number) => c.places(n).replace(String(n), f.number(n));
  switch (a.kind) {
    case "chase":
      return pick("chase")({ figure: c.points(a.points), n: a.points, gw: 0 });
    case "overallUp":
      return pick("overallUp")({ figure: places(a.places), n: a.places, gw: 0 });
    case "overallDown":
      return pick("overallDown")({ figure: places(a.places), n: a.places, gw: 0 });
    case "peak":
      return pick("peak")({ figure: c.points(a.points), n: a.points, gw: a.gw });
    case "low":
      return pick("low")({ figure: c.points(a.points), n: a.points, gw: a.gw });
    case "bench":
      return pick("bench")({ figure: c.points(a.points), n: a.points, gw: 0 });
    case "clean":
      return pick("clean")({ figure: String(a.transfers), n: a.transfers, gw: 0 });
  }
}

/** One daring move as a sentence (altered view only). Every figure in it comes from the manager's own numbers. */
export function dareLine(d: Dare, variety?: number, slot = 0): string {
  const t = getT();
  const f = getFormat();
  const c = t.common;
  const D = t.blotter.dares;
  const v = <T>(items: readonly T[]) => vary(items, variety, slot);
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;
  switch (d.key) {
    case "chase":
      return v(D.chase)(c.points(d.points));
    case "leading":
      return v(D.leading);
    case "sealed":
      return v(D.sealed)(d.chips.map(chipName).join(", "), d.half);
    case "glowing":
      return v(D.glowing)(c.weeks(d.weeks));
    case "drifting":
      return v(D.drifting)(c.weeks(d.weeks));
    case "couch":
      return v(D.couch)(c.points(d.points));
    case "stash":
      return v(D.stash)(f.money(d.bank));
    case "noHits":
      return v(D.noHits);
    case "manyHits":
      return v(D.manyHits)(c.points(d.points));
  }
}

// ------------------------------------------------------------------------------------------------ the storyline

/** At most this many storylines under the summary, so it stays a line or two. */
export const MAX_STORIES = 2;

/**
 * The storylines worth featuring: a new leader always, then others rotated by the variety key (all are true; the key
 * only decides which get the spotlight today). `nameOf` maps an entry to its team name.
 */
export function storyLines(headlines: LeagueHeadline[], nameOf: (entry: number) => string, variety?: number): string[] {
  const t = getT();
  const c = t.common;
  const S = t.league.story;
  const [lead, rest] = headlines[0]?.kind === "newLeader" ? [[headlines[0]], headlines.slice(1)] : [[], headlines];
  // Rotate the rest by the key so a different storyline leads on a different day; order within stays stable.
  const start = variety === undefined || rest.length === 0 ? 0 : pickVariant(rest.map((_, i) => i), variety, 201);
  const chosen = [...lead, ...rest.slice(start), ...rest.slice(0, start)].slice(0, MAX_STORIES);
  return chosen.map((h, i) => {
    const base: StoryCopy = { name: nameOf(h.entry), other: "", n: 0, figure: "", gw: 0, place: 0, chip: "" };
    const say = <K extends keyof typeof S>(k: K, copy: Partial<StoryCopy>) => vary(S[k], variety, 210 + i)({ ...base, ...copy });
    switch (h.kind) {
      case "newLeader":
        return say("newLeader", { place: h.from });
      case "titleRace":
        return say("titleRace", { other: nameOf(h.other), n: h.gap, figure: c.points(h.gap) });
      case "level":
        return say("level", { other: nameOf(h.other) });
      case "riser":
        return say("riser", { n: h.places, figure: c.places(h.places), place: h.rank });
      case "faller":
        return say("faller", { n: h.places, figure: c.places(h.places), place: h.rank });
      case "weekHigh":
        return say("weekHigh", { n: h.points, figure: c.points(h.points), gw: h.gw });
      case "chips":
        return say("chips", { n: h.count, figure: c.points(h.points), gw: h.gw, chip: (t.chips as Record<string, string>)[h.chip] ?? h.chip });
      case "bottom":
        return say("bottom", { n: h.gap, figure: c.points(h.gap) });
    }
  });
}

/** Where the current gameweek stands, at the head of the storyline. */
export const phaseLine = (status: GwStatus, gw: number, variety?: number): string => vary(getT().league.phase[status], variety, 200)(gw);
