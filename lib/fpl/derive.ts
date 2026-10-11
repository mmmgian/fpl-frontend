/** Pure, framework-free FPL logic. Everything here is unit-tested. */
import type { Bootstrap, EntryPicks, EventLive, Fixture, FplEvent, PositionId } from "./types";

// ---------- Gameweeks ----------

/** The gameweek the app should show by default: current, else latest finished, else null (pre-season). */
export function currentEvent(events: FplEvent[]): FplEvent | null {
  return (
    events.find((e) => e.is_current) ??
    [...events].reverse().find((e) => e.finished) ??
    null
  );
}

export type GwStatus = "upcoming" | "live" | "provisional" | "final";

export function gwStatus(event: FplEvent, now: Date = new Date()): GwStatus {
  if (new Date(event.deadline_time) > now) return "upcoming";
  if (!event.finished) return "live";
  return event.data_checked ? "final" : "provisional";
}

/** Parse a `?gw=` search param; returns null if missing or out of [min, max]. */
export function parseGw(raw: string | string[] | undefined, min: number, max: number): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** Positive = climbed. null when there is no previous rank (first GW / new entry). */
export function rankMovement(rank: number, lastRank: number | null | undefined): number | null {
  if (!lastRank) return null;
  return lastRank - rank;
}

// ---------- Fixtures & bonus ----------

export type FixtureState = "upcoming" | "live" | "provisional" | "final";

export function fixtureState(f: Fixture): FixtureState {
  if (f.finished) return "final";
  if (f.finished_provisional) return "provisional";
  if (f.started) return "live";
  return "upcoming";
}

export type BonusSource = "confirmed" | "provisional" | "projected" | "none";

export interface BonusRow {
  element: number;
  side: "h" | "a";
  bonus: number;
  bps: number | null;
}

/**
 * FPL bonus from BPS, using competition ranking across both teams:
 * rank = 1 + number of players with strictly higher BPS; rank 1 -> 3, 2 -> 2, 3 -> 1.
 * This reproduces the official tie rules (e.g. two tied first both get 3, next gets 1).
 */
export function bonusFromBps<T extends { bps: number }>(players: T[]): (T & { bonus: number })[] {
  return players
    .map((p) => {
      const rank = 1 + players.filter((q) => q.bps > p.bps).length;
      return { ...p, bonus: rank <= 3 ? 4 - rank : 0 };
    })
    .filter((p) => p.bonus > 0)
    .sort((a, b) => b.bonus - a.bonus || b.bps - a.bps);
}

function stat(f: Fixture, id: string) {
  const s = f.stats?.find((x) => x.identifier === id);
  return s ? [...s.h.map((v) => ({ ...v, side: "h" as const })), ...s.a.map((v) => ({ ...v, side: "a" as const }))] : [];
}

export function matchBonus(f: Fixture): { source: BonusSource; rows: BonusRow[] } {
  const bps = stat(f, "bps");
  const bpsOf = new Map(bps.map((b) => [b.element, b.value]));
  const official = stat(f, "bonus");

  if (official.length > 0) {
    const rows = official
      .map((b) => ({ element: b.element, side: b.side, bonus: b.value, bps: bpsOf.get(b.element) ?? null }))
      .sort((a, b) => b.bonus - a.bonus || (b.bps ?? 0) - (a.bps ?? 0));
    return { source: f.finished ? "confirmed" : "provisional", rows };
  }
  if (f.started && bps.length > 0) {
    const rows = bonusFromBps(bps.map((b) => ({ element: b.element, side: b.side, bps: b.value })));
    return { source: "projected", rows };
  }
  return { source: "none", rows: [] };
}

// ---------- Team sheet ----------

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
  clubCode: number | null;
  positionId: PositionId;
  slot: number;
  basePoints: number | null;
  multiplier: number;
  points: number | null;
  minutes: number | null;
  isCaptain: boolean;
  isVice: boolean;
}

export interface TeamSheet {
  starters: { positionId: PositionId; players: SheetPlayer[] }[];
  bench: SheetPlayer[];
  /** Sum of points x multiplier for players that count (multiplier > 0), before hits. */
  grossPoints: number;
}

export function buildTeamSheet(picks: EntryPicks, bootstrap: Bootstrap, live: EventLive | null): TeamSheet {
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
      clubCode: team?.code ?? null,
      positionId: el.element_type,
      slot: p.position,
      basePoints: base,
      multiplier: p.multiplier,
      points: base == null ? null : base * p.multiplier,
      minutes: stats ? stats.minutes : null,
      isCaptain: p.is_captain,
      isVice: p.is_vice_captain,
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

// ---------- Formatting ----------

export const formatMoney = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;
export const formatRank = (n: number | null | undefined) => (n ? n.toLocaleString("en-GB") : "—");
