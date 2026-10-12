/**
 * The altered view's "daring moves": bold nudges for one manager, each read straight off their season numbers.
 * Pure. The words live in the catalogs (blotter.dares); this only decides which dares apply and with what figure.
 */
import type { ManagerStats } from "./leagueStats";

/** The chips a manager gets once in each half of the season (GW1–19, GW20–38). */
export const HALF_CHIPS = ["wildcard", "freehit", "bboost", "3xc"] as const;
export type HalfChip = (typeof HALF_CHIPS)[number];
/** The first gameweek of the season's second half, when the chips come back. */
export const SECOND_HALF_FROM = 20;

export type Dare =
  | { key: "chase"; points: number }
  | { key: "leading" }
  | { key: "sealed"; chips: HalfChip[]; half: "first" | "second" }
  | { key: "glowing"; weeks: number }
  | { key: "drifting"; weeks: number }
  | { key: "couch"; points: number }
  | { key: "stash"; bank: number }
  | { key: "noHits" }
  | { key: "manyHits"; points: number };

/** At most this many dares per manager: a few bold lines, not a to-do list. */
export const MAX_DARES = 3;
/** £1.0m or more doing nothing in the bank (tenths of £m). */
export const STASH_FROM = 10;
/** Bench points worth complaining about. */
export const COUCH_FROM = 20;
/** Hit points that make "sit still for a week" the dare. */
export const MANY_HITS_FROM = 12;

/** The chips not yet played in the half `gw` belongs to. */
export function sealedChips(chips: { name: string; event: number }[], gw: number): HalfChip[] {
  const second = gw >= SECOND_HALF_FROM;
  const used = new Set(chips.filter((c) => (c.event >= SECOND_HALF_FROM) === second).map((c) => c.name));
  return HALF_CHIPS.filter((c) => !used.has(c));
}

/** The dares for one manager in order of boldness, at most MAX_DARES. `gw` is the latest gameweek. */
export function daresFor(s: ManagerStats, gw: number): Dare[] {
  const out: Dare[] = [];
  out.push(s.behindLeader > 0 ? { key: "chase", points: s.behindLeader } : { key: "leading" });
  const sealed = sealedChips(s.chips, gw);
  if (sealed.length) out.push({ key: "sealed", chips: sealed, half: gw >= SECOND_HALF_FROM ? "second" : "first" });
  if (s.streak && s.streak.length >= 2) out.push(s.streak.kind === "hot" ? { key: "glowing", weeks: s.streak.length } : { key: "drifting", weeks: s.streak.length });
  if (s.benchPoints >= COUCH_FROM) out.push({ key: "couch", points: s.benchPoints });
  if (s.bank >= STASH_FROM) out.push({ key: "stash", bank: s.bank });
  if (s.hitPoints === 0) out.push({ key: "noHits" });
  else if (s.hitPoints >= MANY_HITS_FROM) out.push({ key: "manyHits", points: s.hitPoints });
  return out.slice(0, MAX_DARES);
}
