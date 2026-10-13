/**
 * League-aware tools for the Tools page: who still holds which chip, which flagged players the league owns, the
 * league's template eleven and each manager's unique players, and a head-to-head between two managers.
 *
 * Pure: no I/O. Everything is worked out from official FPL data (entry history, gameweek picks, bootstrap) and
 * follows the FPL toolkit's accuracy rules: chip windows come from FPL's own bootstrap (never assumed), players are
 * named by their exact `web_name`, unknown player ids are skipped rather than guessed, and a manager whose data could
 * not be had is marked unavailable instead of being counted as having nothing.
 */
import { chipStatus, type ChipSlot } from "./insights";
import type { Bootstrap, BootstrapChip, HistoryChip, Pick as FplPick, PositionId } from "./types";

// ---------- Shared shapes ----------

/** The four chips every season has had since 2017, in the order FPL lists them. */
export const CHIP_KEYS = ["wildcard", "freehit", "bboost", "3xc"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

export interface LeagueManager {
  entry: number;
  teamName: string;
  manager: string;
  rank: number;
}

/** One manager's squad for a gameweek, as FPL returned it. */
export interface LeagueSquad {
  manager: LeagueManager;
  picks: FplPick[];
  activeChip: string | null;
}

/** A player as the league tools show him: exact FPL name and club. */
export interface LeaguePlayer {
  id: number;
  name: string;
  club: string;
  clubCode: number | null;
  positionId: PositionId;
}

type Players = Map<number, LeaguePlayer>;

function playerIndex(bootstrap: Pick<Bootstrap, "elements" | "teams">): Players {
  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t]));
  return new Map(
    bootstrap.elements.map((e) => {
      const club = clubs.get(e.team);
      return [e.id, { id: e.id, name: e.web_name, club: club?.short_name ?? "—", clubCode: club?.code ?? null, positionId: e.element_type }];
    }),
  );
}

/** One squad's picks with duplicates and malformed rows dropped (a defensive read of FPL's list). */
function cleanPicks(picks: FplPick[] | null | undefined): FplPick[] {
  if (!Array.isArray(picks)) return [];
  const seen = new Set<number>();
  return picks.filter((p) => {
    if (!p || !Number.isInteger(p.element) || seen.has(p.element)) return false;
    seen.add(p.element);
    return true;
  });
}

const isStarter = (p: FplPick) => p.position >= 1 && p.position <= 11;

// ---------- Chip tracker ----------

/** One chip for one manager, judged against the window it is in at the next deadline. */
export type ChipCell =
  /** Played in this window. */
  | { state: "used"; gw: number; next: number | null }
  /** Can be played at the next deadline, up to and including GW `until`. */
  | { state: "open"; until: number; next: number | null }
  /** Its window has not opened yet. */
  | { state: "later"; from: number }
  /** Its window closed without it being played. */
  | { state: "gone"; next: number | null }
  /** FPL lists no window for this chip this season. */
  | { state: "none" };

export interface ChipRow extends LeagueManager {
  /** Every chip played this season, oldest first; null when the manager's history could not be had. */
  played: { name: string; gw: number }[] | null;
  /** Per chip, judged against FPL's windows; null when the history or the windows are missing. */
  cells: Record<ChipKey, ChipCell> | null;
  /** Chip plays still to come this season (open now or in a later window); null when unknown. */
  left: number | null;
}

export interface ChipTracker {
  rows: ChipRow[];
  /** Managers who can play each chip at the next deadline; null when FPL's chip windows are unknown. */
  holders: Record<ChipKey, number> | null;
  /** Managers whose history arrived. */
  known: number;
  /** False when bootstrap carried no chip windows: then only chips already played are shown, nothing is assumed. */
  windowsKnown: boolean;
  /** The gameweek the chips are judged against; null once the season is over. */
  nextGw: number | null;
}

/**
 * One chip's cell: the window that contains the next deadline (or, failing that, the next to open, or the last one
 * once they have all passed), plus the start of any later window still unplayed (the second half's set).
 */
export function chipCell(windows: BootstrapChip[], used: HistoryChip[], nextGw: number | null): ChipCell {
  if (windows.length === 0) return { state: "none" };
  const lastStop = Math.max(...windows.map((w) => w.stop_event));
  const ref = nextGw ?? lastStop + 1;
  const slots = chipStatus(windows, used, ref).sort((a, b) => a.start - b.start);
  const current = slots.find((s) => s.start <= ref && ref <= s.stop) ?? slots.find((s) => s.start > ref) ?? slots[slots.length - 1];
  const after = slots.find((s) => s.start > current.stop && (s.state === "available" || s.state === "upcoming"));
  const next = after ? after.start : null;
  const cell = (s: ChipSlot): ChipCell =>
    s.state === "used" ? { state: "used", gw: s.usedIn ?? s.start, next }
    : s.state === "available" ? { state: "open", until: s.stop, next }
    : s.state === "upcoming" ? { state: "later", from: s.start }
    : { state: "gone", next };
  return cell(current);
}

function chipRow(manager: LeagueManager, history: { chips: HistoryChip[] } | null, windows: BootstrapChip[], nextGw: number | null): ChipRow {
  if (!history) return { ...manager, played: null, cells: null, left: null };
  const used = (Array.isArray(history.chips) ? history.chips : []).filter((c) => c && typeof c.name === "string" && Number.isInteger(c.event));
  const played = [...used].sort((a, b) => a.event - b.event || a.name.localeCompare(b.name)).map((c) => ({ name: c.name, gw: c.event }));
  if (windows.length === 0) return { ...manager, played, cells: null, left: null };
  const lastStop = Math.max(...windows.map((w) => w.stop_event));
  const ref = nextGw ?? lastStop + 1;
  const cells = Object.fromEntries(CHIP_KEYS.map((k) => [k, chipCell(windows.filter((w) => w.name === k), used, nextGw)])) as Record<ChipKey, ChipCell>;
  const left = chipStatus(windows.filter((w) => (CHIP_KEYS as readonly string[]).includes(w.name)), used, ref).filter((s) => s.state === "available" || s.state === "upcoming").length;
  return { ...manager, played, cells, left };
}

/**
 * Every manager's chips: those played (with the gameweek) and those still in hand, from each manager's entry history
 * and FPL's chip windows. A manager whose history is missing stays in the list, marked unavailable. Null when no
 * history arrived at all (nothing to say).
 */
export function chipTracker(managers: LeagueManager[], histories: Map<number, { chips: HistoryChip[] }>, windows: BootstrapChip[] | undefined, nextGw: number | null): ChipTracker | null {
  const valid = (windows ?? []).filter((w) => w && typeof w.name === "string" && Number.isInteger(w.start_event) && Number.isInteger(w.stop_event) && w.start_event <= w.stop_event);
  const rows = managers.map((m) => chipRow(m, histories.get(m.entry) ?? null, valid, nextGw));
  const known = rows.filter((r) => r.played !== null).length;
  if (known === 0) return null;
  const windowsKnown = valid.length > 0;
  const holders = windowsKnown ? (Object.fromEntries(CHIP_KEYS.map((k) => [k, rows.filter((r) => r.cells?.[k].state === "open").length])) as Record<ChipKey, number>) : null;
  return { rows, holders, known, windowsKnown, nextGw };
}

// ---------- Injury watch ----------

export type FlagStatus = "d" | "i" | "s" | "u";
const FLAGS: readonly string[] = ["d", "i", "s", "u"];

export interface FlaggedPlayer extends LeaguePlayer {
  status: FlagStatus;
  /** FPL's chance of playing next round, percent; null when FPL gives none. */
  chance: number | null;
  news: string;
  /** League squads he is in, in XIs, and wearing the armband. */
  owners: number;
  starters: number;
  captains: number;
  /** The teams that own him, in table order. */
  teams: string[];
}

/** The most flagged players listed. */
export const INJURY_ROWS = 20;

/**
 * League-owned players FPL has flagged (doubtful, injured, suspended, unavailable), with FPL's news and chance of
 * playing. Sorted by impact on the league: most managers starting him first, then captains, owners, the lowest chance.
 */
export function injuryWatch(bootstrap: Pick<Bootstrap, "elements" | "teams">, squads: LeagueSquad[]): FlaggedPlayer[] {
  const players = playerIndex(bootstrap);
  const flagged = new Map(bootstrap.elements.filter((e) => FLAGS.includes(e.status ?? "a")).map((e) => [e.id, e]));
  const rows = new Map<number, FlaggedPlayer>();
  const ordered = [...squads].sort((a, b) => a.manager.rank - b.manager.rank || a.manager.entry - b.manager.entry);
  for (const s of ordered) {
    for (const p of cleanPicks(s.picks)) {
      const e = flagged.get(p.element);
      const base = players.get(p.element);
      if (!e || !base) continue;
      const chance = typeof e.chance_of_playing_next_round === "number" && Number.isFinite(e.chance_of_playing_next_round) ? e.chance_of_playing_next_round : null;
      const row = rows.get(p.element) ?? { ...base, status: e.status as FlagStatus, chance, news: (e.news ?? "").trim(), owners: 0, starters: 0, captains: 0, teams: [] };
      row.owners += 1;
      if (isStarter(p)) row.starters += 1;
      if (p.is_captain) row.captains += 1;
      row.teams.push(s.manager.teamName);
      rows.set(p.element, row);
    }
  }
  const chanceOf = (r: FlaggedPlayer) => r.chance ?? (r.status === "d" ? 50 : 0);
  return [...rows.values()].sort((a, b) => b.starters - a.starters || b.captains - a.captains || b.owners - a.owners || chanceOf(a) - chanceOf(b) || a.id - b.id);
}

// ---------- Template and differentials ----------

export interface TemplatePlayer extends LeaguePlayer {
  /** League squads he is in, and that share in percent. */
  owners: number;
  share: number;
  starters: number;
}

export interface LeagueTemplate {
  /** Squads counted. */
  managers: number;
  /** e.g. "3-5-2"; null when the owned players can't make a legal eleven (then the most-owned eleven is listed). */
  formation: string | null;
  lines: { positionId: PositionId; players: TemplatePlayer[] }[];
  /** How many of the template eleven each manager owns, in table order. */
  coverage: { entry: number; teamName: string; owned: number }[];
}

const FORMATIONS: [number, number, number][] = [];
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) FORMATIONS.push([d, m, f]);

function ownership(bootstrap: Pick<Bootstrap, "elements" | "teams">, squads: LeagueSquad[]) {
  const players = playerIndex(bootstrap);
  const count = new Map<number, { owners: number; starters: number; entries: number[] }>();
  for (const s of squads) {
    for (const p of cleanPicks(s.picks)) {
      if (!players.has(p.element)) continue;
      const c = count.get(p.element) ?? { owners: 0, starters: 0, entries: [] };
      c.owners += 1;
      if (isStarter(p)) c.starters += 1;
      c.entries.push(s.manager.entry);
      count.set(p.element, c);
    }
  }
  return { players, count };
}

/**
 * The league's template: the most-owned legal eleven across the squads (one keeper, 3-5 defenders, 2-5 midfielders,
 * 1-3 forwards), ties broken by how many start him. Needs at least two squads: one squad is its own template.
 */
export function leagueTemplate(bootstrap: Pick<Bootstrap, "elements" | "teams">, squads: LeagueSquad[]): LeagueTemplate | null {
  if (squads.length < 2) return null;
  const { players, count } = ownership(bootstrap, squads);
  const n = squads.length;
  const all: TemplatePlayer[] = [...count].map(([id, c]) => ({ ...players.get(id)!, owners: c.owners, starters: c.starters, share: Math.round((c.owners / n) * 1000) / 10 }));
  if (all.length === 0) return null;
  const order = (a: TemplatePlayer, b: TemplatePlayer) => b.owners - a.owners || b.starters - a.starters || a.id - b.id;
  const pool = (pos: PositionId) => all.filter((p) => p.positionId === pos).sort(order);
  const by = { 1: pool(1), 2: pool(2), 3: pool(3), 4: pool(4) } as Record<PositionId, TemplatePlayer[]>;
  const sum = (xs: TemplatePlayer[]) => xs.reduce((s, p) => s + p.owners * 1000 + p.starters, 0);

  let best: { shape: [number, number, number]; value: number } | null = null;
  for (const shape of FORMATIONS) {
    if (by[1].length < 1 || by[2].length < shape[0] || by[3].length < shape[1] || by[4].length < shape[2]) continue;
    const value = sum(by[1].slice(0, 1)) + sum(by[2].slice(0, shape[0])) + sum(by[3].slice(0, shape[1])) + sum(by[4].slice(0, shape[2]));
    if (!best || value > best.value) best = { shape, value };
  }
  let lines: LeagueTemplate["lines"];
  let formation: string | null = null;
  if (best) {
    const [d, m, f] = best.shape;
    formation = `${d}-${m}-${f}`;
    lines = [{ positionId: 1, players: by[1].slice(0, 1) }, { positionId: 2, players: by[2].slice(0, d) }, { positionId: 3, players: by[3].slice(0, m) }, { positionId: 4, players: by[4].slice(0, f) }];
  } else {
    const top = [...all].sort(order).slice(0, 11);
    lines = ([1, 2, 3, 4] as PositionId[]).map((positionId) => ({ positionId, players: top.filter((p) => p.positionId === positionId) })).filter((l) => l.players.length > 0);
  }
  const ids = new Set(lines.flatMap((l) => l.players.map((p) => p.id)));
  const coverage = [...squads]
    .sort((a, b) => a.manager.rank - b.manager.rank || a.manager.entry - b.manager.entry)
    .map((s) => ({ entry: s.manager.entry, teamName: s.manager.teamName, owned: cleanPicks(s.picks).filter((p) => ids.has(p.element)).length }));
  return { managers: n, formation, lines, coverage };
}

export interface UniquePlayer extends LeaguePlayer {
  starter: boolean;
  captain: boolean;
}

export interface ManagerUniques extends LeagueManager {
  /** Players nobody else in the league owns: XI first, then by position. */
  players: UniquePlayer[];
}

const byPitch = (a: UniquePlayer, b: UniquePlayer) => Number(b.starter) - Number(a.starter) || a.positionId - b.positionId || a.id - b.id;

/** Each manager's unique players: owned by them and nobody else whose squad was read. Needs at least two squads. */
export function leagueDifferentials(bootstrap: Pick<Bootstrap, "elements" | "teams">, squads: LeagueSquad[]): ManagerUniques[] | null {
  if (squads.length < 2) return null;
  const { players, count } = ownership(bootstrap, squads);
  return [...squads]
    .sort((a, b) => a.manager.rank - b.manager.rank || a.manager.entry - b.manager.entry)
    .map((s) => ({
      ...s.manager,
      players: cleanPicks(s.picks)
        .filter((p) => count.get(p.element)?.owners === 1)
        .map((p) => ({ ...players.get(p.element)!, starter: isStarter(p), captain: p.is_captain }))
        .sort(byPitch),
    }));
}

// ---------- Head to head ----------

export interface RivalSide {
  manager: LeagueManager;
  captain: string | null;
  activeChip: string | null;
  /** Players only this side owns. */
  only: UniquePlayer[];
  /** Chips that can be played at the next deadline; null when unknown. */
  chipsOpen: ChipKey[] | null;
}

export interface RivalCompare {
  a: RivalSide;
  b: RivalSide;
  /** Players both own, with whether each starts him. */
  shared: (LeaguePlayer & { aStarts: boolean; bStarts: boolean })[];
}

/** Two managers side by side: shared and unique players, captains, chips still open. */
export function compareRivals(bootstrap: Pick<Bootstrap, "elements" | "teams">, a: LeagueSquad, b: LeagueSquad, chips: ChipTracker | null): RivalCompare {
  const players = playerIndex(bootstrap);
  const pa = cleanPicks(a.picks).filter((p) => players.has(p.element));
  const pb = cleanPicks(b.picks).filter((p) => players.has(p.element));
  const ia = new Map(pa.map((p) => [p.element, p]));
  const ib = new Map(pb.map((p) => [p.element, p]));
  const side = (s: LeagueSquad, mine: FplPick[], theirs: Map<number, FplPick>): RivalSide => {
    const cap = mine.find((p) => p.is_captain);
    const row = chips?.rows.find((r) => r.entry === s.manager.entry);
    return {
      manager: s.manager,
      captain: cap ? players.get(cap.element)!.name : null,
      activeChip: s.activeChip ?? null,
      only: mine.filter((p) => !theirs.has(p.element)).map((p) => ({ ...players.get(p.element)!, starter: isStarter(p), captain: p.is_captain })).sort(byPitch),
      chipsOpen: row?.cells ? CHIP_KEYS.filter((k) => row.cells![k].state === "open") : null,
    };
  };
  const shared = pa
    .filter((p) => ib.has(p.element))
    .map((p) => ({ ...players.get(p.element)!, aStarts: isStarter(p), bStarts: isStarter(ib.get(p.element)!) }))
    .sort((x, y) => x.positionId - y.positionId || x.id - y.id);
  return { a: side(a, pa, ib), b: side(b, pb, ia), shared };
}

/**
 * The two managers asked for in `?vs=A,B` (or `?vs=A&vs=B`, as a form sends it). Strict: exactly two different
 * positive whole numbers of at most ten digits, nothing else. Anything else is null.
 */
export function parseVs(raw: string | string[] | undefined | null): [number, number] | null {
  if (raw == null) return null;
  const joined = (Array.isArray(raw) ? raw : [raw]).join(",");
  if (joined.length > 40) return null;
  const parts = joined.split(",").map((s) => s.trim());
  if (parts.length !== 2 || !parts.every((s) => /^[1-9]\d{0,9}$/.test(s))) return null;
  const [a, b] = parts.map(Number);
  return a !== b ? [a, b] : null;
}

// ---------- The whole set ----------

export interface Rivals {
  /** Managers whose squad was read: the ones that can be compared. */
  options: LeagueManager[];
  /** What was asked for, if anything usable. */
  selected: [number, number] | null;
  /** True when `vs` was given but isn't two of this league's managers with squads. */
  invalid: boolean;
  compare: RivalCompare | null;
}

export interface LeagueTools {
  /** The gameweek the squads are from; null before the season (no picks yet). */
  gw: number | null;
  /** The gameweek of the next deadline, whose picks stay hidden until it passes; null when none is left. */
  nextGw: number | null;
  /** Managers in the league, and how many of them (from the top) were looked at. */
  total: number;
  covered: number;
  /** Squads that arrived. */
  squads: number;
  chips: ChipTracker | null;
  injuries: { rows: FlaggedPlayer[]; matching: number } | null;
  template: LeagueTemplate | null;
  differentials: ManagerUniques[] | null;
  rivals: Rivals | null;
}

export interface LeagueToolsInput {
  bootstrap: Pick<Bootstrap, "elements" | "teams" | "chips">;
  /** Every manager in the league, in table order. */
  total: number;
  /** The managers looked at. */
  managers: LeagueManager[];
  gw: number | null;
  nextGw: number | null;
  squads: Map<number, { picks: FplPick[]; active_chip: string | null }>;
  histories: Map<number, { chips: HistoryChip[] }>;
  vs?: string | string[];
}

/** Builds every league tool that the data allows; each one is null when it can't be worked out. */
export function buildLeagueTools({ bootstrap, total, managers, gw, nextGw, squads, histories, vs }: LeagueToolsInput): LeagueTools | null {
  if (managers.length === 0) return null;
  const read: LeagueSquad[] = managers.flatMap((m) => {
    const s = squads.get(m.entry);
    return s && Array.isArray(s.picks) ? [{ manager: m, picks: s.picks, activeChip: s.active_chip ?? null }] : [];
  });
  const chips = chipTracker(managers, histories, bootstrap.chips, nextGw);
  const flagged = read.length ? injuryWatch(bootstrap, read) : null;

  let rivals: Rivals | null = null;
  if (read.length >= 2) {
    const given = vs !== undefined && (Array.isArray(vs) ? vs : [vs]).some((v) => typeof v === "string" && v.trim() !== "");
    const asked = given ? parseVs(vs) : null;
    const a = asked ? read.find((s) => s.manager.entry === asked[0]) : undefined;
    const b = asked ? read.find((s) => s.manager.entry === asked[1]) : undefined;
    const ok = Boolean(a && b);
    rivals = {
      options: read.map((s) => s.manager),
      selected: ok ? asked : null,
      invalid: given && !ok,
      compare: ok ? compareRivals(bootstrap, a!, b!, chips) : null,
    };
  }

  return {
    gw: read.length ? gw : null,
    nextGw,
    total,
    covered: managers.length,
    squads: read.length,
    chips,
    injuries: flagged ? { rows: flagged.slice(0, INJURY_ROWS), matching: flagged.length } : null,
    template: leagueTemplate(bootstrap, read),
    differentials: leagueDifferentials(bootstrap, read),
    rivals,
  };
}
