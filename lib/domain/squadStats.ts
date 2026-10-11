/**
 * What a manager's XI did in one finished gameweek, beyond the points: the chances it was expected to score from
 * (xG) and to set up (xA), and the DefCon bonus it banked. Pure: no I/O.
 *
 * "The XI" is the players who counted, i.e. a non-zero multiplier. For a settled gameweek FPL's picks already show
 * the automatic substitutions (the sub came in with multiplier 1, the player replaced has 0), and under Bench Boost
 * the whole squad counts, so this is the team that actually scored.
 */
import { DEFCON_THRESHOLD } from "./insights";
import type { Bootstrap, EntryPicks, EventLive } from "./types";

export interface SquadWeek {
  gw: number;
  /** Expected goals and assists of the XI, summed (not weighted by captaincy: they describe the chances, not the points). */
  xg: number;
  xa: number;
  /**
   * Players who earned the +2 DefCon bonus, and the points that banked once captaincy is applied. null when
   * the schedule isn't known, because a double gameweek can't be told from a single one without it.
   */
  defcon: number | null;
  defconPoints: number | null;
  /** Players who reached the DefCon threshold in a double gameweek, where FPL's total adds both matches: unknowable. */
  defconUnsure: number;
}

type Elements = Pick<Bootstrap, "elements">["elements"];

/**
 * @param matches how many matches each club plays that gameweek (see `matchCounts`), or null if unknown. A club with
 *   two matches has a defensive-contribution total for both added together, so reaching the threshold can't be claimed.
 */
export function squadWeek(gw: number, picks: EntryPicks, live: EventLive, elements: Elements, matches: Map<number, number> | null): SquadWeek {
  const player = new Map(elements.map((e) => [e.id, e]));
  const stats = new Map(live.elements.map((e) => [e.id, e.stats]));
  let xg = 0;
  let xa = 0;
  let defcon = 0;
  let defconPoints = 0;
  let defconUnsure = 0;
  for (const pick of picks.picks) {
    if (pick.multiplier <= 0) continue;
    const el = player.get(pick.element);
    const s = stats.get(pick.element);
    if (!el || !s) continue;
    xg += Number(s.expected_goals) || 0;
    xa += Number(s.expected_assists) || 0;
    const threshold = DEFCON_THRESHOLD[el.element_type];
    if (!threshold || (s.defensive_contribution ?? 0) < threshold) continue;
    if ((matches?.get(el.team) ?? 1) > 1) defconUnsure++;
    else {
      defcon++;
      defconPoints += 2 * pick.multiplier;
    }
  }
  return { gw, xg, xa, defcon: matches ? defcon : null, defconPoints: matches ? defconPoints : null, defconUnsure: matches ? defconUnsure : 0 };
}
