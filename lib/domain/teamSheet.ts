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
  /** Expected goals and assists this gameweek (0 when FPL sent none), and the other things that happened to the player. */
  xg: number;
  xa: number;
  bonus: number;
  yellow: number;
  red: number;
  ownGoals: number;
  penMissed: number;
  saves: number;
  cleanSheet: boolean;
  conceded: number;
  /** Price in tenths of £m; null if unknown. */
  price: number | null;
  /** FPL's form figure (average points over recent matches); null if unknown. */
  form: number | null;
}

export interface TeamSheet {
  starters: { positionId: PositionId; players: SheetPlayer[] }[];
  bench: SheetPlayer[];
  /** Sum of points x multiplier for players that count (multiplier > 0), before hits. */
  grossPoints: number;
}

/** A finite number from whatever FPL sent ("12.3", 4, "", null, "abc"), or null. */
const finite = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const count = (v: unknown): number => finite(v) ?? 0;

/**
 * Slots after automatic substitutions. When FPL lists a sub but still has the player who came on in a bench slot and
 * the one who went off in the XI, swap them, so the sheet shows who actually played. If FPL already swapped them, nothing moves.
 */
function slotsAfterSubs(picks: EntryPicks): Map<number, number> {
  const slot = new Map(picks.picks.map((p) => [p.element, p.position]));
  for (const s of picks.automatic_subs ?? []) {
    const a = slot.get(s.element_in);
    const b = slot.get(s.element_out);
    if (a != null && b != null && a > 11 && b <= 11) {
      slot.set(s.element_in, b);
      slot.set(s.element_out, a);
    }
  }
  return slot;
}

export function buildTeamSheet(picks: EntryPicks, bootstrap: Pick<Bootstrap, "elements" | "teams">, live: EventLive | null): TeamSheet {
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const liveById = new Map((live?.elements ?? []).filter((e) => e && e.stats).map((e) => [e.id, e.stats]));
  const slots = slotsAfterSubs(picks);
  const seen = new Set<number>();

  const players: SheetPlayer[] = [];
  for (const p of picks.picks) {
    const el = elements.get(p.element);
    if (!el || seen.has(el.id)) continue; // player removed from the game (or listed twice); skip instead of crashing
    seen.add(el.id);
    const team = teams.get(el.team);
    const stats = liveById.get(p.element);
    const base = stats ? finite(stats.total_points) : null;
    const multiplier = count(p.multiplier);
    players.push({
      id: el.id,
      name: el.web_name,
      club: team?.short_name ?? "—",
      clubName: team?.name ?? team?.short_name ?? "—",
      clubCode: team?.code ?? null,
      teamId: team?.id ?? null,
      positionId: el.element_type,
      slot: slots.get(p.element) ?? p.position,
      basePoints: base,
      multiplier,
      points: base == null ? null : base * multiplier,
      minutes: stats ? finite(stats.minutes) : null,
      isCaptain: Boolean(p.is_captain),
      isVice: Boolean(p.is_vice_captain),
      status: el.status ?? "a", // the cached bootstrap omits the default, so absent means available
      news: el.news ?? "",
      chanceOfPlaying: finite(el.chance_of_playing_next_round),
      ownership: finite(el.selected_by_percent),
      goals: stats ? count(stats.goals_scored) : null,
      assists: stats ? count(stats.assists) : null,
      bps: stats ? finite(stats.bps) : null,
      defcon: stats ? count(stats.defensive_contribution) : null,
      xg: count(stats?.expected_goals),
      xa: count(stats?.expected_assists),
      bonus: count(stats?.bonus),
      yellow: count(stats?.yellow_cards),
      red: count(stats?.red_cards),
      ownGoals: count(stats?.own_goals),
      penMissed: count(stats?.penalties_missed),
      saves: count(stats?.saves),
      cleanSheet: count(stats?.clean_sheets) > 0,
      conceded: count(stats?.goals_conceded),
      price: finite(el.now_cost),
      form: finite(el.form),
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
  const hit = count(history?.event_transfers_cost);
  return hasLive ? sheet.grossPoints - hit : count(history?.points) - hit;
}

/** Every player in the squad: starters in slot order, then the bench. */
export function allPlayers(sheet: TeamSheet): SheetPlayer[] {
  return [...sheet.starters.flatMap((g) => g.players), ...sheet.bench];
}

/** Points a group of players contributes to the gameweek (multipliers applied; unscored players count 0). */
export const subtotal = (players: SheetPlayer[]) => players.reduce((sum, p) => sum + (p.points ?? 0), 0);
