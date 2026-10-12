import { describe, expect, it } from "vitest";
import { buildLab, captainLab, defconBankers, penaltyTakers, rotationPairs, simulatePlayer, suspensionWatch } from "@/lib/domain/lab";
import type { NextOpponent } from "@/lib/domain/tools";
import type { FplElement, ScheduledFixture } from "@/lib/domain/types";

const teams = [
  { id: 1, code: 3, name: "Arsenal", short_name: "ARS" },
  { id: 2, code: 43, name: "Man City", short_name: "MCI" },
  { id: 3, code: 8, name: "Chelsea", short_name: "CHE" },
  { id: 4, code: 94, name: "Brentford", short_name: "BRE" },
];
const el = (id: number, over: Partial<FplElement> = {}): FplElement =>
  ({ id, web_name: `P${id}`, team: 1, element_type: 3, status: "a", selected_by_percent: "10.0", ep_next: "5.0", minutes: 900, starts: 10, now_cost: 70, expected_goals_per_90: 0.3, expected_assists_per_90: 0.15, clean_sheets_per_90: 0.3, defensive_contribution_per_90: 5, ...over }) as FplElement;
const easy: NextOpponent[] = [{ short: "BRE", home: true, difficulty: 2 }];
const hard: NextOpponent[] = [{ short: "MCI", home: false, difficulty: 5 }];

describe("simulatePlayer", () => {
  it("is deterministic for a seed and different for another", () => {
    const a = simulatePlayer(el(1), easy, 10, 800, 7);
    expect(simulatePlayer(el(1), easy, 10, 800, 7)).toEqual(a);
    expect(simulatePlayer(el(1), easy, 10, 800, 8)).not.toEqual(a);
  });
  it("expects more from an easy home fixture than a hard away one, and from a better player", () => {
    expect(simulatePlayer(el(1), easy, 10, 3000, 1).mean).toBeGreaterThan(simulatePlayer(el(1), hard, 10, 3000, 1).mean + 0.4);
    expect(simulatePlayer(el(1, { expected_goals_per_90: 0.7 }), easy, 10, 3000, 1).mean).toBeGreaterThan(simulatePlayer(el(1, { expected_goals_per_90: 0.1 }), easy, 10, 3000, 1).mean);
  });
  it("gives a double gameweek about twice a single one, and more chance of a big haul", () => {
    const one = simulatePlayer(el(1), easy, 10, 4000, 3);
    const two = simulatePlayer(el(1), [...easy, ...easy], 10, 4000, 3);
    expect(two.mean).toBeGreaterThan(one.mean * 1.7);
    expect(two.p10).toBeGreaterThan(one.p10);
  });
  it("expects nothing from a player who never starts and is out", () => {
    expect(simulatePlayer(el(1, { starts: 0, minutes: 0, chance_of_playing_next_round: 0 }), easy, 10, 500, 1).mean).toBe(0);
  });
  it("keeps its probabilities in order: 15+ is rarer than 10+", () => {
    const s = simulatePlayer(el(1, { expected_goals_per_90: 0.8 }), easy, 10, 3000, 1);
    expect(s.p15).toBeLessThanOrEqual(s.p10);
    expect(s.p10).toBeGreaterThan(0);
    expect(s.p10).toBeLessThan(1);
  });
  it("lets a defender earn from clean sheets, and a goalkeeper too", () => {
    const def = simulatePlayer(el(1, { element_type: 2, expected_goals_per_90: 0.02, expected_assists_per_90: 0.05, defensive_contribution_per_90: 9 }), easy, 10, 3000, 1);
    expect(def.mean).toBeGreaterThan(3);
  });
});

describe("captainLab", () => {
  const opp = new Map<number, NextOpponent[]>([[1, easy], [2, hard], [3, easy]]);
  const world = [el(1, { team: 1, ep_next: "7.0" }), el(2, { team: 2, ep_next: "6.5", expected_goals_per_90: 0.8 }), el(3, { team: 3, ep_next: "6.0", selected_by_percent: "40.0" }), el(4, { team: 4, ep_next: "9.0" })];
  const run = (squad: number[] = []) => captainLab({ elements: world, teams }, opp, { gamesElapsed: 10, trials: 600, seed: 5, squad });

  it("only considers players who are fit and have a match", () => {
    const l = run();
    expect(l.byMean.map((c) => c.id)).not.toContain(4); // no fixture
    const injured = captainLab({ elements: [el(1, { status: "i" })], teams }, opp, { gamesElapsed: 10, trials: 100 });
    expect(injured.byMean).toEqual([]);
  });
  it("ranks three different ways", () => {
    const l = run();
    expect(l.byMean.length).toBeGreaterThan(0);
    for (const list of [l.byMean, l.byHaul, l.byCeiling]) expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    expect(l.byMean[0].mean).toBeGreaterThanOrEqual(l.byMean[l.byMean.length - 1].mean);
    expect(l.byHaul[0].p10).toBeGreaterThanOrEqual(l.byHaul[l.byHaul.length - 1].p10);
  });
  it("marks the little-owned as differentials and quotes their club and rival", () => {
    const l = run();
    const first = l.byMean.find((c) => c.id === 1)!;
    expect(first).toMatchObject({ club: "ARS", differential: true, positionId: 3 });
    expect(first.opponents).toEqual(easy);
    expect(l.byMean.find((c) => c.id === 3)?.differential).toBe(false);
  });
  it("ranks a squad's own players even when FPL expects little from them", () => {
    const l = captainLab({ elements: [...world, el(9, { team: 1, ep_next: "0.5", minutes: 10 })], teams }, opp, { gamesElapsed: 10, trials: 300, seed: 1, squad: [9, 1] });
    expect(l.inSquad.map((c) => c.id).sort()).toEqual([1, 9]);
    expect(l.inSquad[0].mean).toBeGreaterThanOrEqual(l.inSquad[1].mean);
  });
  it("gives the same answer twice", () => {
    expect(run([1])).toEqual(run([1]));
  });
});

describe("rotationPairs", () => {
  const fx = (event: number, h: number, a: number, dh: number, da: number): ScheduledFixture =>
    ({ id: event * 100 + h, event, team_h: h, team_a: a, team_h_difficulty: dh, team_a_difficulty: da, kickoff_time: null, started: false, finished: false, finished_provisional: false });
  const schedule = [fx(7, 1, 2, 2, 5), fx(7, 3, 4, 4, 2), fx(8, 2, 3, 3, 3), fx(8, 4, 1, 4, 2)];

  it("takes the easier fixture of the pair each week", () => {
    const [best] = rotationPairs(schedule, teams, 7, 2, 1);
    expect(best.perGw.every((p) => p.difficulty <= 3)).toBe(true);
    expect(best.average).toBeLessThanOrEqual(2.5);
    const arsBre = rotationPairs(schedule, teams, 7, 2, 10, false).find((p) => p.clubs.join() === "ARS,BRE")!;
    expect(arsBre.perGw.map((p) => p.difficulty)).toEqual([2, 2]);
    expect(arsBre.average).toBe(2);
  });
  it("counts a blank gameweek as the hardest", () => {
    const pairs = rotationPairs([fx(7, 1, 2, 2, 2)], teams, 7, 2, 10, false);
    const chelseaBrentford = pairs.find((p) => p.clubs.join() === "CHE,BRE")!;
    expect(chelseaBrentford.average).toBe(5);
  });
  it("is sorted, limited, and never pairs a club with itself", () => {
    const pairs = rotationPairs(schedule, teams, 7, 2, 4, false);
    expect(pairs).toHaveLength(4);
    for (let i = 1; i < pairs.length; i++) expect(pairs[i].average).toBeGreaterThanOrEqual(pairs[i - 1].average);
    for (const p of pairs) expect(p.clubs[0]).not.toBe(p.clubs[1]);
  });
  it("can list each club once, so the pairs are different ideas", () => {
    const pairs = rotationPairs(schedule, teams, 7, 2, 5);
    const clubs = pairs.flatMap((p) => p.clubs);
    expect(new Set(clubs).size).toBe(clubs.length);
    expect(pairs).toHaveLength(2); // four clubs make two pairs
  });
  it("copes with an empty schedule", () => {
    expect(rotationPairs([], teams, 7, 5, 3, false)).toHaveLength(3);
    expect(rotationPairs([], [], 7)).toEqual([]);
  });
});

describe("the trackers", () => {
  it("lists first-choice penalty takers who are fit, best first", () => {
    const list = penaltyTakers({ elements: [el(1, { penalties_order: 1, ep_next: "4.0" }), el(2, { penalties_order: 2 }), el(3, { penalties_order: 1, ep_next: "6.0" }), el(4, { penalties_order: 1, status: "i" })], teams });
    expect(list.map((p) => p.id)).toEqual([3, 1]);
  });
  it("watches players one or two yellows from a ban, nearest first", () => {
    const list = suspensionWatch({ elements: [el(1, { yellow_cards: 4 }), el(2, { yellow_cards: 3 }), el(3, { yellow_cards: 9, selected_by_percent: "30.0" }), el(4, { yellow_cards: 1 }), el(5, { yellow_cards: 7 }), el(6, { yellow_cards: 2 })], teams });
    expect(list.map((r) => [r.id, r.threshold, r.toBan])).toEqual([[3, 10, 1], [1, 5, 1], [2, 5, 2]]);
  });
  it("finds who reaches the DefCon threshold most, defenders and midfielders only, with minutes", () => {
    const list = defconBankers({ elements: [el(1, { element_type: 2, defensive_contribution_per_90: 9 }), el(2, { element_type: 3, defensive_contribution_per_90: 9 }), el(3, { element_type: 4, defensive_contribution_per_90: 12 }), el(4, { element_type: 2, defensive_contribution_per_90: 10, minutes: 100 }), el(5, { element_type: 2, defensive_contribution_per_90: 8 })], teams });
    expect(list.map((d) => d.id)).toEqual([1, 5, 2]);
    expect(list[0].share).toBeCloseTo(0.9, 2);
  });
  it("copes with players that have none of the new numbers (an older cached file)", () => {
    const bare = [{ id: 1, web_name: "Old", team: 1, element_type: 3 } as FplElement];
    expect(penaltyTakers({ elements: bare, teams })).toEqual([]);
    expect(suspensionWatch({ elements: bare, teams })).toEqual([]);
    expect(defconBankers({ elements: bare, teams })).toEqual([]);
    expect(() => captainLab({ elements: bare, teams }, new Map([[1, easy]]), { gamesElapsed: 5, trials: 50, squad: [1] })).not.toThrow();
  });
});

describe("buildLab", () => {
  it("puts everything together for one gameweek", () => {
    const lab = buildLab({ elements: [el(1)], teams }, [], new Map([[1, easy]]), 7, 6, [1]);
    expect(lab.gw).toBe(7);
    expect(lab.captain.inSquad).toHaveLength(1);
    expect(Array.isArray(lab.rotation)).toBe(true);
  });
});
