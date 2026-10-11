/**
 * The words for the league table's extras. One place, so the voice can be tuned without touching layout.
 * Playful, but every sentence states only what the numbers say.
 */
import { formatMoney, type Award, type AwardKey, type ManagerStats } from "@/lib/domain";

const places = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;
const points = (n: number) => `${n} ${n === 1 ? "point" : "points"}`;
const weeks = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`;

export const AWARD_TITLE: Record<AwardKey, string> = {
  weekWinner: "Week winner",
  woodenSpoon: "Wooden spoon",
  hotStreak: "On a roll",
  climber: "Biggest climber",
  rollercoaster: "Rollercoaster",
  benchDisaster: "Bench disaster",
  hitMachine: "Hit machine",
  deepPockets: "Deep pockets",
};

/** How the award reads for its winner, e.g. "Bart's Team hauled 62 this week". `name` is the winner's team name. */
export function awardLine(a: Award, name: string, gw?: number): string {
  const week = gw ? `in GW${gw}` : "this week";
  switch (a.key) {
    case "weekWinner":
      return `${name} hauled ${points(a.value)} after hits, the best score in the league ${week}.`;
    case "woodenSpoon":
      return `${name} could only scrape together ${points(a.value)} ${week}. Next week, surely.`;
    case "hotStreak":
      return `${name} has beaten the league average ${weeks(a.value)} running.`;
    case "climber":
      return `${name} climbed ${places(a.value)} up the table.`;
    case "rollercoaster":
      return `${name}'s weekly score swings about ${a.value} points either side of their average. Hold on tight.`;
    case "benchDisaster":
      return `${name} has left ${points(a.value)} sitting on the bench this season.`;
    case "hitMachine":
      return `${name} has handed back ${points(a.value)} in transfer hits this season.`;
    case "deepPockets":
      return `${name}'s squad and bank add up to ${formatMoney(a.value)}, the most in the league.`;
  }
}

/** The big number on an award card. */
export function awardFigure(a: Award): string {
  switch (a.key) {
    case "hotStreak":
      return `${a.value} wk`;
    case "climber":
      return `▲${a.value}`;
    case "deepPockets":
      return formatMoney(a.value);
    case "hitMachine":
      return `−${a.value}`;
    default:
      return String(a.value);
  }
}

export const tiedNote = (a: Award) => (a.tiedWith > 0 ? `Shared with ${a.tiedWith} ${a.tiedWith === 1 ? "other" : "others"}` : null);

/** A one-line verdict on a manager's current run, or null if there isn't one. */
export function streakLabel(s: ManagerStats): string | null {
  if (!s.streak) return null;
  return s.streak.kind === "hot" ? `Hot: ${weeks(s.streak.length)} above average` : `Cold: ${weeks(s.streak.length)} below average`;
}
