/**
 * The words for the league table's extras, in the page's language. They live in the catalogs
 * (lib/domain/i18n); this turns an award or a run into its sentence. Playful, but every sentence states only what the
 * numbers say.
 */
import { getFormat, getT, isTrip } from "@/components/ui";
import type { Award, AwardKey, Dare, ManagerStats } from "@/lib/domain";

export const awardTitle = (key: AwardKey): string => (isTrip() ? getT().blotter.titles[key] : getT().awards.titles[key]);

/** How the award reads for its winner. `name` is the winner's team name; `gw` names the week the award is for. */
export function awardLine(a: Award, name: string, gw?: number): string {
  const t = getT();
  const f = getFormat();
  const c = t.common;
  const when = gw ? t.awards.inGw(gw) : t.awards.thisWeek;
  // The altered view says the same figures through other words; the lines share one shape, so only the catalog swaps.
  const L: Pick<typeof t.awards, AwardKey> = isTrip() ? t.blotter.lines : t.awards;
  switch (a.key) {
    case "weekWinner":
      return L.weekWinner(name, c.points(a.value), when);
    case "woodenSpoon":
      return L.woodenSpoon(name, c.points(a.value), when);
    case "hotStreak":
      return L.hotStreak(name, c.weeks(a.value));
    case "climber":
      return L.climber(name, c.places(a.value));
    case "rollercoaster":
      return L.rollercoaster(name, f.decimal(a.value));
    case "benchDisaster":
      return L.benchDisaster(name, c.points(a.value));
    case "hitMachine":
      return L.hitMachine(name, c.points(a.value));
    case "deepPockets":
      return L.deepPockets(name, f.money(a.value));
  }
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

/** A one-line verdict on a manager's current run, or null if there isn't one. */
export function streakLabel(s: ManagerStats): string | null {
  if (!s.streak) return null;
  const t = getT().stats;
  if (isTrip()) {
    const b = getT().blotter;
    return s.streak.kind === "hot" ? b.glowing(s.streak.length) : b.drifting(s.streak.length);
  }
  return s.streak.kind === "hot" ? t.hotLine(s.streak.length) : t.coldLine(s.streak.length);
}

/** One daring move as a sentence (altered view only). Every figure in it comes from the manager's own numbers. */
export function dareLine(d: Dare): string {
  const t = getT();
  const f = getFormat();
  const c = t.common;
  const D = t.blotter.dares;
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;
  switch (d.key) {
    case "chase":
      return D.chase(c.points(d.points));
    case "leading":
      return D.leading;
    case "sealed":
      return D.sealed(d.chips.map(chipName).join(", "), d.half);
    case "glowing":
      return D.glowing(c.weeks(d.weeks));
    case "drifting":
      return D.drifting(c.weeks(d.weeks));
    case "couch":
      return D.couch(c.points(d.points));
    case "stash":
      return D.stash(f.money(d.bank));
    case "noHits":
      return D.noHits;
    case "manyHits":
      return D.manyHits(c.points(d.points));
  }
}
