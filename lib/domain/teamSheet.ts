/** Building a manager's team sheet and points from picks + live data. Pure: no I/O, no framework. */
import type { Bootstrap, EntryPicks, EventLive, PositionId } from "./types";

export const POSITION_LABEL: Record<PositionId, { short: string; plural: string }> = {
  1: { short: "GK", plural: "Goalkeepers" },
  2: { short: "DEF", plural: "Defenders" },
  3: { short: "MID", plural: "Midfielders" },
  4: { short: "FWD", plural: "Forwards" },
};

export const CHIP_LABEL: Record<string, string> = {
  bboost: "Bench Boost",
  "3xc": "Triple Captain",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Assistant Manager",
};

export interface SheetPlayer {
  id: number;
  name: string;
  club: string;
  /** The club's full name ("Man City"), for its page's address. */
  clubName: string;
  clubCode: number | null;
  /** FPL team id, to look the player's fixtures up. */
  teamId: number | null;
  positionId: PositionId;
  slot: number;
  basePoints: number | null;
  multiplier: number;
  points: number | null;
  minutes: number | null;
  isCaptain: boolean;
  isVice: boolean;
  /** Availability: "a" available (also when absent), "d" doubtful, "i" injured, "s" suspended, "u"/"n" unavailable. */
  status: string;
  news: string;
  chanceOfPlaying: number | null;
  /** Percent of managers who own the player; null if unknown. */
  ownership: number | null;
  /** Live stats this gameweek; null when FPL returned none. */
  goals: number | null;
  assists: number | null;
  bps: number | null;
  /** Defensive contribution count (CBIT / CBIRT); null when unknown. */
  defcon: number | null;
}

export interface TeamSheet {
  starters: { positionId: PositionId; players: SheetPlayer[] }[];
  bench: SheetPlayer[];
  /** Sum of points x multiplier for players that count (multiplier > 0), before hits. */
  grossPoints: number;
}

export function buildTeamSheet(picks: EntryPicks, bootstrap: Pick<Bootstrap, "elements" | "teams">, live: EventLive | null): TeamSheet {
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const liveById = new Map((live?.elements ?? []).map((e) => [e.id, e.stats]));

  const players: SheetPlayer[] = [];
  for (const p of picks.picks) {
    const el = elements.get(p.element);
    if (!el) continue; // player removed from the game; skip instead of crashing
    const team = teams.get(el.team);
    const stats = liveById.get(p.element);
    const base = stats ? stats.total_points : null;
    players.push({
      id: el.id,
      name: el.web_name,
      club: team?.short_name ?? "—",
      clubName: team?.name ?? team?.short_name ?? "—",
      clubCode: team?.code ?? null,
      teamId: team?.id ?? null,
      positionId: el.element_type,
      slot: p.position,
      basePoints: base,
      multiplier: p.multiplier,
      points: base == null ? null : base * p.multiplier,
      minutes: stats ? stats.minutes : null,
      isCaptain: p.is_captain,
      isVice: p.is_vice_captain,
      status: el.status ?? "a", // the cached bootstrap omits the default, so absent means available
      news: el.news ?? "",
      chanceOfPlaying: el.chance_of_playing_next_round ?? null,
      ownership: el.selected_by_percent == null ? null : Number(el.selected_by_percent),
      goals: stats ? (stats.goals_scored ?? 0) : null,
      assists: stats ? (stats.assists ?? 0) : null,
      bps: stats ? stats.bps : null,
      defcon: stats ? (stats.defensive_contribution ?? 0) : null,
    });
  }
  players.sort((a, b) => a.slot - b.slot);

  const xi = players.filter((p) => p.slot <= 11);
  const starters = ([1, 2, 3, 4] as PositionId[])
    .map((positionId) => ({ positionId, players: xi.filter((p) => p.positionId === positionId) }))
    .filter((g) => g.players.length > 0);

  const grossPoints = players.reduce((sum, p) => sum + (p.multiplier > 0 ? (p.points ?? 0) : 0), 0);
  return { starters, bench: players.filter((p) => p.slot > 11), grossPoints };
}

/**
 * Net points for the gameweek: live points minus any transfer hit when live data exists. Otherwise FPL's own
 * figure, which is gross of the hit (checked against real histories: points 42, cost 4, total rose by 38).
 */
export function gameweekPoints(sheet: TeamSheet, history: EntryPicks["entry_history"], hasLive: boolean): number {
  return hasLive ? sheet.grossPoints - history.event_transfers_cost : history.points - history.event_transfers_cost;
}

/** Every player in the squad: starters in slot order, then the bench. */
export function allPlayers(sheet: TeamSheet): SheetPlayer[] {
  return [...sheet.starters.flatMap((g) => g.players), ...sheet.bench];
}

/** Points a group of players contributes to the gameweek (multipliers applied; unscored players count 0). */
export const subtotal = (players: SheetPlayer[]) => players.reduce((sum, p) => sum + (p.points ?? 0), 0);
