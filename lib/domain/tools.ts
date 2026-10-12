/**
 * The calculations behind the Tools page. Pure: no I/O. Each one says what it is worked out from, because none of
 * them is a number FPL publishes as such: they are arithmetic on numbers it does publish.
 */
import type { Bootstrap, FplElement, FplEvent, FplTeam, PositionId, ScheduledFixture } from "./types";

// ---------- The next deadline ----------

export interface Deadline {
  gw: number;
  name: string;
  /** ISO time. */
  at: string;
}

/** The first deadline still ahead of `now`, or null once the season is over. */
export function nextDeadline(events: FplEvent[], now: Date): Deadline | null {
  const ahead = events
    .filter((e) => new Date(e.deadline_time).getTime() > now.getTime())
    .sort((a, b) => new Date(a.deadline_time).getTime() - new Date(b.deadline_time).getTime())[0];
  return ahead ? { gw: ahead.id, name: ahead.name, at: ahead.deadline_time } : null;
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds left, never negative. */
  totalMs: number;
}

export function countdown(at: string | number | Date, now: string | number | Date): Countdown {
  const totalMs = Math.max(0, new Date(at).getTime() - new Date(now).getTime());
  const s = Math.floor(totalMs / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, totalMs };
}

// ---------- Team of the Week ----------

export interface NextOpponent {
  /** The opponent's short name, e.g. "CRY". */
  short: string;
  home: boolean;
  /** FPL's difficulty for the player's side, 1 (easy) to 5. */
  difficulty: number;
}

/** Each club's fixtures in a gameweek, from the schedule. A double gameweek gives two. */
export function opponentsIn(fixtures: ScheduledFixture[], teams: Pick<FplTeam, "id" | "short_name">[], gw: number): Map<number, NextOpponent[]> {
  const short = new Map(teams.map((t) => [t.id, t.short_name]));
  const out = new Map<number, NextOpponent[]>();
  const add = (club: number, o: NextOpponent) => out.set(club, [...(out.get(club) ?? []), o]);
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    add(f.team_h, { short: short.get(f.team_a) ?? "?", home: true, difficulty: f.team_h_difficulty });
    add(f.team_a, { short: short.get(f.team_h) ?? "?", home: false, difficulty: f.team_a_difficulty });
  }
  return out;
}

/** Fit to be picked: available, or doubtful with at least a three in four chance. */
export function likelyToPlay(e: Pick<FplElement, "status" | "chance_of_playing_next_round">): boolean {
  const status = e.status ?? "a";
  if (status === "a") return true;
  return status === "d" && (e.chance_of_playing_next_round ?? 0) >= 75;
}

export const expectedPoints = (e: Pick<FplElement, "ep_next">): number => {
  const n = Number(e.ep_next);
  return Number.isFinite(n) ? n : 0;
};

export interface XIPlayer {
  id: number;
  name: string;
  teamId: number;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
  ep: number;
  opponents: NextOpponent[];
  captain: boolean;
  vice: boolean;
}

export interface BestXI {
  /** e.g. "3-4-3": defenders, midfielders, forwards. */
  formation: string;
  /** Goalkeeper, then defenders, midfielders, forwards. */
  lines: { positionId: PositionId; players: XIPlayer[] }[];
  /** Expected points of the eleven, with the captain counted twice. */
  total: number;
}

const FORMATIONS: [number, number, number][] = [];
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) FORMATIONS.push([d, m, f]);

/**
 * The eleven with the most expected points (FPL's own `ep_next`) that is a legal formation: one goalkeeper, 3 to 5
 * defenders, 2 to 5 midfielders, 1 to 3 forwards. Players unlikely to play are left out, and a double-gameweek player
 * is already counted for both matches in `ep_next`. The highest scorer is the captain, the next the vice-captain.
 * It picks the best XI, not a squad: there is no budget.
 */
export function bestXI(bootstrap: Pick<Bootstrap, "elements" | "teams">, opponents: Map<number, NextOpponent[]>): BestXI | null {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const ranked = (pos: PositionId) =>
    bootstrap.elements
      .filter((e) => e.element_type === pos && likelyToPlay(e))
      .sort((a, b) => expectedPoints(b) - expectedPoints(a) || b.id - a.id);
  const pool = { 1: ranked(1), 2: ranked(2), 3: ranked(3), 4: ranked(4) } as Record<PositionId, FplElement[]>;
  const sum = (xs: FplElement[]) => xs.reduce((s, e) => s + expectedPoints(e), 0);

  let best: { shape: [number, number, number]; value: number } | null = null;
  for (const shape of FORMATIONS) {
    if (pool[1].length < 1 || pool[2].length < shape[0] || pool[3].length < shape[1] || pool[4].length < shape[2]) continue;
    const value = sum(pool[1].slice(0, 1)) + sum(pool[2].slice(0, shape[0])) + sum(pool[3].slice(0, shape[1])) + sum(pool[4].slice(0, shape[2]));
    if (!best || value > best.value) best = { shape, value };
  }
  if (!best) return null;

  const [d, m, f] = best.shape;
  const chosen: [PositionId, FplElement[]][] = [[1, pool[1].slice(0, 1)], [2, pool[2].slice(0, d)], [3, pool[3].slice(0, m)], [4, pool[4].slice(0, f)]];
  const everyone = chosen.flatMap(([, xs]) => xs).sort((a, b) => expectedPoints(b) - expectedPoints(a) || b.id - a.id);
  const captain = everyone[0]?.id;
  const vice = everyone[1]?.id;
  return {
    formation: `${d}-${m}-${f}`,
    lines: chosen.map(([positionId, xs]) => ({
      positionId,
      players: xs.map((e) => ({
        id: e.id,
        name: e.web_name,
        teamId: e.team,
        club: clubs.get(e.team)?.short_name ?? "—",
        clubCode: clubs.get(e.team)?.code ?? null,
        positionId,
        ep: expectedPoints(e),
        opponents: opponents.get(e.team) ?? [],
        captain: e.id === captain,
        vice: e.id === vice,
      })),
    })),
    total: Math.round((best.value + expectedPoints(everyone[0] ?? {})) * 10) / 10,
  };
}

// ---------- Price pressure ----------

export type PriceStatus = "rose" | "likelyRise" | "closeRise" | "steady" | "closeFall" | "likelyFall" | "fell";

export interface PriceRow {
  id: number;
  name: string;
  teamId: number;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
  /** Tenths of £m. */
  price: number;
  /** Managers buying minus selling since the last deadline. */
  net: number;
  /** Net transfers as a share of the player's owners, in percent (signed). */
  share: number;
  /** Ownership, in percent. */
  owned: number;
  status: PriceStatus;
}

/**
 * FPL doesn't publish its price-change rule, so these are the cut-offs we use. Both must hold: the net transfers are a
 * real share of the player's owners (a rarely-owned player can top that on a few thousand transfers), and they are a
 * real number of managers, measured against everyone playing (a handful of transfers move nothing).
 */
export const LIKELY_SHARE = 4;
export const CLOSE_SHARE = 2;
export const LIKELY_FRACTION_OF_PLAYERS = 0.005;
export const CLOSE_FRACTION_OF_PLAYERS = 0.0025;

/**
 * Where a player's price is heading, estimated from how many managers have bought or sold him since the last
 * deadline. A price step already taken this gameweek is reported as it happened. This is an estimate, not FPL's
 * rule, and the page says so.
 */
export function priceStatus({ share, net, costChangeEvent, totalPlayers }: { share: number; net: number; costChangeEvent: number; totalPlayers: number }): PriceStatus {
  if (costChangeEvent > 0) return "rose";
  if (costChangeEvent < 0) return "fell";
  const likely = totalPlayers * LIKELY_FRACTION_OF_PLAYERS;
  const close = totalPlayers * CLOSE_FRACTION_OF_PLAYERS;
  if (share >= LIKELY_SHARE && net >= likely) return "likelyRise";
  if (share >= CLOSE_SHARE && net >= close) return "closeRise";
  if (share <= -LIKELY_SHARE && -net >= likely) return "likelyFall";
  if (share <= -CLOSE_SHARE && -net >= close) return "closeFall";
  return "steady";
}

const STATUS_ORDER: PriceStatus[] = ["likelyRise", "closeRise", "rose", "steady", "fell", "closeFall", "likelyFall"];

export function priceRows(bootstrap: Pick<Bootstrap, "elements" | "teams" | "total_players">): PriceRow[] {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const total = bootstrap.total_players ?? 0;
  return bootstrap.elements
    .filter((e) => e.now_cost != null)
    .map((e) => {
      const owned = Number(e.selected_by_percent) || 0;
      const owners = (total * owned) / 100;
      const net = (e.transfers_in_event ?? 0) - (e.transfers_out_event ?? 0);
      const share = owners > 0 ? Math.round(((net / owners) * 100) * 10) / 10 : 0;
      return {
        id: e.id,
        name: e.web_name,
        teamId: e.team,
        club: clubs.get(e.team)?.short_name ?? "—",
        clubCode: clubs.get(e.team)?.code ?? null,
        positionId: e.element_type,
        price: e.now_cost!,
        net,
        share,
        owned,
        status: priceStatus({ share, net, costChangeEvent: e.cost_change_event ?? 0, totalPlayers: total }),
      };
    })
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || Math.abs(b.net) - Math.abs(a.net) || a.id - b.id);
}

export interface PriceFilter {
  q?: string;
  position?: PositionId | null;
  team?: number | null;
  /** Hide "steady" players. */
  movingOnly?: boolean;
}

export function filterPrices(rows: PriceRow[], { q = "", position = null, team = null, movingOnly = false }: PriceFilter): PriceRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle)) &&
      (position === null || r.positionId === position) &&
      (team === null || r.teamId === team) &&
      (!movingOnly || r.status !== "steady"),
  );
}

// ---------- Effective ownership ----------

export interface EoRow {
  id: number;
  /** Effective ownership in percent: every manager who has him counts once, doubled for a captain, tripled for triple captain. Bench players count nothing. Can pass 100. */
  eo: number;
  /** Managers who have him in their XI, in percent. */
  started: number;
  /** Managers who captained him, in percent. */
  captained: number;
}

/**
 * Effective ownership across a group of managers' picks (`picks` is each manager's list for the gameweek).
 * A starter's multiplier is how many times his points count; a benched player's is 0, so only players who scored for
 * the manager count, with auto-subs already applied for a settled gameweek.
 */
export function effectiveOwnership(picks: { element: number; multiplier: number; is_captain: boolean }[][]): EoRow[] {
  const n = picks.length;
  if (n === 0) return [];
  const by = new Map<number, { eo: number; started: number; captained: number }>();
  for (const list of picks) {
    for (const p of list) {
      if (p.multiplier <= 0) continue;
      const row = by.get(p.element) ?? { eo: 0, started: 0, captained: 0 };
      row.eo += p.multiplier;
      row.started += 1;
      if (p.is_captain) row.captained += 1;
      by.set(p.element, row);
    }
  }
  const pct = (x: number) => Math.round((x / n) * 1000) / 10;
  return [...by].map(([id, r]) => ({ id, eo: pct(r.eo), started: pct(r.started), captained: pct(r.captained) })).sort((a, b) => b.eo - a.eo || b.started - a.started || a.id - b.id);
}

export interface EoTier {
  key: "top4" | "top10" | "all";
  /** How many managers from the top of the table. 0 means all of them. */
  size: number;
}

/** The groups of managers worth comparing, for a league of this size: the top four, the top ten, everyone. */
export function eoTiers(managers: number): EoTier[] {
  const tiers: EoTier[] = [];
  if (managers > 4) tiers.push({ key: "top4", size: 4 });
  if (managers > 10) tiers.push({ key: "top10", size: 10 });
  tiers.push({ key: "all", size: 0 });
  return tiers;
}
