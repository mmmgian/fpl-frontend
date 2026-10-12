/**
 * Sneaky upside: who a manager chasing the world leaderboard should look at that most of the world isn't looking at.
 * From FPL's own numbers only (expected points, ownership, form, price, transfers in). Pure: no I/O.
 */
import { expectedPoints, likelyToPlay } from "./tools";
import type { Bootstrap, FplElement, PositionId } from "./types";

export interface UpsidePick {
  id: number;
  name: string;
  teamId: number;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
  /** Percent of managers who own him. */
  ownership: number;
  /** FPL's expected points for the next gameweek. */
  xp: number;
  form: number;
  /** Tenths of £m. */
  price: number;
  /** Transfers in this gameweek, all of FPL. */
  transfersIn: number;
}

export interface Upside {
  /** Little-owned players with the most expected points. */
  differentials: UpsidePick[];
  /** Armband gambles: strong expected points, owned by few. */
  captainGambles: UpsidePick[];
  /** Players the crowd is buying whose price has not moved yet. */
  risers: UpsidePick[];
}

export const DIFFERENTIAL_BELOW = 10;
export const CAPTAIN_GAMBLE_BELOW = 25;
export const CAPTAIN_GAMBLE_XP = 5;
/** Season minutes before a player counts as proven (about three full matches). */
export const PROVEN_MINUTES = 270;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Up to `limit` picks in each list, never the same player in two lists of different kinds more than once per list. */
export function upsidePicks(bootstrap: Pick<Bootstrap, "elements" | "teams">, limit = 6): Upside {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const pick = (e: FplElement): UpsidePick => ({
    id: e.id,
    name: e.web_name,
    teamId: e.team,
    club: clubs.get(e.team)?.short_name ?? "—",
    clubCode: clubs.get(e.team)?.code ?? null,
    positionId: e.element_type,
    ownership: num(e.selected_by_percent),
    xp: expectedPoints(e),
    form: num(e.form),
    price: e.now_cost ?? 0,
    transfersIn: e.transfers_in_event ?? 0,
  });
  const proven = bootstrap.elements.filter((e) => likelyToPlay(e) && (e.minutes ?? 0) >= PROVEN_MINUTES && expectedPoints(e) > 0).map(pick);
  const byXp = (a: UpsidePick, b: UpsidePick) => b.xp - a.xp || b.form - a.form || a.ownership - b.ownership || a.id - b.id;

  return {
    differentials: proven.filter((p) => p.ownership < DIFFERENTIAL_BELOW).sort(byXp).slice(0, limit),
    captainGambles: proven.filter((p) => p.ownership < CAPTAIN_GAMBLE_BELOW && p.xp >= CAPTAIN_GAMBLE_XP).sort(byXp).slice(0, Math.min(limit, 3)),
    risers: bootstrap.elements
      .filter((e) => likelyToPlay(e) && (e.cost_change_event ?? 0) <= 0 && num(e.selected_by_percent) < 35 && (e.transfers_in_event ?? 0) >= 5000)
      .map(pick)
      .sort((a, b) => b.transfersIn - a.transfersIn || a.id - b.id)
      .slice(0, Math.min(limit, 4)),
  };
}
