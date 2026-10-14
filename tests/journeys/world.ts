/**
 * A whole FPL season in memory, for tests that walk a page through every moment of a gameweek.
 *
 * `season(phase)` builds a coherent world: 8 clubs and 48 players, a fixture list with real kick-off times, per-player
 * live points worked out from what happened in each match (goals, clean sheets, bonus from BPS), six managers whose
 * squads, histories, hits and chips agree with those points, a league table, and the history backend. `install()` puts
 * it behind a mocked `fetch` and freezes the clock at the phase's moment, so the REAL pages, services and views run.
 *
 * Nothing here is random: the same phase always gives the same world, and `truth` exposes the independently computed
 * answers (points, positions, states) that tests compare the rendered page against.
 */
import { vi } from "vitest";
import type { Bootstrap, EntryPicks, EventLive, Fixture, FplElement, FplEvent, ScheduledFixture, StandingRow } from "@/lib/domain/types";

export type PhaseName = "preseason" | "upcoming" | "live-playing" | "live-between" | "live-over" | "provisional" | "final" | "season-over";
export const PHASES: PhaseName[] = ["preseason", "upcoming", "live-playing", "live-between", "live-over", "provisional", "final", "season-over"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MATCH_MS = 135 * 60_000;
const GW6_DEADLINE = Date.parse("2026-10-10T10:00:00Z");
export const LEAGUE_ID = 467763;

/** The moment, the current gameweek and FPL's flags for each phase. */
const MOMENTS: Record<PhaseName, { gw: number; now: string; finished: boolean; checked: boolean; started: boolean }> = {
  preseason: { gw: 1, now: "2026-08-01T12:00:00Z", finished: false, checked: false, started: false },
  upcoming: { gw: 7, now: "2026-10-16T09:00:00Z", finished: false, checked: false, started: false },
  "live-playing": { gw: 6, now: "2026-10-10T15:00:00Z", finished: false, checked: false, started: true },
  "live-between": { gw: 6, now: "2026-10-11T12:00:00Z", finished: false, checked: false, started: true },
  "live-over": { gw: 6, now: "2026-10-12T22:30:00Z", finished: false, checked: false, started: true },
  provisional: { gw: 6, now: "2026-10-13T08:00:00Z", finished: true, checked: false, started: true },
  final: { gw: 6, now: "2026-10-14T14:30:00Z", finished: true, checked: true, started: true },
  "season-over": { gw: 38, now: "2027-05-31T12:00:00Z", finished: true, checked: true, started: true },
};

// ---------- clubs and players ----------

const CLUBS: [string, string][] = [["Arsenal", "ARS"], ["Man City", "MCI"], ["Chelsea", "CHE"], ["Newcastle", "NEW"], ["Liverpool", "LIV"], ["Spurs", "TOT"], ["Everton", "EVE"], ["Brighton", "BHA"]];
export const teams = CLUBS.map(([name, short_name], i) => ({ id: i + 1, code: [3, 43, 8, 4, 14, 6, 11, 36][i], name, short_name }));
const ROLES: [string, number][] = [["GK", 1], ["D1", 2], ["D2", 2], ["M1", 3], ["M2", 3], ["F1", 4]];
/** Player ids are `club * 10 + slot`: 11 = Arsenal GK, 12/13 = Arsenal defenders, 14/15 = midfielders, 16 = forward. */
export const playerName = (id: number) => `${CLUBS[Math.floor(id / 10) - 1][1]} ${ROLES[(id % 10) - 1][0]}`;
const positionOf = (id: number) => ROLES[(id % 10) - 1][1];
const clubOf = (id: number) => Math.floor(id / 10);

export interface WorldOptions {
  /** Elements that did not play at all this gameweek (rotation, injury): their starters get auto-subbed. */
  zeroMinutes?: number[];
  /** Per-manager chip played in the current gameweek, e.g. { 1: "3xc" }. */
  activeChips?: Record<number, string>;
  /** Players FPL has flagged (status, news, chance of playing). */
  flags?: Record<number, { status: string; news: string; chance: number | null }>;
}

// ---------- the fixture list ----------

/** Round-robin for 8 clubs: 7 rounds of 4 matches, repeating. */
function pairings(gw: number): [number, number][] {
  const ring = [2, 3, 4, 5, 6, 7, 8];
  const r = (gw - 1) % 7;
  const rot = [...ring.slice(ring.length - r), ...ring.slice(0, ring.length - r)];
  const order = [1, ...rot];
  const out: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = order[i];
    const b = order[7 - i];
    out.push(gw % 2 === 0 ? [a, b] : [b, a]);
  }
  return out;
}
const deadlineOf = (gw: number) => GW6_DEADLINE + (gw - 6) * 7 * DAY;
/** Sat 11:30, Sat 14:00, Sat 16:30 and Monday night, counted from the gameweek's deadline (a Saturday 10:00). */
const KICKOFFS = [90 * 60_000, 4 * HOUR, 6.5 * HOUR, 57 * HOUR + 0];
const score = (fid: number): [number, number] => [(fid * 3) % 4, (fid * 5) % 3];

interface Sim {
  at: number;
  fixtures: Map<number, Fixture[]>;
  schedule: ScheduledFixture[];
}

function simulate(gwNow: number, lastGw: number, at: number, momentStarted: boolean): Sim {
  const fixtures = new Map<number, Fixture[]>();
  const schedule: ScheduledFixture[] = [];
  for (let g = 1; g <= Math.max(lastGw, 12); g++) {
    const list = pairings(g).map(([h, a], i): Fixture => {
      const id = g * 10 + i + 1;
      const kickoff = deadlineOf(g) + KICKOFFS[i];
      const [hs, as] = score(id);
      const past = g < gwNow || (g === gwNow && momentStarted && at >= kickoff + MATCH_MS);
      const started = g < gwNow || (g === gwNow && momentStarted && at >= kickoff);
      const minutes = !started ? 0 : past ? 90 : Math.min(90, Math.floor((at - kickoff) / 60_000));
      return {
        id, event: g, team_h: h, team_a: a, kickoff_time: new Date(kickoff).toISOString(),
        started, finished: past, finished_provisional: past, minutes,
        team_h_score: started ? hs : null, team_a_score: started ? as : null,
        team_h_difficulty: ((g + h) % 5) + 1, team_a_difficulty: ((g + a + 2) % 5) + 1,
        stats: [],
      };
    });
    fixtures.set(g, list);
    for (const f of list) {
      schedule.push({
        id: f.id, event: g, team_h: f.team_h, team_a: f.team_a, team_h_difficulty: f.team_h_difficulty!, team_a_difficulty: f.team_a_difficulty!,
        kickoff_time: f.kickoff_time, started: f.started, finished: f.finished, finished_provisional: f.finished_provisional,
        team_h_score: f.team_h_score, team_a_score: f.team_a_score,
      });
    }
  }
  return { at, fixtures, schedule };
}

// ---------- what each player did ----------

interface PlayerGw { id: number; minutes: number; points: number; bonus: number; bps: number; goals: number; assists: number; cleanSheet: boolean }

/** Everything every player did in one fixture, and the bonus (only once the match is over). */
function playFixture(f: Fixture, opts: WorldOptions): Map<number, PlayerGw> {
  const out = new Map<number, PlayerGw>();
  if (!f.started) return out;
  const scored = { [f.team_h]: f.team_h_score ?? 0, [f.team_a]: f.team_a_score ?? 0 };
  for (const team of [f.team_h, f.team_a]) {
    const conceded = scored[team === f.team_h ? f.team_a : f.team_h];
    for (let slot = 1; slot <= 6; slot++) {
      const id = team * 10 + slot;
      const pos = positionOf(id);
      const played = !(opts.zeroMinutes ?? []).includes(id) && id % 19 !== 0;
      const goals = slot === 6 && played ? scored[team] : 0;
      const assists = slot === 4 && played && scored[team] >= 2 ? 1 : 0;
      const cleanSheet = played && conceded === 0 && f.minutes >= 60;
      let points = 0;
      if (played) {
        points += f.minutes >= 60 ? 2 : 1;
        points += goals * (pos === 4 ? 4 : 5) + assists * 3;
        if (cleanSheet) points += pos <= 2 ? 4 : pos === 3 ? 1 : 0;
        if (pos <= 2) points -= Math.floor(conceded / 2);
      }
      const bps = played ? Math.max(0, points * 3 + goals * 12 + (id % 5)) : 0;
      out.set(id, { id, minutes: played ? f.minutes : 0, points, bonus: 0, bps, goals, assists, cleanSheet });
    }
  }
  if (f.finished_provisional) {
    const ranked = [...out.values()].filter((p) => p.minutes > 0).sort((a, b) => b.bps - a.bps || a.id - b.id);
    [3, 2, 1].forEach((b, i) => {
      if (ranked[i]) ranked[i].bonus = b;
    });
  }
  return out;
}

const side = (f: Fixture, players: Map<number, PlayerGw>, pick: (p: PlayerGw) => number, min = 1) => ({
  h: [...players.values()].filter((p) => clubOf(p.id) === f.team_h && pick(p) >= min).map((p) => ({ element: p.id, value: pick(p) })),
  a: [...players.values()].filter((p) => clubOf(p.id) === f.team_a && pick(p) >= min).map((p) => ({ element: p.id, value: pick(p) })),
});

// ---------- the world ----------

export interface ManagerTruth {
  entry: number;
  teamName: string;
  manager: string;
  picks: EntryPicks;
  gross: number;
  hit: number;
  net: number;
  bench: number;
  captain: number;
  /** Points scored by each element in this manager's squad this gameweek, after multipliers. */
  byElement: Map<number, number>;
}

export interface World {
  phase: PhaseName;
  opts: WorldOptions;
  now: Date;
  gw: number;
  bootstrap: Bootstrap;
  fixtures: Fixture[];
  schedule: ScheduledFixture[];
  live: EventLive;
  managers: ManagerTruth[];
  standings: StandingRow[];
  routes: Routes;
  truth: {
    /** Net points the manager scored this gameweek, worked out from the squad and the match events. */
    net(entry: number): number;
    /** Who leads the league table at this moment. */
    leader(): StandingRow;
    fixtureState(f: Fixture): "upcoming" | "playing" | "over";
    /** Every live element of any gameweek the world has been asked about. */
    liveFor(gw: number): EventLive;
    fixturesFor(gw: number): Fixture[];
    picksFor(entry: number, gw: number): EntryPicks;
  };
}

/** A canned JSON body, a ready Response, or a function of the URL. (Not `unknown | fn`: that collapses to `unknown` and route lambdas lose their types.) */
export type Handler = Response | object | string | number | boolean | null | ((url: string) => Response | Promise<Response>);
export type Routes = [match: (url: string) => boolean, handler: Handler][];

const SQUAD: { element: number; position: number }[] = [
  // XI: 1 GK, 3 DEF, 4 MID, 3 FWD (a legal 3-4-3); bench: GK, DEF, DEF, MID. Ids are club*10+slot: slot 1 GK, 2-3 DEF, 4-5 MID, 6 FWD.
  { element: 11, position: 1 }, { element: 12, position: 2 }, { element: 13, position: 3 }, { element: 32, position: 4 }, { element: 14, position: 5 },
  { element: 34, position: 6 }, { element: 54, position: 7 }, { element: 74, position: 8 }, { element: 16, position: 9 }, { element: 26, position: 10 }, { element: 56, position: 11 },
  { element: 21, position: 12 }, { element: 33, position: 13 }, { element: 52, position: 14 }, { element: 15, position: 15 },
];
const PEOPLE: Record<number, [string, string, number, number]> = {
  // entry: [team, manager, captain, differentiator that replaces element 54]
  7: ["Gaucho F.C.", "Gian Jaen", 26, 54],
  1: ["Bart's Team", "Bart Simp", 16, 85],
  2: ["Dang Football Club", "Khang Dang", 26, 75],
  3: ["Saka la bolsita", "Sofia Saka", 56, 65],
  4: ["Papoy", "Pablo Poy", 26, 45],
  5: ["FC RTW", "Rita Tew", 36, 25],
};
const ENTRIES = Object.keys(PEOPLE).map(Number);

export function season(phase: PhaseName, opts: WorldOptions = {}): World {
  const m = MOMENTS[phase];
  const now = new Date(m.now);
  const at = now.getTime();
  const gw = m.gw;
  const lastGw = gw === 38 ? 38 : 12;
  const sim = simulate(gw, lastGw, at, m.started);

  const players = (g: number) => {
    const all = new Map<number, PlayerGw>();
    for (const f of sim.fixtures.get(g) ?? []) for (const [id, p] of playFixture(f, opts)) all.set(id, p);
    return all;
  };
  const withStats = (g: number): Fixture[] =>
    (sim.fixtures.get(g) ?? []).map((f) => {
      const p = playFixture(f, opts);
      return {
        ...f,
        stats: f.started
          ? [
              { identifier: "goals_scored", ...side(f, p, (x) => x.goals) },
              { identifier: "assists", ...side(f, p, (x) => x.assists) },
              { identifier: "bonus", ...side(f, p, (x) => x.bonus) },
              { identifier: "bps", ...side(f, p, (x) => x.bps) },
            ]
          : [],
      };
    });
  const liveFor = (g: number): EventLive => {
    const p = players(g);
    return { elements: [...p.values()].map((x) => ({ id: x.id, stats: { total_points: x.points + x.bonus, minutes: x.minutes, bonus: x.bonus, bps: x.bps } })) };
  };

  const events: FplEvent[] = Array.from({ length: lastGw }, (_, i) => {
    const id = i + 1;
    const flags =
      id < gw ? { is_current: false, is_next: false, finished: true, data_checked: true }
      : id === gw ? { is_current: phase !== "preseason", is_next: phase === "preseason", finished: m.finished, data_checked: m.checked }
      : id === gw + 1 && phase !== "preseason" ? { is_current: false, is_next: true, finished: false, data_checked: false }
      : { is_current: false, is_next: false, finished: false, data_checked: false };
    return { id, name: `Gameweek ${id}`, deadline_time: new Date(deadlineOf(id)).toISOString(), ...flags, ...(flags.finished ? { average_entry_score: 48 + (id % 9) } : {}) };
  });
  if (phase === "preseason") events.forEach((e) => (e.deadline_time = new Date(Date.parse("2026-08-14T17:30:00Z") + (e.id - 1) * 7 * DAY).toISOString()));

  const flags = opts.flags ?? { 55: { status: "i", news: "Knee injury - expected back in November", chance: 0 }, 41: { status: "d", news: "Minor knock - 75% chance of playing", chance: 75 } };
  const elements: FplElement[] = teams.flatMap((t) =>
    ROLES.map(([, pos], i): FplElement => {
      const id = t.id * 10 + i + 1;
      const f = flags[id];
      return {
        id, web_name: playerName(id), first_name: playerName(id), second_name: t.short_name, team: t.id, element_type: pos as 1 | 2 | 3 | 4,
        status: f?.status ?? "a", news: f?.news ?? "", chance_of_playing_next_round: f ? f.chance : null,
        selected_by_percent: String(((id * 37) % 600) / 10), now_cost: 40 + pos * 8 + ((id * 7) % 40), news_added: f ? "2026-10-08T09:00:00Z" : null,
        minutes: 540 - (id % 4) * 90, starts: 6 - (id % 4), total_points: 20 + ((id * 13) % 50), form: (((id * 11) % 90) / 10).toFixed(1), ep_next: (2 + ((id * 3) % 70) / 10).toFixed(1),
        transfers_in_event: (id * 977) % 90000, transfers_out_event: (id * 631) % 70000, cost_change_event: 0, cost_change_start: (id % 5) - 2,
        expected_goals_per_90: pos === 4 ? 0.45 + (id % 4) / 10 : pos === 3 ? 0.2 : 0.03, expected_assists_per_90: pos >= 3 ? 0.15 : 0.03,
        clean_sheets_per_90: pos <= 2 ? 0.3 : 0.1, defensive_contribution_per_90: pos === 2 ? 7 + (id % 3) : pos === 3 ? 6 : 2, yellow_cards: id % 5,
        penalties_order: i === 5 ? 1 : null, direct_freekicks_order: i === 3 ? 1 : null, corners_and_indirect_freekicks_order: i === 4 ? 1 : null, points_per_game: (2 + (id % 5)).toFixed(1),
      };
    }),
  );
  const bootstrap: Bootstrap = {
    events, teams, elements, total_players: 11_000_000,
    chips: [
      { name: "wildcard", start_event: 2, stop_event: 19 }, { name: "wildcard", start_event: 20, stop_event: 38 },
      { name: "freehit", start_event: 2, stop_event: 19 }, { name: "freehit", start_event: 20, stop_event: 38 },
      { name: "bboost", start_event: 1, stop_event: 19 }, { name: "bboost", start_event: 20, stop_event: 38 },
      { name: "3xc", start_event: 1, stop_event: 19 }, { name: "3xc", start_event: 20, stop_event: 38 },
    ],
  };

  // managers: squads, chips, hits, and the points they add up to
  const chipOf = (entry: number, g: number) => (g === gw ? (opts.activeChips ?? {})[entry] ?? null : null);
  const hitOf = (entry: number, g: number) => (entry === 7 && g === 6 ? 4 : 0);
  /** Gross points of the manager's squad in a gameweek that is over, from the same match events as everything else. */
  const priorGross = (entry: number, g: number) => {
    const lv = new Map(liveFor(g).elements.map((e) => [e.id, e.stats.total_points]));
    const cap = PEOPLE[entry][2];
    return squadOf(entry).reduce((sum, sq) => sum + (lv.get(sq.element) ?? 0) * (sq.position > 11 ? 0 : sq.element === cap ? 2 : 1), 0);
  };
  const squadOf = (entry: number) => SQUAD.map((s) => (s.element === 54 ? { ...s, element: PEOPLE[entry][3] } : s));
  /** FPL processes a gameweek's automatic substitutions and the vice-captain rule only once it is finished (bonus in). */
  const weekFinished = (g: number) => g < gw || (g === gw && m.finished);

  /**
   * FPL's end-of-gameweek processing, applied in place to a finished week's picks (a no-op when every starter played,
   * so worlds without `zeroMinutes` are unchanged): a starter with 0 minutes is replaced by the first bench player in
   * order who played and keeps the formation legal (goalkeeper for goalkeeper; never below 3 DEF / 2 MID / 1 FWD, or
   * below what the XI already had), the two swap positions and multipliers; a captain with 0 minutes passes his
   * multiplier (2, or 3 under Triple Captain) to the vice-captain if the vice played. No subs under Bench Boost.
   */
  function fplEndOfWeek(entry: number, g: number, chip: string | null, squad: EntryPicks["picks"], p: Map<number, { minutes: number }>) {
    const subs: { element_in: number; element_out: number; entry: number; event: number }[] = [];
    if (!weekFinished(g)) return subs;
    const played = (id: number) => (p.get(id)?.minutes ?? 0) > 0;
    const capPick = squad.find((s) => s.is_captain);
    const vicePick = squad.find((s) => s.is_vice_captain);
    if (capPick && !played(capPick.element) && vicePick && played(vicePick.element)) {
      vicePick.multiplier = capPick.multiplier;
      capPick.multiplier = 1;
    }
    if (chip === "bboost") return subs;
    const MIN: Record<number, number> = { 1: 1, 2: 3, 3: 2, 4: 1 };
    const xiCount = (pos: number) => squad.filter((s) => s.position <= 11 && positionOf(s.element) === pos).length;
    for (const out of [...squad].filter((s) => s.position <= 11).sort((a, b) => a.position - b.position)) {
      if (played(out.element)) continue;
      const outPos = positionOf(out.element);
      const inn = [...squad]
        .filter((s) => s.position > 11 && played(s.element))
        .sort((a, b) => a.position - b.position)
        .find((s) => {
          const inPos = positionOf(s.element);
          if ((outPos === 1) !== (inPos === 1)) return false;
          return inPos === outPos || xiCount(outPos) - 1 >= Math.min(MIN[outPos], xiCount(outPos));
        });
      if (!inn) continue;
      [inn.position, out.position] = [out.position, inn.position];
      inn.multiplier = 1; // the armband never travels with a substitution: it went to the vice (or nowhere)
      out.multiplier = 0;
      subs.push({ element_in: inn.element, element_out: out.element, entry, event: g });
    }
    return subs;
  }

  function picksFor(entry: number, g: number): EntryPicks {
    const [, , cap] = PEOPLE[entry];
    const vice = cap === 16 ? 26 : 16;
    const chip = chipOf(entry, g);
    const p = new Map(liveFor(g).elements.map((e) => [e.id, e.stats]));
    const squad = squadOf(entry).map((s) => ({
      element: s.element, position: s.position,
      multiplier: s.position > 11 ? (chip === "bboost" ? 1 : 0) : s.element === cap ? (chip === "3xc" ? 3 : 2) : 1,
      is_captain: s.element === cap, is_vice_captain: s.element === vice,
    }));
    const automatic_subs = fplEndOfWeek(entry, g, chip, squad, p);
    const gross = squad.reduce((sum, s) => sum + (p.get(s.element)?.total_points ?? 0) * s.multiplier, 0);
    const bench = squad.filter((s) => s.position > 11).reduce((sum, s) => sum + (p.get(s.element)?.total_points ?? 0), 0);
    const prior = Array.from({ length: g - 1 }, (_, i) => priorGross(entry, i + 1) - hitOf(entry, i + 1)).reduce((a, b) => a + b, 0);
    return {
      active_chip: chip,
      automatic_subs,
      entry_history: {
        event: g, points: gross, total_points: prior + gross - hitOf(entry, g), rank: null, overall_rank: 100_000 + entry * 1000, bank: 14, value: 1000 + entry,
        event_transfers: hitOf(entry, g) ? 2 : 0, event_transfers_cost: hitOf(entry, g), points_on_bench: bench,
      },
      picks: squad,
    };
  }

  const managers: ManagerTruth[] = ENTRIES.map((entry) => {
    const picks = picksFor(entry, gw);
    const lv = new Map(liveFor(gw).elements.map((e) => [e.id, e.stats.total_points]));
    const byElement = new Map(picks.picks.map((s) => [s.element, (lv.get(s.element) ?? 0) * s.multiplier]));
    const gross = picks.picks.reduce((sum, s) => sum + (byElement.get(s.element) ?? 0), 0);
    const hit = hitOf(entry, gw);
    return {
      entry, teamName: PEOPLE[entry][0], manager: PEOPLE[entry][1], picks, gross, hit, net: gross - hit,
      bench: picks.entry_history.points_on_bench, captain: PEOPLE[entry][2], byElement,
    };
  });

  // a manager's season: prior gameweeks are fixed numbers, the current one comes from the match events
  const finishedThrough = phase === "preseason" ? 0 : m.finished || phase === "upcoming" ? (phase === "upcoming" ? gw - 1 : gw) : gw - 1;
  const historyOf = (entry: number) => {
    const rows: Record<string, unknown>[] = [];
    let total = 0;
    for (let g = 1; g <= finishedThrough; g++) {
      const row = g === gw ? managers.find((x) => x.entry === entry)!.picks.entry_history : picksFor(entry, g).entry_history;
      const gross = g === gw ? row.points : priorGross(entry, g);
      total += gross - hitOf(entry, g);
      rows.push({ event: g, points: gross, total_points: total, rank: 1000 * g, overall_rank: 200_000 - entry * 1000 - g * 5000, bank: 14, value: 1000 + entry, event_transfers: hitOf(entry, g) ? 2 : 0, event_transfers_cost: hitOf(entry, g), points_on_bench: row.points_on_bench ?? 3 });
    }
    return { current: rows, past: [{ season_name: "2025/26", total_points: 2200 + entry * 7, rank: 150_000 + entry * 1000 }], chips: entry === 7 ? [{ name: "wildcard", event: 3 }] : entry === 2 ? [{ name: "bboost", event: 2 }] : [] };
  };

  const totalAt = (entry: number, g: number) => {
    let total = 0;
    for (let k = 1; k <= g; k++) total += (k === gw ? managers.find((x) => x.entry === entry)!.gross : priorGross(entry, k)) - hitOf(entry, k);
    return total;
  };
  const standingsAt = (g: number, includeLive: boolean): StandingRow[] => {
    const rowsNow = ENTRIES.map((entry) => {
      const mgr = managers.find((x) => x.entry === entry)!;
      const evt = includeLive && g === gw ? mgr.net : g === gw ? 0 : priorGross(entry, g) - hitOf(entry, g);
      const before = totalAt(entry, g - 1);
      return { entry, total: before + evt, event_total: evt, before };
    });
    const rank = (key: "total" | "before") => [...rowsNow].sort((a, b) => b[key] - a[key] || a.entry - b.entry).map((r, i) => [r.entry, i + 1] as const);
    const now_ = new Map(rank("total"));
    const was = new Map(rank("before"));
    return rowsNow
      .map((r) => ({ entry: r.entry, entry_name: PEOPLE[r.entry][0], player_name: PEOPLE[r.entry][1], rank: now_.get(r.entry)!, last_rank: g === 1 ? 0 : was.get(r.entry)!, total: r.total, event_total: r.event_total, club_badge_src: null }))
      .sort((a, b) => a.rank - b.rank);
  };
  const liveNow = m.started && phase !== "upcoming";
  const standings = standingsAt(gw, liveNow);

  const savedThrough = phase === "final" ? gw - 1 : phase === "season-over" ? gw : phase === "provisional" ? gw - 1 : Math.max(0, (phase === "upcoming" ? gw - 1 : gw - 1));
  const snapshots = Array.from({ length: savedThrough }, (_, i) => i + 1).map((g) => ({ gw: g, taken_at: new Date(deadlineOf(g) + 3 * DAY + 8 * HOUR).toISOString() }));
  const leagueBody = (rows: StandingRow[]) => ({ league: { id: LEAGUE_ID, name: "The Lobster League" }, standings: { has_next: false, page: 1, results: rows }, new_entries: { has_next: false, page: 1, results: [] } });

  const has = (s: string) => (u: string) => u.includes(s);
  const routes: Routes = [
    [has("/bootstrap-static/"), bootstrap],
    [has("/leagues-classic/"), leagueBody(standings)],
    [(u) => /\/entry\/\d+\/event\/\d+\/picks\//.test(u), (u) => {
      const [, e, g] = u.match(/\/entry\/(\d+)\/event\/(\d+)\/picks\//)!;
      const entry = Number(e);
      if (!PEOPLE[entry] || Number(g) > gw || (Number(g) === gw && phase === "preseason")) return new Response("nope", { status: 404 });
      return jsonRes(picksFor(entry, Number(g)));
    }],
    [(u) => /\/entry\/\d+\/history\/$/.test(u), (u) => {
      const entry = Number(u.match(/\/entry\/(\d+)\/history\//)![1]);
      return PEOPLE[entry] ? jsonRes(historyOf(entry)) : new Response("nope", { status: 404 });
    }],
    [(u) => /\/entry\/\d+\/$/.test(u), (u) => {
      const entry = Number(u.match(/\/entry\/(\d+)\//)![1]);
      const [team, name] = PEOPLE[entry] ?? [];
      return team ? jsonRes({ id: entry, name: team, player_first_name: name.split(" ")[0], player_last_name: name.split(" ")[1], started_event: 1, current_event: gw }) : new Response("nope", { status: 404 });
    }],
    [(u) => /\/event\/\d+\/live\//.test(u), (u) => jsonRes(liveFor(Number(u.match(/\/event\/(\d+)\/live\//)![1])))],
    [has("/fixtures/?event="), (u) => jsonRes(withStats(Number(u.match(/event=(\d+)/)![1])))],
    [(u) => u.endsWith("/api/fixtures/"), sim.schedule],
    [has("/autosnapshot/"), { snapshotted: false }],
    [has("/health"), { ok: true }],
    [(u) => /\/history\/467763\/\d+$/.test(u), (u) => {
      const g = Number(u.match(/\/(\d+)$/)![1]);
      return g <= savedThrough ? jsonRes({ gw: g, taken_at: snapshots[g - 1].taken_at, league_id: LEAGUE_ID, data: leagueBody(standingsAt(g, false)) }) : new Response("none", { status: 404 });
    }],
    [(u) => u.endsWith(`/history/${LEAGUE_ID}`), { league_id: LEAGUE_ID, snapshots }],
  ];

  const fixtures = withStats(gw);
  return {
    phase, opts, now, gw, bootstrap, fixtures, schedule: sim.schedule, live: liveFor(gw), managers, standings, routes,
    truth: {
      net: (entry) => managers.find((x) => x.entry === entry)!.net,
      leader: () => standings[0],
      fixtureState: (f) => (f.finished_provisional || f.finished ? "over" : f.started ? "playing" : "upcoming"),
      liveFor, fixturesFor: withStats, picksFor,
    },
  };
}

export const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Every URL the app asked for while a world was installed, in order. */
export const requested: string[] = [];

/** Put the world behind a mocked fetch and freeze the clock at its moment. Later routes in `extra` win. */
export function install(world: World, extra: Routes = []): World {
  requested.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(world.now);
  const routes = [...extra, ...world.routes];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(typeof input === "object" && input !== null && "url" in input ? (input as { url: string }).url : input);
      requested.push(url);
      const hit = routes.find(([match]) => match(url));
      if (!hit) return new Response("nope", { status: 404 });
      const h = hit[1];
      return typeof h === "function" ? await (h as (u: string) => Response | Promise<Response>)(url) : jsonRes(h);
    }),
  );
  return world;
}

export function uninstall() {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
}

/** Visible text of rendered markup: tags, scripts and styles gone, entities decoded, whitespace collapsed. */
export function textOf(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2212;/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}
