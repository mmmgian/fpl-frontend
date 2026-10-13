import { describe, expect, it } from "vitest";
import { captainLab, rotationPairs } from "@/lib/domain/lab";
import {
  buildPlanning, captainShortlist, clip, fitness, fixtureSwings, gameweeksAhead, rotationPlan, saneBootstrap, sanePicks, saneSchedule, saneStandings, setPieceOrders,
} from "@/lib/domain/planning";
import { opponentsIn } from "@/lib/domain";
import type { Bootstrap, ScheduledFixture } from "@/lib/domain/types";
import { bootstrap, events, schedule, teams } from "./planningWorld";

const lab = (bs: Bootstrap, sched: ScheduledFixture[], gw = 7) => captainLab(bs, opponentsIn(sched, bs.teams, gw), { gamesElapsed: 6, trials: 300, seed: gw });

describe("the gameweeks ahead", () => {
  it("takes up to five from the next one, in order, whatever order FPL lists them in", () => {
    expect(gameweeksAhead([...events].reverse(), 7)).toEqual([7, 8, 9, 10, 11]);
    expect(gameweeksAhead(events, 10)).toEqual([10, 11]);
    expect(gameweeksAhead(events, 12)).toEqual([]);
  });
});

describe("fixture swings", () => {
  const swings = fixtureSwings(schedule, bootstrap(), 7)!;

  it("compares the next two gameweeks with the three after, per match", () => {
    expect(swings.soonGws).toEqual([7, 8]);
    expect(swings.laterGws).toEqual([9, 10, 11]);
    const c2 = swings.easing.find((r) => r.club === "C2")!;
    expect(c2).toMatchObject({ soon: 4, later: 2, change: 2 });
    const c1 = swings.hardening.find((r) => r.club === "C1")!;
    expect(c1).toMatchObject({ soon: 2, later: 5, change: -3 });
  });

  it("shows a blank as a blank and a double as two matches, and never scores the blank", () => {
    const c4 = [...swings.easing, ...swings.hardening].find((r) => r.club === "C4");
    // C4: soon 3,3 (avg 3); later 2 (GW9), blank (GW10), 3 and 3 (GW11 double) -> 8/3 = 2.67. A swing of 0.33: below the bar.
    expect(c4).toBeUndefined();
    const all = fixtureSwings(schedule, bootstrap(), 7, { limit: 99 })!;
    const rows = [...all.easing, ...all.hardening];
    for (const r of rows) {
      for (const cell of r.cells) expect(cell.matches.length === 0 ? r.blanks : cell.matches.length >= 2 ? r.doubles : [cell.gw]).toContain(cell.gw);
    }
  });

  it("biggest swing first, and only swings worth a move", () => {
    const changes = swings.easing.map((r) => r.change);
    expect([...changes].sort((a, b) => b - a)).toEqual(changes);
    expect(swings.easing.every((r) => r.change >= 0.5)).toBe(true);
    expect(swings.hardening.every((r) => r.change <= -0.5)).toBe(true);
  });

  it("has nothing to say when the window is too short, or nothing is scheduled in it", () => {
    expect(fixtureSwings(schedule, bootstrap(), 10)).toBeNull();                 // two gameweeks left
    expect(fixtureSwings([], bootstrap(), 7)).toBeNull();                        // schedule not out yet
    expect(fixtureSwings(schedule, { ...bootstrap(), teams: [] }, 7)).toBeNull(); // no clubs at all
  });

  it("leaves out a club with no match on one side rather than inventing a difficulty", () => {
    const only = schedule.filter((f) => !(f.event !== null && f.event >= 9 && (f.team_h === 5 || f.team_a === 5)));
    const all = fixtureSwings(only, bootstrap(), 7, { limit: 99 })!;
    expect([...all.easing, ...all.hardening].some((r) => r.club === "C5")).toBe(false);
  });
});

describe("rotation pairs", () => {
  it("never starts a club that has no fixture, and says so when neither plays", () => {
    // C3 and C4 both blank in gameweek 10.
    const pairs = rotationPairs(schedule, teams, 7, 5, 99, false);
    const c34 = pairs.find((p) => [...p.clubs].sort().join() === "C3,C4")!;
    const gw10 = c34.perGw.find((w) => w.gw === 10)!;
    expect(gw10.blank).toBe(true);
    for (const p of pairs) for (const w of p.perGw) if (!w.blank) expect(schedule.some((f) => f.event === w.gw && [f.team_h, f.team_a].includes(teams.find((t) => t.short_name === w.club)!.id))).toBe(true);
  });

  it("plans each week with the club that actually plays the easier match, and marks doubles", () => {
    const plan = rotationPlan(schedule, bootstrap(), 7, { limit: 99 })!;
    expect(plan.gws).toEqual([7, 8, 9, 10, 11]);
    for (const p of plan.pairs) for (const w of p.weeks) if (w.club) expect(p.clubs).toContain(w.club);
    // Only clubs 3 and 4: they blank together in gameweek 10 and both play twice in 11.
    const two = rotationPlan(schedule, { ...bootstrap(), teams: teams.filter((t) => t.id === 3 || t.id === 4) }, 7)!;
    const [c34] = two.pairs;
    expect(c34.weeks.find((w) => w.gw === 10)).toEqual({ gw: 10, club: null, difficulty: null, matches: 0 });
    expect(c34.weeks.find((w) => w.gw === 11)!.matches).toBe(2);
    expect(c34.blanks).toBe(1);
    expect(c34.average).toBeGreaterThanOrEqual(3); // the blank counts as the hardest, never as an easy week
  });

  it("is absent with too few gameweeks, a gap in them, or nothing scheduled", () => {
    expect(rotationPlan(schedule, bootstrap(), 11)).toBeNull();
    expect(rotationPlan(schedule, { ...bootstrap(), events: events.filter((e) => e.id !== 8) }, 7)).toBeNull();
    expect(rotationPlan([], bootstrap(), 7)).toBeNull();
  });
});

describe("the captain shortlist", () => {
  it("answers three questions from the lab's simulation, without running another", () => {
    const bs = bootstrap();
    const c = captainLab(bs, opponentsIn(schedule, bs.teams, 7), { gamesElapsed: 6, trials: 300, seed: 7 });
    const s = captainShortlist(c, schedule, bs.teams, 7, 300)!;
    expect(s.safest).toEqual(c.byMean.slice(0, 5));
    expect(s.haul).toEqual(c.byHaul.slice(0, 5));
    expect(s.punt).toEqual(c.byCeiling.slice(0, 5));
    expect(s.trials).toBe(300);
    expect(s.blanks).toEqual([]);
    expect(s.doubles).toEqual([]);
  });

  it("names the clubs that blank (whose players are left out) and those that play twice", () => {
    const bs = bootstrap();
    const sched = [...schedule.filter((f) => !(f.event === 7 && f.team_h === 5)), { ...schedule[0], id: 900, team_h: 3, team_a: 1 }];
    const s = captainShortlist(lab(bs, sched), sched, bs.teams, 7, 300)!;
    expect(s.blanks).toEqual(["C5", "C6"]);
    expect(s.doubles).toEqual(["C1", "C3"]);
    for (const p of [...s.safest, ...s.haul, ...s.punt]) expect([5, 6]).not.toContain(p.teamId);
    const double = s.safest.find((p) => p.teamId === 1);
    if (double) expect(double.opponents).toHaveLength(2);
  });

  it("leaves out anyone under a 75% chance of playing", () => {
    const bs = bootstrap();
    for (const e of bs.elements) if (e.team === 1) Object.assign(e, { status: "d", chance_of_playing_next_round: 50 });
    const s = captainShortlist(lab(bs, schedule), schedule, bs.teams, 7, 300)!;
    expect([...s.safest, ...s.haul, ...s.punt].some((p) => p.teamId === 1)).toBe(false);
  });

  it("is absent pre-season, when nobody has minutes to simulate", () => {
    const bs = bootstrap();
    for (const e of bs.elements) e.minutes = 0;
    expect(captainShortlist(lab(bs, schedule), schedule, bs.teams, 7, 300)).toBeNull();
  });

  it("doesn't call a gameweek that isn't scheduled yet a blank for everyone", () => {
    const bs = bootstrap();
    const c = lab(bs, schedule);
    expect(captainShortlist(c, [], bs.teams, 7, 300)?.blanks ?? []).toEqual([]);
  });
});

describe("set pieces", () => {
  const rows = setPieceOrders(bootstrap())!;

  it("lists each club's order as FPL gives it, first choice first, with exact names", () => {
    expect(rows.map((r) => r.club)).toEqual(["C1", "C2"]);
    const c1 = rows[0];
    expect(c1.penalties.map((k) => [k.name, k.order])).toEqual([["P12", 1], ["P11", 2]]);
    expect(c1.freeKicks.map((k) => k.name)).toEqual(["P11", "P12"]);
    expect(c1.corners.map((k) => k.name)).toEqual(["P12"]);
  });

  it("flags who is doubtful (with FPL's chance) and who is out", () => {
    expect(rows[0].penalties[1]).toMatchObject({ name: "P11", fitness: "doubt", chance: 50 });
    expect(rows[1].penalties[0]).toMatchObject({ name: "P22", fitness: "out", chance: 0 });
    expect(fitness({ status: "s" })).toBe("out");
    expect(fitness({ status: "n" })).toBe("out");
    expect(fitness({})).toBe("fit");
  });

  it("ignores orders that aren't real (zero, negative, NaN) and players at clubs that don't exist", () => {
    const bs = bootstrap();
    bs.elements.push({ id: 500, web_name: "Ghost", team: 99, element_type: 4, penalties_order: 1 });
    bs.elements.find((e) => e.id === 31)!.penalties_order = 0;
    bs.elements.find((e) => e.id === 32)!.penalties_order = Number.NaN;
    bs.elements.find((e) => e.id === 41)!.corners_and_indirect_freekicks_order = -1;
    expect(setPieceOrders(bs)!.map((r) => r.club)).toEqual(["C1", "C2"]);
  });

  it("is absent when FPL lists nobody (or the data predates these fields)", () => {
    const bs = bootstrap();
    for (const e of bs.elements) for (const k of ["penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order"] as const) delete e[k];
    expect(setPieceOrders(bs)).toBeNull();
  });
});

describe("all the planning tools together", () => {
  it("keeps every tool it can work out and drops only the ones it can't", () => {
    const bs = bootstrap();
    const all = buildPlanning(bs, schedule, 7, { lab: lab(bs, schedule), trials: 300 })!;
    expect(all.captain && all.swings && all.rotation && all.setPieces).toBeTruthy();
    // no schedule: only the set pieces are left
    expect(buildPlanning(bs, null, 7, null)).toMatchObject({ captain: null, swings: null, rotation: null });
    // season over: nothing ahead, still the set pieces
    expect(buildPlanning(bs, schedule, null, null)!.setPieces).not.toBeNull();
    // and nothing at all gives null rather than an empty shell
    expect(buildPlanning({ events: [], teams: [], elements: [] }, null, null, null)).toBeNull();
  });

  it("one tool that throws doesn't take the others down", () => {
    const bs = bootstrap();
    const broken = { byMean: null } as unknown as Parameters<typeof captainShortlist>[0];
    const all = buildPlanning(bs, schedule, 7, { lab: broken, trials: 300 })!;
    expect(all.captain).toBeNull();
    expect(all.swings).not.toBeNull();
  });
});

describe("guards against malformed FPL data", () => {
  it("drops players without an id, a name, a club or a position, and numbers that aren't numbers, keeping everything else", () => {
    const raw = {
      events: [{ id: 7, deadline_time: "2026-10-17T10:00:00Z", name: null, is_next: true }, { id: "x" }, null],
      teams: [{ id: 1, code: 10, name: "Club 1", short_name: null }, { name: "No id" }],
      elements: [
        { id: 1, web_name: "Fine", team: 1, element_type: 3, now_cost: Number.NaN, minutes: "90", ict_index: "4.2", status: 7, chance_of_playing_next_round: "50" },
        { id: 2, web_name: null, team: 1, element_type: 3 },
        { id: 3, web_name: "   ", team: 1, element_type: 3 },
        { id: 4, web_name: "NoPos", team: 1, element_type: 9 },
        { web_name: "NoId", team: 1, element_type: 3 },
        null,
      ],
    } as unknown as Bootstrap;
    const bs = saneBootstrap(raw);
    expect(bs.events).toHaveLength(1);
    expect(bs.events[0]).toMatchObject({ id: 7, name: "Gameweek 7", is_next: true, is_current: false });
    expect(bs.teams).toEqual([{ id: 1, code: 10, name: "Club 1", short_name: "Club 1" }]);
    expect(bs.elements).toHaveLength(1);
    const e = bs.elements[0] as unknown as Record<string, unknown>;
    expect(e).toMatchObject({ id: 1, web_name: "Fine", ict_index: "4.2" });
    expect("now_cost" in e || "minutes" in e || "status" in e || "chance_of_playing_next_round" in e).toBe(false);
  });

  it("survives a bootstrap that is missing its lists altogether", () => {
    expect(saneBootstrap({} as Bootstrap)).toMatchObject({ events: [], teams: [], elements: [] });
    expect(saneBootstrap(null as unknown as Bootstrap)).toMatchObject({ events: [], teams: [], elements: [] });
  });

  it("tidies the schedule: drops fixtures without clubs, reads odd difficulties as neutral", () => {
    expect(saneSchedule(null)).toBeNull();
    expect(saneSchedule({})).toBeNull();
    const out = saneSchedule([{ ...schedule[0], team_h_difficulty: 9, team_a_difficulty: null }, { id: 2 }, null])!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ team_h_difficulty: 3, team_a_difficulty: 3 });
  });

  it("reads league rows only when they are there, and names what isn't", () => {
    expect(saneStandings(null)).toEqual([]);
    expect(saneStandings({ league: {} })).toEqual([]);
    expect(saneStandings({ standings: { results: "nope" } })).toEqual([]);
    const rows = saneStandings({ standings: { results: [{ entry: 5, entry_name: "", player_name: null, rank: "1", total: Number.NaN }, { entry_name: "No entry" }] } });
    expect(rows).toEqual([expect.objectContaining({ entry: 5, entry_name: "—", player_name: "—", rank: 0, total: 0 })]);
  });

  it("reads picks only when they are there", () => {
    expect(sanePicks(null)).toBeNull();
    expect(sanePicks({ active_chip: null })).toBeNull();
    expect(sanePicks({ picks: [{ element: 1, multiplier: 2, is_captain: true }, { element: "x", multiplier: 1 }, null] })).toEqual([{ element: 1, multiplier: 2, is_captain: true, is_vice_captain: false }]);
  });

  it("cuts a query without splitting a character in two", () => {
    expect(clip("😀".repeat(50), 40)).toBe("😀".repeat(40));
    expect(clip("abc", 40)).toBe("abc");
  });
});
