/**
 * The words for the league table's extras, in the page's language. They live in the catalogs
 * (lib/domain/i18n); this turns an award or a run into its sentence. Playful, but every sentence states only what the
 * numbers say.
 */
import { getFormat, getT } from "@/components/ui";
import type { Award, AwardKey, ManagerStats } from "@/lib/domain";

export const awardTitle = (key: AwardKey): string => getT().awards.titles[key];

/** How the award reads for its winner. `name` is the winner's team name; `gw` names the week the award is for. */
export function awardLine(a: Award, name: string, gw?: number): string {
  const t = getT();
  const f = getFormat();
  const c = t.common;
  const when = gw ? t.awards.inGw(gw) : t.awards.thisWeek;
  switch (a.key) {
    case "weekWinner":
      return t.awards.weekWinner(name, c.points(a.value), when);
    case "woodenSpoon":
      return t.awards.woodenSpoon(name, c.points(a.value), when);
    case "hotStreak":
      return t.awards.hotStreak(name, c.weeks(a.value));
    case "climber":
      return t.awards.climber(name, c.places(a.value));
    case "rollercoaster":
      return t.awards.rollercoaster(name, f.decimal(a.value));
    case "benchDisaster":
      return t.awards.benchDisaster(name, c.points(a.value));
    case "hitMachine":
      return t.awards.hitMachine(name, c.points(a.value));
    case "deepPockets":
      return t.awards.deepPockets(name, f.money(a.value));
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
  return s.streak.kind === "hot" ? t.hotLine(s.streak.length) : t.coldLine(s.streak.length);
}
